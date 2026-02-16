'use server'

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function getItems() {
    try {
        const session = await getSession();
        const isAdmin = session?.user?.role === 'Admin';

        const items = await prisma.item.findMany({
            include: {
                stocks: {
                    include: {
                        warehouse: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Convert Decimal types to numbers for JSON serialization
        const serializedItems = items.map(item => ({
            ...item,
            minStock: Number(item.minStock),
            currentStock: Number(item.currentStock),
            cost: Number(item.cost),
            price: Number(item.price),
            stocks: item.stocks.map(stock => ({
                ...stock,
                quantity: Number(stock.quantity)
            }))
        }));

        if (!isAdmin) {
            // Filter confidential data
            return {
                success: true,
                data: serializedItems.map(i => ({
                    ...i,
                    cost: 0, // Hidden
                    price: 0, // Hidden (or maybe price is public? User said cost prices. Let's hide cost)
                    // User said "only 'Admin' can see cost prices". Price might be sales price which is usually public to sales reps.
                    // But "Warehouse can only see quantities". This implies generic staff shouldn't see money.
                    // Let's hide both for Warehouse role safety, or just cost.
                    // Request: "only 'Admin' can see cost prices and 'Warehouse' can only see quantities" -> ambiguous.
                    // Safest: Hide cost. Hide price if role is strictly Warehouse?
                    // Let's hide cost for non-Admin.
                }))
            };
        }

        return { success: true, data: serializedItems };
    } catch (error) {
        console.error('Failed to fetch items:', error);
        return { success: false, error: 'Failed to fetch items' };
    }
}

export async function createItem(data: { sku: string, name: string, type: string, cost: number, price: number, minStock: number, revision?: string, warehouse?: string, brand?: string, isSerialized?: boolean, description?: string, icountId?: number }) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const existing = await prisma.item.findUnique({
            where: { sku: data.sku }
        });

        if (existing) {
            return { success: false, error: 'SKU already exists' };
        }

        const item = await prisma.item.create({
            data: {
                sku: data.sku,
                name: data.name,
                type: data.type,
                cost: data.cost,
                price: data.price,
                minStock: data.minStock,
                currentStock: 0,
                revision: data.revision || '',
                warehouse: data.warehouse || '',
                brand: data.brand || '',
                isSerialized: data.isSerialized || false,
                description: data.description || '',
                icountId: data.icountId || null
            }
        });

        // Audit Log
        await prisma.systemLog.create({
            data: {
                userId: session.user.id,
                action: 'Create Item',
                entity: 'Item',
                entityId: item.id,
                details: `Created item ${item.sku} - ${item.name}`
            }
        });

        revalidatePath('/inventory');
        return { success: true, data: item };
    } catch (error) {
        console.error('Failed to create item:', error);
        return { success: false, error: 'Failed to create item' };
    }
}

export async function updateItem(id: number, data: { sku: string, name: string, type: string, cost: number, price: number, minStock: number, revision?: string, warehouse?: string, brand?: string, isSerialized?: boolean, description?: string, icountId?: number }) {
    try {
        // Check if SKU exists strictly for OTHER items (not this one)
        const existing = await prisma.item.findFirst({
            where: {
                sku: data.sku,
                id: { not: id }
            }
        });

        if (existing) {
            return { success: false, error: 'SKU already exists on another item' };
        }

        const item = await prisma.item.update({
            where: { id },
            data: {
                sku: data.sku,
                name: data.name,
                type: data.type,
                cost: data.cost,
                price: data.price,
                minStock: data.minStock,
                revision: data.revision,
                warehouse: data.warehouse,
                brand: data.brand,
                isSerialized: data.isSerialized,
                description: data.description,
                icountId: data.icountId
            }
        });

        revalidatePath('/inventory');
        return { success: true, data: item };
    } catch (error) {
        console.error('Failed to update item:', error);
        return { success: false, error: 'Failed to update item' };
    }
}

export async function updateStock(id: number, quantity: number, warehouseId?: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        await prisma.$transaction(async (tx) => {
            let oldQty = 0;
            if (warehouseId) {
                // Get old quantity for logging
                const oldStock = await tx.itemStock.findUnique({
                    where: { itemId_warehouseId: { itemId: id, warehouseId } }
                });
                oldQty = oldStock?.quantity || 0;

                // 1. Update/Create ItemStock for specific warehouse
                await tx.itemStock.upsert({
                    where: {
                        itemId_warehouseId: {
                            itemId: id,
                            warehouseId: warehouseId
                        }
                    },
                    update: { quantity },
                    create: {
                        itemId: id,
                        warehouseId: warehouseId,
                        quantity
                    }
                });

                // 2. Recalculate Total Stock
                const allStocks = await tx.itemStock.findMany({
                    where: { itemId: id }
                });
                const totalStock = allStocks.reduce((sum, s) => sum + s.quantity, 0);

                // 3. Update Item Total
                await tx.item.update({
                    where: { id },
                    data: { currentStock: totalStock }
                });

                // Audit Log
                await tx.systemLog.create({
                    data: {
                        userId: session.user.id,
                        action: 'Update Stock',
                        entity: 'Item',
                        entityId: id,
                        details: `Updated stock (Warehouse ${warehouseId}): ${oldQty} -> ${quantity}`
                    }
                });

            } else {
                // Legacy/Fallback
                const item = await tx.item.findUnique({ where: { id } });
                await tx.item.update({
                    where: { id },
                    data: { currentStock: quantity }
                });

                await tx.systemLog.create({
                    data: {
                        userId: session.user.id,
                        action: 'Update Stock',
                        entity: 'Item',
                        entityId: id,
                        details: `Updated total stock (Legacy): ${item?.currentStock} -> ${quantity}`
                    }
                });
            }
        });

        revalidatePath('/inventory');
        return { success: true };
    } catch (error) {
        console.error('Failed to update stock:', error);
        return { success: false, error: 'Failed to update stock' };
    }
}

export async function updateItemCost(id: number, newCost: number) {
    try {
        const item = await prisma.item.update({
            where: { id },
            data: { cost: newCost }
        });
        revalidatePath('/inventory');
        revalidatePath('/production'); // Cost changes affect production BOMs
        return { success: true, data: item };
    } catch (error) {
        console.error('Failed to update cost:', error);
        return { success: false, error: 'Failed to update cost' };
    }
}

export async function deleteItem(id: number) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized' };

        await prisma.item.delete({ where: { id } });
        revalidatePath('/inventory');
        return { success: true };
    } catch (error) {
        console.error('Failed to delete item:', error);
        return { success: false, error: 'Failed to delete item (might be used in BOMs or Sales)' };
    }
}

