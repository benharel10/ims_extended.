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

export async function generatePurchaseOrder(items: { itemId: number, quantity: number }[]) {
    try {
        if (items.length === 0) return { success: false, error: 'No items selected' };

        const poNumber = `PO-${Date.now()}`; // Simple unique ID

        // Create PO
        const po = await prisma.purchaseOrder.create({
            data: {
                poNumber,
                supplier: 'General Supplier', // Default
                status: 'Draft',
                lines: {
                    create: items.map(i => ({
                        itemId: i.itemId,
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

export async function createEmptyPO(supplier: string) {
    try {
        const poNumber = `PO-${Date.now()}`;
        const po = await prisma.purchaseOrder.create({
            data: {
                poNumber,
                supplier,
                status: 'Draft'
            }
        });
        return { success: true, data: po };
    } catch (error) {
        return { success: false, error: 'Failed to create PO' };
    }
}

export async function addPOLine(poId: number, itemId: number, quantity: number, cost: number) {
    try {
        // Check if item already exists in PO, if so update qty
        const existing = await prisma.pOLine.findFirst({
            where: { poId, itemId }
        });

        if (existing) {
            await prisma.pOLine.update({
                where: { id: existing.id },
                data: { quantity: { increment: quantity } } // Add to existing
            });
        } else {
            await prisma.pOLine.create({
                data: {
                    poId,
                    itemId,
                    quantity,
                    unitCost: cost,
                    received: 0
                }
            });
        }
        revalidatePath(`/purchasing/${poId}`);
        return { success: true };
    } catch (error) {
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

                const newReceived = line.received + rec.qty;

                // Update Line
                await tx.pOLine.update({
                    where: { id: rec.lineId },
                    data: { received: newReceived }
                });

                // Add to Global Stock
                await tx.item.update({
                    where: { id: line.itemId },
                    data: { currentStock: { increment: rec.qty } }
                });

                // Add to Specific Warehouse Stock
                await tx.itemStock.upsert({
                    where: {
                        itemId_warehouseId: {
                            itemId: line.itemId,
                            warehouseId: warehouseId
                        }
                    },
                    update: {
                        quantity: { increment: rec.qty }
                    },
                    create: {
                        itemId: line.itemId,
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
