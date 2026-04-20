'use server'

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { logError } from '@/lib/errorLogger';
import { CreateItemSchema, UpdateItemSchema, UpdateStockSchema, parseSchema } from '@/lib/schemas';
// ─── Helpers ────────────────────────────────────────────────────────────────

async function logAudit(userId: number, action: string, entity: string, entityId?: number, details?: any) {
    try {
        await prisma.systemLog.create({
            data: {
                userId,
                action,
                entity,
                entityId,
                details: details ? JSON.stringify(details) : null
            }
        });
    } catch (e) {
        console.error('Audit log failed', e);
    }
}

/** Filter active (non-soft-deleted) items in all queries */
const ACTIVE = { deletedAt: null };

/** Validate that SKU is non-empty and reasonable */
function validateSku(sku: string): string | null {
    if (!sku || typeof sku !== 'string') return 'SKU is required';
    const trimmed = sku.trim();
    if (trimmed.length === 0) return 'SKU cannot be empty';
    if (trimmed.length > 50) return 'SKU must be 50 characters or fewer';
    return null;
}

/**
 * Circular BOM detection.
 * Returns true if adding (parentId -> childId) would create a cycle.
 */
async function wouldCreateCycle(parentId: number, childId: number): Promise<boolean> {
    if (parentId === childId) return true;

    // Walk UP from parentId — if childId is ever an ancestor of parentId, we have a cycle
    const visited = new Set<number>();
    const queue = [parentId];

    while (queue.length > 0) {
        const current = queue.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);

        // Find all BOMs where current is the child (i.e. who does current appear IN?)
        const parentBoms = await prisma.bOM.findMany({
            where: { childId: current, deletedAt: null },
            select: { parentId: true }
        });

        for (const bom of parentBoms) {
            if (bom.parentId === childId) return true;  // cycle found
            queue.push(bom.parentId);
        }
    }

    // Also walk DOWN from childId — if parentId is ever a descendant, cycle exists
    const downQueue = [childId];
    const downVisited = new Set<number>();
    while (downQueue.length > 0) {
        const current = downQueue.pop()!;
        if (downVisited.has(current)) continue;
        downVisited.add(current);

        const childBoms = await prisma.bOM.findMany({
            where: { parentId: current, deletedAt: null },
            select: { childId: true }
        });
        for (const bom of childBoms) {
            if (bom.childId === parentId) return true;
            downQueue.push(bom.childId);
        }
    }

    return false;
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function getItems(
    page = 1, 
    limit = 50, 
    search = '', 
    filters?: { warehouseId?: number, type?: string, brand?: string, lowStock?: boolean }
) {
    try {
        const session = await getSession();
        const isAdmin = session?.user?.role === 'Admin';

        const skip = (page - 1) * limit;

        const where: any = { ...ACTIVE };
        
        // Build AND segments for filtering
        const andSegments: any[] = [];

        if (search) {
            andSegments.push({
                OR: [
                    { sku: { contains: search, mode: 'insensitive' } },
                    { name: { contains: search, mode: 'insensitive' } },
                    { brand: { contains: search, mode: 'insensitive' } },
                ]
            });
        }

        if (filters?.warehouseId) {
            andSegments.push({
                stocks: {
                    some: {
                        warehouseId: filters.warehouseId,
                        quantity: { gt: 0 }
                    }
                }
            });
        }

        if (filters?.type) {
            andSegments.push({ type: filters.type });
        }

        if (filters?.brand) {
            andSegments.push({ brand: filters.brand });
        }

        // Apply AND segments if any exist
        if (andSegments.length > 0) {
            where.AND = andSegments;
        }

        let items = await prisma.item.findMany({
            where,
            include: { stocks: { include: { warehouse: true } } },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        });

        // Handle low stock filter client-side for the current results or 
        // if we need it more strictly, we could use raw SQL.
        // For now, if lowStock is requested, we filter the results.
        // NOTE: This isn't perfect for pagination, but column-to-column comparison 
        // in Prisma where clauses is restricted.
        if (filters?.lowStock) {
            items = items.filter(i => Number(i.currentStock) < Number(i.minStock));
        }

        const totalCount = await prisma.item.count({ where });

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

        const data = !isAdmin
            ? serializedItems.map(i => ({ ...i, cost: 0 }))
            : serializedItems;

        return {
            success: true,
            data,
            pagination: {
                totalCount,
                totalPages: Math.ceil(totalCount / limit),
                currentPage: page,
                limit
            }
        };
    } catch (error) {
        await logError('getItems', error);
        return { success: false, error: 'Failed to fetch inventory. Please try again.' };
    }
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createItem(data: {
    sku: string;
    name: string;
    type: string;
    cost: number;
    price: number;
    minStock: number;
    revision?: string;
    warehouse?: string;
    brand?: string;
    isSerialized?: boolean;
    description?: string;
    icountId?: number;
    inspectionTemplateUrl?: string | null;
    inspectionTemplateName?: string | null;
}) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        // ── Server-side validation (via Zod) ──
        const p = parseSchema(CreateItemSchema, data);
        if (!p.success) return { success: false, error: p.error };

        const sku = p.data.sku;

        // Check for existing active OR soft-deleted item with same SKU
        const existing = await prisma.item.findUnique({ where: { sku } });
        if (existing) {
            if (existing.deletedAt) {
                return { success: false, error: `SKU "${sku}" belongs to a deactivated item. Contact an Admin to restore it.` };
            }
            return { success: false, error: `SKU "${sku}" already exists` };
        }

        const isAdminOrWarehouse = session.user.role === 'Admin' || session.user.role === 'Warehouse';

        const item = await prisma.item.create({
            data: {
                sku,
                name: p.data.name,
                type: p.data.type,
                cost: p.data.cost,
                price: p.data.price,
                minStock: p.data.minStock,
                currentStock: 0,
                revision: p.data.revision || '',
                warehouse: p.data.warehouse || '',
                brand: p.data.brand || '',
                isSerialized: p.data.isSerialized || false,
                description: p.data.description || '',
                icountId: p.data.icountId || null,
                inspectionTemplateUrl: isAdminOrWarehouse ? (p.data.inspectionTemplateUrl || null) : null,
                inspectionTemplateName: isAdminOrWarehouse ? (p.data.inspectionTemplateName || null) : null,
                version: 0,
            } as any
        });

        revalidatePath('/inventory');
        return { success: true, data: { ...item, cost: Number(item.cost), price: Number(item.price) } };
    } catch (error) {
        await logError('createItem', error);
        return { success: false, error: 'Failed to create item. Please try again.' };
    }
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updateItem(id: number, data: {
    sku: string;
    name: string;
    type: string;
    cost: number;
    price: number;
    minStock: number;
    revision?: string;
    warehouse?: string;
    brand?: string;
    isSerialized?: boolean;
    description?: string;
    icountId?: number;
    version?: number; // Optimistic concurrency token
    inspectionTemplateUrl?: string | null;
    inspectionTemplateName?: string | null;
}) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        // ── Server-side validation (via Zod) ──
        const p = parseSchema(UpdateItemSchema, data);
        if (!p.success) return { success: false, error: p.error };

        const sku = p.data.sku;

        // Check for SKU conflict with another item
        const checkExisting = await prisma.item.findFirst({
            where: { sku, id: { not: id }, deletedAt: null }
        });
        if (checkExisting) return { success: false, error: `SKU "${sku}" is already used by another item` };

        // ── Optimistic Concurrency Check ──
        let targetVersion: number;
        if (data.version !== undefined) {
            targetVersion = data.version;
        } else {
            const current = await prisma.item.findUnique({ where: { id }, select: { version: true } });
            if (!current) return { success: false, error: 'Item not found' };
            targetVersion = current.version;
        }

        const isAdminOrWarehouse = session.user.role === 'Admin' || session.user.role === 'Warehouse';

        const updateData: any = {
            sku,
            name: data.name.trim(),
            type: data.type,
            cost: data.cost,
            price: data.price,
            minStock: data.minStock,
            revision: data.revision,
            warehouse: data.warehouse,
            brand: data.brand,
            isSerialized: data.isSerialized,
            description: data.description,
            icountId: data.icountId,
            version: { increment: 1 }
        };

        if (isAdminOrWarehouse) {
            updateData.inspectionTemplateUrl = data.inspectionTemplateUrl;
            updateData.inspectionTemplateName = data.inspectionTemplateName;
        }

        const occResult = await prisma.item.updateMany({
            where: { id, version: targetVersion },
            data: updateData
        });

        if (occResult.count === 0) {
            return {
                success: false,
                error: 'This item was modified by another user. Please refresh the page and try again.'
            };
        }

        const item = await prisma.item.findUnique({ where: { id } });

        await logAudit(session.user.id, 'UPDATE_ITEM', 'Item', id, { 
            sku: data.sku, 
            name: data.name, 
            cost: data.cost, 
            price: data.price,
            warehouse: data.warehouse,
            isSerialized: data.isSerialized
        });

        revalidatePath('/inventory');
        return { success: true, data: item };
    } catch (error) {
        await logError('updateItem', error);
        return { success: false, error: 'Failed to update item. Please try again.' };
    }
}