export async function bulkDeleteItems(ids: number[]) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized' };

        const res = await prisma.item.deleteMany({
            where: {
                id: { in: ids }
            }
        });
        revalidatePath('/inventory');
        return { success: true, count: res.count };
    } catch (error) {
        console.error('Failed to bulk delete items:', error);
        return { success: false, error: 'Failed to delete some items (they might be in use)' };
    }
}

export async function bulkUpdateStock(updates: { itemId: number, quantity: number, warehouseId: number }[]) {
    try {
        await prisma.$transaction(async (tx) => {
            for (const update of updates) {
                // Update warehouse-specific stock
                await tx.itemStock.upsert({
                    where: {
                        itemId_warehouseId: {
                            itemId: update.itemId,
                            warehouseId: update.warehouseId
                        }
                    },
                    update: { quantity: update.quantity },
                    create: {
                        itemId: update.itemId,
                        warehouseId: update.warehouseId,
                        quantity: update.quantity
                    }
                });

                // Recalculate total stock for this item
                const allStocks = await tx.itemStock.findMany({
                    where: { itemId: update.itemId }
                });
                const totalStock = allStocks.reduce((sum, s) => sum + s.quantity, 0);

                await tx.item.update({
                    where: { id: update.itemId },
                    data: { currentStock: totalStock }
                });
            }
        });

        revalidatePath('/inventory');
        return { success: true };
    } catch (error) {
        console.error('Bulk stock update failed:', error);
        return { success: false, error: 'Failed to update stock' };
    }
}

