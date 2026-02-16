'use server'

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

// Reusing warehouse fetching logic
export async function getItems() {
    try {
        const items = await prisma.item.findMany({ orderBy: { name: 'asc' } });
        return { success: true, data: items };
    } catch (error) {
        return { success: false, error: 'Failed' };
    }
}

export async function getWarehouses() {
    try {
        const warehouses = await prisma.warehouse.findMany({
            orderBy: { name: 'asc' }
        });
        return { success: true, data: warehouses };
    } catch (error) {
        return { success: false, error: 'Failed to fetch warehouses' };
    }
}

export async function getLowStockItems() {
    try {
        const items = await prisma.item.findMany({
            where: {
                currentStock: {
                    lt: prisma.item.fields.minStock
                }
            },
            orderBy: {
                currentStock: 'asc' // Most critical first (lowest stock)
            }
        });

        return { success: true, data: items };
    } catch (error) {
        console.error('Failed to get low stock items:', error);
        return { success: false, error: 'Failed to retrieve low stock items' };
    }
}

export async function generatePurchaseOrder(
    items: {
        itemId?: number,
        newItemName?: string,
        newItemSku?: string,
        quantity: number
    }[],
    leadTime?: string
) {
    try {
        if (items.length === 0) return { success: false, error: 'No items selected' };

        const poNumber = `PO-${Date.now()}`; // Simple unique ID

        // Create PO
        const po = await prisma.purchaseOrder.create({
            data: {
                poNumber,
                supplier: 'General Supplier', // Default
                status: 'Draft',
                leadTime: leadTime || null,
                lines: {
                    create: items.map(i => ({
                        itemId: i.itemId || null, // Allow null for new items
                        newItemName: i.newItemName, // Store ad-hoc name
                        newItemSku: i.newItemSku,   // Store ad-hoc SKU
                        quantity: i.quantity,
                        unitCost: 0 // Fetch from item or default
                    }))
                }
            }
        });

        return { success: true, data: po };

    } catch (error: any) {
        console.error('Failed to generate PO:', error);
        return { success: false, error: error.message || 'Failed to generate PO' };
    }
}

export async function createEmptyPO(supplier: string, leadTime?: string) {
    try {
        const poNumber = `PO-${Date.now()}`;
        const po = await prisma.purchaseOrder.create({
            data: {
                poNumber,
                supplier,
                status: 'Draft',
                leadTime: leadTime || null
            }
        });
        return { success: true, data: po };
    } catch (error) {
        return { success: false, error: 'Failed to create PO' };
    }
}

export async function addPOLine(
    poId: number,
    quantity: number,
    cost: number,
    itemId?: number,
    newItemName?: string,
    newItemSku?: string
) {
    try {
        // Validation
        if (!itemId && !newItemName) return { success: false, error: 'Item ID or Name required' };

        // Check if item already exists in PO, if so update qty (Only for existing items)
        let existing = null;
        if (itemId) {
            existing = await prisma.pOLine.findFirst({
                where: { poId, itemId }
            });
        }

        if (existing) {
            await prisma.pOLine.update({
                where: { id: existing.id },
                data: { quantity: { increment: quantity } } // Add to existing
            });
        } else {
            await prisma.pOLine.create({
                data: {
                    poId,
                    itemId: itemId || null,
                    newItemName: newItemName || null,
                    newItemSku: newItemSku || null,
                    quantity,
                    unitCost: cost,
                    received: 0
                }
            });
        }
        revalidatePath(`/purchasing/${poId}`);
        return { success: true };
    } catch (error) {
        console.error('Add Line Error:', error);
        return { success: false, error: 'Failed to add line item' };
    }
}

export async function removePOLine(lineId: number) {
    try {
        await prisma.pOLine.delete({ where: { id: lineId } });
        // revalidatePath determines which page to refresh. Since we don't know the PO ID easily here without an extra query, 
        // we might rely on the client to refresh or revalidate a broader path.
        revalidatePath('/purchasing/[id]');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to remove line' };
    }
}