// ─── Stock Updates (fully transactional) ─────────────────────────────────────

export async function updateStock(id: number, quantity: number, warehouseId?: number, location?: string) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };
        if (quantity < 0) return { success: false, error: 'Stock quantity cannot be negative' };

        await prisma.$transaction(async (tx) => {
            if (warehouseId) {
                await tx.itemStock.upsert({
                    where: { itemId_warehouseId: { itemId: id, warehouseId } },
                    update: { quantity, ...(location !== undefined ? { location: location || null } : {}) },
                    create: { itemId: id, warehouseId, quantity, location: location || null }
                });

                const allStocks = await tx.itemStock.findMany({ where: { itemId: id } });
                const totalStock = allStocks.reduce((sum, s) => sum + Number(s.quantity), 0);

                const currentItem = await tx.item.findUnique({ where: { id }, select: { version: true } });
                if (!currentItem) throw new Error('Item not found for concurrency check');
                const occResult = await tx.item.updateMany({
                    where: { id, version: currentItem.version },
                    data: { currentStock: totalStock, version: { increment: 1 } }
                });
                if (occResult.count === 0) throw new Error('Concurrency conflict: stock was updated simultaneously. Please try again.');
            } else {
                const currentItem = await tx.item.findUnique({ where: { id }, select: { version: true } });
                if (!currentItem) throw new Error('Item not found for concurrency check');
                const occResult = await tx.item.updateMany({
                    where: { id, version: currentItem.version },
                    data: { currentStock: quantity, version: { increment: 1 } }
                });
                if (occResult.count === 0) throw new Error('Concurrency conflict: stock was updated simultaneously. Please try again.');
            }
        });

        await logAudit(session.user.id, 'UPDATE_STOCK', 'Item', id, { warehouseId, quantity, location });

        revalidatePath('/inventory');
        return { success: true };
    } catch (error) {
        await logError('updateStock', error);
        return { success: false, error: 'Failed to update stock. Please try again.' };
    }
}