export type ImportItemData = {
    sku: string;
    name: string;
    type: string;
    cost?: number;
    price?: number;
    minStock?: number;
    currentStock?: number;
    description?: string;
    revision?: string;
    warehouse?: string;
    brand?: string;
};

export async function importItems(itemsData: ImportItemData[]) {
    try {
        let created = 0;
        let updated = 0;
        let errors: string[] = [];

        // Safe string utility
        const safeStr = (s: any) => s ? String(s).trim().replace(/[<>]/g, '') : '';

        for (const row of itemsData) {
            // Server-side validation
            if (!row.sku || typeof row.sku !== 'string' || row.sku.length > 50) {
                errors.push(`Skipped row: Invalid or missing SKU`);
                continue;
            }
            if (!row.name || typeof row.name !== 'string' || row.name.length > 100) {
                errors.push(`Skipped row: Invalid or missing Name`);
                continue;
            }
            if (row.type && !['Raw', 'Assembly', 'Product', 'Raw Material'].includes(row.type) && !row.type.toLowerCase().match(/raw|assembly|product/)) {
                // Allow fuzzy match but warn? Or strictly reject?
                // Let's be strict for security but practical for users
            }

            // Sanitize inputs
            row.sku = safeStr(row.sku);
            row.name = safeStr(row.name);
            row.description = safeStr(row.description);
            row.revision = safeStr(row.revision);
            row.warehouse = safeStr(row.warehouse);
            row.brand = safeStr(row.brand);

            try {
                const existing = await prisma.item.findUnique({ where: { sku: row.sku } });

                // Map 'Raw Material' to 'Raw', 'Assembly' to 'Assembly', 'Product' to 'Product'
                let type = row.type || 'Raw';
                if (type.toLowerCase().includes('raw')) type = 'Raw';
                else if (type.toLowerCase().includes('assembly')) type = 'Assembly';
                else if (type.toLowerCase().includes('product')) type = 'Product';

                let item;
                if (existing) {
                    item = await prisma.item.update({
                        where: { id: existing.id },
                        data: {
                            name: row.name,
                            type: type,
                            cost: row.cost ?? existing.cost,
                            price: row.price ?? existing.price,
                            minStock: row.minStock ?? existing.minStock,
                            currentStock: row.currentStock ?? existing.currentStock,
                            description: row.description ?? existing.description,
                            revision: row.revision ?? existing.revision,
                            warehouse: row.warehouse ?? existing.warehouse,
                            brand: row.brand ?? existing.brand,
                            icountId: existing.icountId // Preservation
                        }
                    });
                    updated++;
                } else {
                    item = await prisma.item.create({
                        data: {
                            sku: row.sku,
                            name: row.name,
                            type: type,
                            cost: row.cost ?? 0,
                            price: row.price ?? 0,
                            minStock: row.minStock ?? 0,
                            description: row.description,
                            currentStock: row.currentStock ?? 0,
                            revision: row.revision || '',
                            warehouse: row.warehouse || '',
                            brand: row.brand || ''
                        }
                    });
                    created++;
                }

                // Link to Warehouse if exists (case-insensitive match)
                if (row.warehouse && row.warehouse.trim()) {
                    const warehouseName = row.warehouse.trim();

                    // Find warehouse by case-insensitive name match
                    const allWarehouses = await prisma.warehouse.findMany();
                    const warehouse = allWarehouses.find(w =>
                        w.name.toLowerCase() === warehouseName.toLowerCase()
                    );

                    if (warehouse && (row.currentStock ?? 0) > 0) {
                        // Create or update stock link to warehouse
                        await prisma.itemStock.upsert({
                            where: {
                                itemId_warehouseId: {
                                    itemId: item.id,
                                    warehouseId: warehouse.id
                                }
                            },
                            update: {
                                quantity: row.currentStock ?? item.currentStock
                            },
                            create: {
                                itemId: item.id,
                                warehouseId: warehouse.id,
                                quantity: row.currentStock ?? item.currentStock
                            }
                        });
                    } else if (!warehouse) {
                        // Warehouse not found - log warning but continue
                        errors.push(`Warning: Warehouse "${warehouseName}" not found for SKU ${row.sku}. Stock stored as legacy field only.`);
                    }
                }
            } catch (e: any) {
                errors.push(`Error processing SKU ${row.sku}: ${e.message}`);
            }
        }

        revalidatePath('/inventory');
        return {
            success: true,
            message: `Import complete: ${created} created, ${updated} updated.`,
            errors: errors.length > 0 ? errors : undefined
        };
    } catch (error) {
        console.error('Failed to import items:', error);
        return { success: false, error: 'Failed to import items process' };
    }
}