export async function getPurchaseOrder(id: number) {
    try {
        const po = await prisma.purchaseOrder.findUnique({
            where: { id },
            include: {
                lines: {
                    include: { item: true }
                }
            }
        });
        return { success: true, data: po };
    } catch (error) {
        return { success: false, error: 'Failed to fetch PO' };
    }
}

export async function updatePOStatus(id: number, status: string) {
    try {
        await prisma.purchaseOrder.update({
            where: { id },
            data: { status }
        });
        revalidatePath(`/purchasing/${id}`);
        revalidatePath('/purchasing');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to update status' };
    }
}

export async function getOpenPurchaseOrders() {
    try {
        const pos = await prisma.purchaseOrder.findMany({
            where: {
                status: { not: 'Completed' }
            },
            include: {
                lines: {
                    include: { item: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        return { success: true, data: pos };
    } catch (error) {
        return { success: false, error: 'Failed to fetch POs' };
    }
}

export async function receivePOItems(poId: number, items: { lineId: number, qty: number }[], warehouseId: number) {
    try {
        if (!warehouseId) throw new Error('Warehouse ID is required');

        await prisma.$transaction(async (tx) => {
            let allCompleted = true;

            const po = await tx.purchaseOrder.findUnique({
                where: { id: poId },
                include: { lines: true }
            });

            if (!po) throw new Error('PO not found');

            // Verify warehouse exists
            const warehouse = await tx.warehouse.findUnique({ where: { id: warehouseId } });
            if (!warehouse) throw new Error('Warehouse not found');

            for (const rec of items) {
                if (rec.qty <= 0) continue;

                const line = po.lines.find(l => l.id === rec.lineId);
                if (!line) continue;

                // HANDLE AD-HOC ITEMS
                let targetItemId = line.itemId;

                if (!targetItemId && (line as any).newItemName) {
                    console.log(`[receivePO] Found ad-hoc item: ${(line as any).newItemName}`);

                    // Check if item already exists by name
                    const existingItem = await tx.item.findFirst({
                        where: { name: (line as any).newItemName }
                    });

                    if (existingItem) {
                        targetItemId = existingItem.id;
                    } else {
                        // Create new item
                        const newItem = await tx.item.create({
                            data: {
                                name: (line as any).newItemName,
                                sku: (line as any).newItemSku || `ADHOC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                                type: 'Component', // Default type
                                minStock: 0,
                                currentStock: 0,
                                cost: line.unitCost || 0,
                                price: 0
                            }
                        });
                        targetItemId = newItem.id;
                        console.log(`[receivePO] Created new item: ${newItem.name} (ID: ${newItem.id})`);
                    }

                    // Link PO Line to new Item
                    await tx.pOLine.update({
                        where: { id: line.id },
                        data: { itemId: targetItemId }
                    });
                }

                if (!targetItemId) {
                    console.error(`[receivePO] Line ${line.id} has no Item ID and no New Item Name`);
                    continue;
                }

                const newReceived = line.received + rec.qty;

                // Update Line
                await tx.pOLine.update({
                    where: { id: rec.lineId },
                    data: { received: newReceived }
                });

                // Add to Global Stock
                await tx.item.update({
                    where: { id: targetItemId },
                    data: { currentStock: { increment: rec.qty } }
                });

                // Add to Specific Warehouse Stock
                await tx.itemStock.upsert({
                    where: {
                        itemId_warehouseId: {
                            itemId: targetItemId,
                            warehouseId: warehouseId
                        }
                    },
                    update: {
                        quantity: { increment: rec.qty }
                    },
                    create: {
                        itemId: targetItemId,
                        warehouseId: warehouseId,
                        quantity: rec.qty
                    }
                });
            }

            // Check if PO is fully complete
            const updatedLines = await tx.pOLine.findMany({ where: { poId } });

            for (const line of updatedLines) {
                if (line.received < line.quantity) {
                    allCompleted = false;
                    break;
                }
            }

            await tx.purchaseOrder.update({
                where: { id: poId },
                data: { status: allCompleted ? 'Completed' : 'Partial' }
            });
        });

        revalidatePath('/purchasing');
        revalidatePath('/inventory'); // Important to update inventory view too
        return { success: true };
    } catch (error: any) {
        console.error('Failed to receive items:', error);
        return { success: false, error: error.message };
    }
}