export async function updateItemCost(id: number, newCost: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };
        if (newCost < 0) return { success: false, error: 'Cost cannot be negative' };

        const currentItem = await prisma.item.findUnique({ where: { id }, select: { version: true } });
        if (!currentItem) return { success: false, error: 'Item not found' };
        const occResult = await prisma.item.updateMany({
            where: { id, version: currentItem.version },
            data: { cost: newCost, version: { increment: 1 } }
        });
        if (occResult.count === 0) return { success: false, error: 'Concurrency conflict: item was updated simultaneously. Please try again.' };
        const item = await prisma.item.findUnique({ where: { id } });
        revalidatePath('/inventory');
        revalidatePath('/production');
        return { success: true, data: item };
    } catch (error) {
        await logError('updateItemCost', error);
        return { success: false, error: 'Failed to update cost. Please try again.' };
    }
}

// ─── Soft Delete ─────────────────────────────────────────────────────────────

export async function deleteItem(id: number) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized — Admin only' };

        // Soft delete: stamp deletedAt rather than removing the row
        await prisma.$transaction(async (tx) => {
            const now = new Date();
            const currentItem = await tx.item.findUnique({ where: { id }, select: { version: true } });
            if (!currentItem) throw new Error('Item not found for concurrency check');
            const occResult = await tx.item.updateMany({
                where: { id, version: currentItem.version },
                data: { deletedAt: now, version: { increment: 1 } }
            });
            if (occResult.count === 0) throw new Error('Concurrency conflict: item was updated simultaneously. Please try again.');
            // Also soft-delete all BOM lines that reference this item
            await tx.bOM.updateMany({
                where: { OR: [{ parentId: id }, { childId: id }] },
                data: { deletedAt: now }
            });
        });
        await logAudit(session.user.id, 'DELETE_ITEM', 'Item', id);

        revalidatePath('/inventory');
        revalidatePath('/production');
        return { success: true };
    } catch (error) {
        await logError('deleteItem', error);
        return { success: false, error: 'Failed to deactivate item. Please try again.' };
    }
}