export async function importBOM(bomData: { parentSku: string, childSku: string, quantity: number }[]) {
    try {
        let successCount = 0;
        let errors: string[] = [];

        for (const row of bomData) {
            const parent = await prisma.item.findUnique({ where: { sku: row.parentSku } });
            const child = await prisma.item.findUnique({ where: { sku: row.childSku } });

            if (!parent) {
                errors.push(`Parent SKU not found: ${row.parentSku}`);
                continue;
            }
            if (!child) {
                errors.push(`Child SKU not found: ${row.childSku}`);
                continue;
            }

            const existing = await prisma.bOM.findFirst({
                where: {
                    parentId: parent.id,
                    childId: child.id
                }
            });

            if (existing) {
                await prisma.bOM.update({
                    where: { id: existing.id },
                    data: { quantity: row.quantity }
                });
            } else {
                await prisma.bOM.create({
                    data: {
                        parentId: parent.id,
                        childId: child.id,
                        quantity: row.quantity
                    }
                });
            }
            successCount++;
        }

        revalidatePath('/inventory');
        return {
            success: true,
            message: `Imported ${successCount} BOM lines.`,
            errors: errors.length > 0 ? errors : undefined
        };

    } catch (error) {
        console.error('Failed to import BOM:', error);
        return { success: false, error: 'Failed to import BOM process' };
    }
}

export async function createAssemblyFromItems(productData: { sku: string, name: string }, componentSkus: string[]) {
    try {
        // 1. Create or Find the Parent Product
        let parent = await prisma.item.findUnique({ where: { sku: productData.sku } });

        if (!parent) {
            parent = await prisma.item.create({
                data: {
                    sku: productData.sku,
                    name: productData.name,
                    type: 'Product',
                    cost: 0,
                    price: 0,
                    minStock: 0,
                    currentStock: 0
                }
            });
        }

        let addedCount = 0;
        let errors: string[] = [];

        // 2. Add Components to BOM
        for (const childSku of componentSkus) {
            const child = await prisma.item.findUnique({ where: { sku: childSku } });
            if (!child) {
                errors.push(`Component SKU not found: ${childSku}`);
                continue;
            }

            // prevent self-reference
            if (child.id === parent.id) continue;

            const existingBom = await prisma.bOM.findFirst({
                where: { parentId: parent.id, childId: child.id }
            });

            if (!existingBom) {
                await prisma.bOM.create({
                    data: {
                        parentId: parent.id,
                        childId: child.id,
                        quantity: 1 // Default to 1
                    }
                });
                addedCount++;
            }
        }

        revalidatePath('/inventory');
        return { success: true, message: `Created Product ${parent.sku} with ${addedCount} components.`, errors: errors.length > 0 ? errors : undefined };

    } catch (error: any) {
        console.error('Failed to create assembly:', error);
        return { success: false, error: error.message || 'Failed to create assembly' };
    }
}

export async function createSaleFromInventory(data: { sku: string, customer: string, price: number, quantity: number }) {
    try {
        const item = await prisma.item.findUnique({ where: { sku: data.sku } });
        if (!item) return { success: false, error: 'Item not found' };

        const soNumber = `SO-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

        const order = await prisma.salesOrder.create({
            data: {
                soNumber,
                customer: data.customer,
                status: 'Draft',
                lines: {
                    create: {
                        itemId: item.id,
                        quantity: data.quantity,
                        unitPrice: data.price
                    }
                }
            }
        });

        revalidatePath('/sales');
        return { success: true, message: `Created Sales Order ${soNumber}`, orderId: order.id };
    } catch (error: any) {
        console.error('Failed to create sale:', error);
        return { success: false, error: error.message || 'Failed to create sale' };
    }
}