export async function bulkDeleteItems(ids: number[]) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized — Admin only' };

        const now = new Date();
        await prisma.$transaction(async (tx) => {
            await tx.item.updateMany({
                where: { id: { in: ids } },
                data: { deletedAt: now }
            });
            await tx.bOM.updateMany({
                where: { OR: [{ parentId: { in: ids } }, { childId: { in: ids } }] },
                data: { deletedAt: now }
            });
        });
        await logAudit(session.user.id, 'BULK_DELETE_ITEMS', 'Item', undefined, { counts: ids.length, ids });

        revalidatePath('/inventory');
        return { success: true, count: ids.length };
    } catch (error) {
        await logError('bulkDeleteItems', error);
        return { success: false, error: 'Failed to deactivate items. Please try again.' };
    }
}

// ─── Bulk Stock Update ────────────────────────────────────────────────────────

export async function bulkUpdateStock(updates: { itemId: number; quantity: number; warehouseId: number; location?: string }[]) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        for (const u of updates) {
            if (u.quantity < 0) return { success: false, error: `Stock quantity cannot be negative for item ${u.itemId}` };
        }

        await prisma.$transaction(async (tx) => {
            for (const update of updates) {
                await tx.itemStock.upsert({
                    where: { itemId_warehouseId: { itemId: update.itemId, warehouseId: update.warehouseId } },
                    update: { quantity: update.quantity, ...(update.location !== undefined ? { location: update.location || null } : {}) },
                    create: { itemId: update.itemId, warehouseId: update.warehouseId, quantity: update.quantity, location: update.location || null }
                });

                const allStocks = await tx.itemStock.findMany({ where: { itemId: update.itemId } });
                const totalStock = allStocks.reduce((sum, s) => sum + Number(s.quantity), 0);

                const currentItem = await tx.item.findUnique({ where: { id: update.itemId }, select: { version: true } });
                if (!currentItem) throw new Error('Item not found for concurrency check');
                const occResult = await tx.item.updateMany({
                    where: { id: update.itemId, version: currentItem.version },
                    data: { currentStock: totalStock, version: { increment: 1 } }
                });
                if (occResult.count === 0) throw new Error('Concurrency conflict: stock was updated simultaneously. Please try again.');
            }
        });

        await logAudit(session.user.id, 'BULK_UPDATE_STOCK', 'ItemStock', undefined, { itemCount: updates.length });

        revalidatePath('/inventory');
        return { success: true };
    } catch (error) {
        await logError('bulkUpdateStock', error);
        return { success: false, error: 'Failed to update stock. Please try again.' };
    }
}

// ─── Import Items ─────────────────────────────────────────────────────────────

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
        const session = await getSession();
        if (!session?.user?.role) return { success: false, error: 'Unauthorized' };
        if (session.user.role !== 'Admin') return { success: false, error: 'Unauthorized: Admin only' };

        // ── NOTE: Caller (page) is responsible for displaying the snapshot warning ──
        // The warning is shown before this function is called: "This will overwrite existing
        // items. Make sure you have a recent Neon DB snapshot before proceeding."

        let created = 0;
        let updated = 0;
        const errors: string[] = [];

        const safeStr = (s: unknown) => (s ? String(s).trim().replace(/[<>]/g, '') : '');

        for (const row of itemsData) {
            // ── Strict server-side validation ──
            if (!row.sku || typeof row.sku !== 'string' || row.sku.trim().length === 0) {
                errors.push(`Skipped row: SKU is empty or invalid`);
                continue;
            }
            if (row.sku.trim().length > 50) {
                errors.push(`Skipped row: SKU "${row.sku}" exceeds 50 characters`);
                continue;
            }
            if (!row.name || typeof row.name !== 'string' || row.name.trim().length === 0) {
                errors.push(`Skipped row SKU "${row.sku}": name is required`);
                continue;
            }
            if ((row.cost ?? 0) < 0) { errors.push(`Skipped SKU "${row.sku}": cost cannot be negative`); continue; }
            if ((row.price ?? 0) < 0) { errors.push(`Skipped SKU "${row.sku}": price cannot be negative`); continue; }
            if ((row.minStock ?? 0) < 0) { errors.push(`Skipped SKU "${row.sku}": minStock cannot be negative`); continue; }
            if ((row.currentStock ?? 0) < 0) { errors.push(`Skipped SKU "${row.sku}": currentStock cannot be negative`); continue; }

            row.sku = safeStr(row.sku);
            row.name = safeStr(row.name);
            row.description = safeStr(row.description);
            row.revision = safeStr(row.revision);
            row.warehouse = safeStr(row.warehouse);
            row.brand = safeStr(row.brand);

            // Normalize type
            let type = row.type || 'Raw';
            if (type.toLowerCase().includes('raw')) type = 'Raw';
            else if (type.toLowerCase().includes('assembly')) type = 'Assembly';
            else if (type.toLowerCase().includes('product')) type = 'Product';
            else type = 'Raw';

            try {
                const existing = await prisma.item.findUnique({ where: { sku: row.sku } });

                let item;
                if (existing) {
                    const occResult = await prisma.item.updateMany({
                        where: { id: existing.id, version: existing.version },
                        data: {
                            name: row.name,
                            type,
                            cost: row.cost ?? Number(existing.cost),
                            price: row.price ?? Number(existing.price),
                            minStock: row.minStock ?? Number(existing.minStock),
                            currentStock: row.currentStock ?? Number(existing.currentStock),
                            description: row.description || existing.description,
                            revision: row.revision || existing.revision,
                            warehouse: row.warehouse || existing.warehouse,
                            brand: row.brand || existing.brand,
                            deletedAt: null, // Restore if previously deleted
                            version: { increment: 1 },
                        }
                    });
                    if (occResult.count === 0) throw new Error('Concurrency conflict: item was modified during import.');
                    item = await prisma.item.findUnique({ where: { id: existing.id } });
                    if (!item) throw new Error('Item not found after update');
                    updated++;
                } else {
                    item = await prisma.item.create({
                        data: {
                            sku: row.sku,
                            name: row.name,
                            type,
                            cost: row.cost ?? 0,
                            price: row.price ?? 0,
                            minStock: row.minStock ?? 0,
                            currentStock: row.currentStock ?? 0,
                            description: row.description,
                            revision: row.revision || '',
                            warehouse: row.warehouse || '',
                            brand: row.brand || '',
                            version: 0,
                        }
                    });
                    created++;
                }

                // Link to Warehouse if specified — clear any stale entries first so we don't end up with duplicate locations
                if (row.warehouse?.trim()) {
                    const allWarehouses = await prisma.warehouse.findMany();
                    const warehouse = allWarehouses.find(
                        w => w.name.toLowerCase() === row.warehouse!.toLowerCase()
                    );
                    if (warehouse && (row.currentStock ?? 0) > 0) {
                        // Remove old ItemStock records for this item so we start clean
                        await prisma.itemStock.deleteMany({ where: { itemId: item.id } });
                        // Insert the single authoritative warehouse entry from the spreadsheet
                        await prisma.itemStock.create({
                            data: { itemId: item.id, warehouseId: warehouse.id, quantity: row.currentStock ?? Number(item.currentStock) }
                        });
                    } else if (!warehouse) {
                        errors.push(`Warning: Warehouse "${row.warehouse}" not found for SKU ${row.sku}. Stock stored as legacy field only.`);
                    }
                }
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                errors.push(`Error processing SKU "${row.sku}": ${msg}`);
                await logError('importItems.row', e);
            }
        }

        revalidatePath('/inventory');
        return {
            success: true,
            message: `Import complete: ${created} created, ${updated} updated.`,
            errors: errors.length > 0 ? errors : undefined
        };
    } catch (error) {
        await logError('importItems', error);
        return { success: false, error: 'Failed to run import. Please try again.' };
    }
}

// ─── BOM Import ───────────────────────────────────────────────────────────────

export async function importBOM(bomData: { parentSku: string; childSku: string; quantity: number }[]) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized: Admin only' };

        let successCount = 0;
        const errors: string[] = [];

        for (const row of bomData) {
            if ((row.quantity ?? 0) <= 0) {
                errors.push(`Skipped BOM row ${row.parentSku} -> ${row.childSku}: quantity must be positive`);
                continue;
            }

            const parent = await prisma.item.findFirst({ where: { sku: row.parentSku, deletedAt: null } });
            const child = await prisma.item.findFirst({ where: { sku: row.childSku, deletedAt: null } });

            if (!parent) { errors.push(`Parent SKU not found: ${row.parentSku}`); continue; }
            if (!child) { errors.push(`Child SKU not found: ${row.childSku}`); continue; }

            // ── Circular BOM check ──
            if (await wouldCreateCycle(parent.id, child.id)) {
                errors.push(`Skipped: Adding ${row.childSku} to ${row.parentSku} would create a circular BOM reference`);
                continue;
            }

            try {
                const existing = await prisma.bOM.findFirst({
                    where: { parentId: parent.id, childId: child.id }
                });

                if (existing) {
                    await prisma.bOM.update({
                        where: { id: existing.id },
                        data: { quantity: row.quantity, deletedAt: null }
                    });
                } else {
                    await prisma.bOM.create({
                        data: { parentId: parent.id, childId: child.id, quantity: row.quantity }
                    });
                }
                successCount++;
            } catch (e) {
                errors.push(`Error on BOM row ${row.parentSku} -> ${row.childSku}`);
                await logError('importBOM.row', e);
            }
        }

        revalidatePath('/inventory');
        return {
            success: true,
            message: `Imported ${successCount} BOM lines.`,
            errors: errors.length > 0 ? errors : undefined
        };
    } catch (error) {
        await logError('importBOM', error);
        return { success: false, error: 'Failed to import BOM. Please try again.' };
    }
}

// ─── Assembly from Items ──────────────────────────────────────────────────────

export async function createAssemblyFromItems(
    productData: { sku: string; name: string },
    componentSkus: string[]
) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized: Admin only' };

        const skuError = validateSku(productData.sku);
        if (skuError) return { success: false, error: skuError };
        if (!productData.name?.trim()) return { success: false, error: 'Product name is required' };

        // Look for any existing item with this SKU (including soft-deleted)
        let parent = await prisma.item.findUnique({
            where: { sku: productData.sku.trim() }
        });

        if (!parent) {
            // Genuinely new SKU — create it
            parent = await prisma.item.create({
                data: {
                    sku: productData.sku.trim(),
                    name: productData.name.trim(),
                    type: 'Product',
                    cost: 0,
                    price: 0,
                    minStock: 0,
                    currentStock: 0,
                    version: 0,
                }
            });
        } else {
            // SKU exists (active or soft-deleted) — update and restore it
            parent = await prisma.item.update({
                where: { id: parent.id },
                data: {
                    name: productData.name.trim(),
                    type: 'Product',
                    deletedAt: null, // Restore if soft-deleted
                    version: { increment: 1 },
                }
            });
        }

        let addedCount = 0;
        const errors: string[] = [];

        for (const childSku of componentSkus) {
            const child = await prisma.item.findFirst({ where: { sku: childSku, deletedAt: null } });
            if (!child) { errors.push(`Component SKU not found: ${childSku}`); continue; }
            if (child.id === parent.id) continue;

            if (await wouldCreateCycle(parent.id, child.id)) {
                errors.push(`Skipped ${childSku}: would create a circular BOM reference`);
                continue;
            }

            const existingBom = await prisma.bOM.findFirst({
                where: { parentId: parent.id, childId: child.id }
            });
            if (!existingBom) {
                await prisma.bOM.create({
                    data: { parentId: parent.id, childId: child.id, quantity: 1 }
                });
                addedCount++;
            }
        }

        revalidatePath('/inventory');
        return {
            success: true,
            message: `Created Product ${parent.sku} with ${addedCount} components.`,
            errors: errors.length > 0 ? errors : undefined
        };
    } catch (error: unknown) {
        await logError('createAssemblyFromItems', error);
        const msg = error instanceof Error ? error.message : 'Failed to create assembly';
        return { success: false, error: msg };
    }
}

// ─── Quick Sale from Inventory ────────────────────────────────────────────────

export async function createSaleFromInventory(data: {
    sku: string;
    customer: string;
    price: number;
    quantity: number;
}) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        if (data.quantity <= 0) return { success: false, error: 'Quantity must be positive' };
        if (data.price < 0) return { success: false, error: 'Price cannot be negative' };
        if (!data.customer?.trim()) return { success: false, error: 'Customer name is required' };

        const soNumber = `SO-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

        const order = await prisma.$transaction(async (tx) => {
            const item = await tx.item.findFirst({ where: { sku: data.sku, deletedAt: null } });
            if (!item) throw new Error('Item not found');

            return tx.salesOrder.create({
                data: {
                    soNumber,
                    customer: data.customer.trim(),
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
        });

        revalidatePath('/sales');
        return { success: true, message: `Created Sales Order ${soNumber}`, orderId: order.id };
    } catch (error: unknown) {
        await logError('createSaleFromInventory', error);
        const msg = error instanceof Error ? error.message : 'Failed to create sale';
        return { success: false, error: msg };
    }
}

export async function getItemHistory(itemId: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const logs = await prisma.systemLog.findMany({
            where: { entity: 'Item', entityId: itemId },
            include: { user: { select: { id: true, name: true, email: true } } },
            take: 100,
            orderBy: { createdAt: 'desc' }
        });

        // Fetch logs related to bulk updates targeting this item
        const stockLogs = await prisma.systemLog.findMany({
            where: { entity: 'ItemStock', details: { contains: `"itemId":${itemId}` } },
            include: { user: { select: { id: true, name: true, email: true } } },
            take: 100,
            orderBy: { createdAt: 'desc' }
        });

        const combined = [...logs, ...stockLogs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return { success: true, data: combined.slice(0, 100) };
    } catch (error: unknown) {
        await logError('getItemHistory', error);
        return { success: false, error: 'Failed to load history' };
    }
}
