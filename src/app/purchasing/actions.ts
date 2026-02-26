'use server'

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { logError } from '@/lib/errorLogger';
import { CreatePOSchema, AddPOLineSchema, UpdatePOStatusSchema, parseSchema } from '@/lib/schemas';

/** Active (non-soft-deleted) items only */
const ACTIVE = { deletedAt: null };

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getItems() {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const items = await prisma.item.findMany({
            where: ACTIVE,
            orderBy: { name: 'asc' }
        });
        return { success: true, data: items };
    } catch (error) {
        await logError('purchasing.getItems', error);
        return { success: false, error: 'Failed to fetch items. Please try again.' };
    }
}

export async function getWarehouses() {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const warehouses = await prisma.warehouse.findMany({ orderBy: { name: 'asc' } });
        return { success: true, data: warehouses };
    } catch (error) {
        await logError('purchasing.getWarehouses', error);
        return { success: false, error: 'Failed to fetch warehouses. Please try again.' };
    }
}

export async function getLowStockItems() {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        // Raw query works around the Prisma limitation of comparing two columns
        const items = await prisma.$queryRaw<{ id: number; sku: string; name: string; currentStock: number; minStock: number }[]>`
            SELECT id, sku, name, "currentStock"::float, "minStock"::float
            FROM "Item"
            WHERE "deletedAt" IS NULL
              AND "currentStock" < "minStock"
            ORDER BY "currentStock" ASC
        `;

        return { success: true, data: items };
    } catch (error) {
        await logError('purchasing.getLowStockItems', error);
        return { success: false, error: 'Failed to retrieve low stock items. Please try again.' };
    }
}

export async function getOpenPurchaseOrders() {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const pos = await prisma.purchaseOrder.findMany({
            where: { status: { not: 'Completed' } },
            include: { lines: { include: { item: true } } },
            orderBy: { createdAt: 'desc' }
        });
        return { success: true, data: pos };
    } catch (error) {
        await logError('purchasing.getOpenPurchaseOrders', error);
        return { success: false, error: 'Failed to fetch purchase orders. Please try again.' };
    }
}

export async function getPurchaseOrder(id: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const po = await prisma.purchaseOrder.findUnique({
            where: { id },
            include: { lines: { include: { item: true } } }
        });
        return { success: true, data: po };
    } catch (error) {
        await logError('purchasing.getPurchaseOrder', error);
        return { success: false, error: 'Failed to fetch purchase order. Please try again.' };
    }
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function generatePurchaseOrder(
    items: {
        itemId?: number;
        newItemName?: string;
        newItemSku?: string;
        quantity: number;
    }[],
    leadTimeDays?: number
) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };
        if (items.length === 0) return { success: false, error: 'No items selected' };

        // ── Validate every line ──
        for (const item of items) {
            if (item.quantity <= 0) return { success: false, error: 'All quantities must be positive' };
            if (!item.itemId && !item.newItemName) return { success: false, error: 'Each line needs an item or a new item name' };
        }

        const poNumber = `PO-${Date.now()}`;

        const po = await prisma.purchaseOrder.create({
            data: {
                poNumber,
                supplier: 'General Supplier',
                status: 'Draft',
                leadTimeDays: leadTimeDays ?? null,
                lines: {
                    create: items.map(i => ({
                        itemId: i.itemId ?? null,
                        newItemName: i.newItemName ?? null,
                        newItemSku: i.newItemSku ?? null,
                        quantity: i.quantity,
                        unitCost: 0,
                        received: 0
                    }))
                }
            }
        });

        revalidatePath('/purchasing');
        return { success: true, data: po };
    } catch (error) {
        await logError('purchasing.generatePurchaseOrder', error);
        return { success: false, error: 'Failed to generate purchase order. Please try again.' };
    }
}

export async function createEmptyPO(supplier: string, leadTimeDays?: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const p = parseSchema(CreatePOSchema, { supplier, leadTimeDays });
        if (!p.success) return { success: false, error: p.error };

        const poNumber = `PO-${Date.now()}`;
        const po = await prisma.purchaseOrder.create({
            data: {
                poNumber,
                supplier: p.data.supplier,
                status: 'Draft',
                leadTimeDays: p.data.leadTimeDays ?? null
            }
        });
        revalidatePath('/purchasing');
        return { success: true, data: po };
    } catch (error) {
        await logError('purchasing.createEmptyPO', error);
        return { success: false, error: 'Failed to create purchase order. Please try again.' };
    }
}

// ─── PO Lines ─────────────────────────────────────────────────────────────────

export async function addPOLine(
    poId: number,
    quantity: number,
    cost: number,
    itemId?: number,
    newItemName?: string,
    newItemSku?: string
) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const p = parseSchema(AddPOLineSchema, { poId, quantity, cost, itemId, newItemName, newItemSku });
        if (!p.success) return { success: false, error: p.error };

        const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, select: { status: true } });
        if (po?.status !== 'Draft') {
            return { success: false, error: 'Cannot modify a Purchase Order that is not in Draft status' };
        }

        let existing = null;
        if (itemId) {
            existing = await prisma.pOLine.findFirst({ where: { poId, itemId } });
        }

        if (existing) {
            await prisma.pOLine.update({
                where: { id: existing.id },
                data: { quantity: { increment: quantity } }
            });
        } else {
            await prisma.pOLine.create({
                data: {
                    poId,
                    itemId: itemId ?? null,
                    newItemName: newItemName ?? null,
                    newItemSku: newItemSku ?? null,
                    quantity,
                    unitCost: cost,
                    received: 0
                }
            });
        }

        revalidatePath(`/purchasing/${poId}`);
        return { success: true };
    } catch (error) {
        await logError('purchasing.addPOLine', error);
        return { success: false, error: 'Failed to add line item. Please try again.' };
    }
}

export async function removePOLine(lineId: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const line = await prisma.pOLine.findUnique({ where: { id: lineId }, select: { po: { select: { status: true } } } });
        if (line?.po?.status !== 'Draft') {
            return { success: false, error: 'Cannot modify a Purchase Order that is not in Draft status' };
        }

        await prisma.pOLine.delete({ where: { id: lineId } });
        revalidatePath('/purchasing/[id]');
        return { success: true };
    } catch (error) {
        await logError('purchasing.removePOLine', error);
        return { success: false, error: 'Failed to remove line. Please try again.' };
    }
}

export async function deletePurchaseOrder(id: number) {
    try {
        const session = await getSession();
        if (!session?.user || session.user.role !== 'Admin') {
            return { success: false, error: 'Unauthorized: Admin access required to delete POs' };
        }

        const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { status: true } });
        if (po?.status !== 'Draft') {
            return { success: false, error: 'Cannot delete a Purchase Order that is not in Draft status' };
        }

        await prisma.purchaseOrder.delete({
            where: { id }
        });

        revalidatePath('/purchasing');
        return { success: true };
    } catch (error) {
        await logError('purchasing.deletePurchaseOrder', error);
        return { success: false, error: 'Failed to delete Purchase Order. It may have associated records.' };
    }
}

// ─── Status Update ────────────────────────────────────────────────────────────

export async function updatePOStatus(id: number, status: string) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const p = parseSchema(UpdatePOStatusSchema, { id, status });
        if (!p.success) return { success: false, error: p.error };

        await prisma.purchaseOrder.update({ where: { id }, data: { status } });
        revalidatePath(`/purchasing/${id}`);
        revalidatePath('/purchasing');
        return { success: true };
    } catch (error) {
        await logError('purchasing.updatePOStatus', error);
        return { success: false, error: 'Failed to update status. Please try again.' };
    }
}

// ─── Receive Items (full transaction + version bump) ─────────────────────────

export async function receivePOItems(
    poId: number,
    items: { lineId: number; qty: number }[],
    warehouseId: number
) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };
        if (!warehouseId || warehouseId <= 0) return { success: false, error: 'A valid warehouse is required' };
        if (items.every(i => i.qty <= 0)) return { success: false, error: 'At least one item with a positive quantity is required' };

        await prisma.$transaction(async (tx) => {
            // Validate PO exists
            const po = await tx.purchaseOrder.findUnique({
                where: { id: poId },
                include: { lines: true }
            });
            if (!po) throw new Error('Purchase order not found');
            if (po.status === 'Cancelled') throw new Error('Cannot receive against a cancelled PO');

            // Validate warehouse exists
            const warehouse = await tx.warehouse.findUnique({ where: { id: warehouseId } });
            if (!warehouse) throw new Error('Destination warehouse not found');

            let allCompleted = true;

            for (const rec of items) {
                if (rec.qty <= 0) continue;

                const line = po.lines.find(l => l.id === rec.lineId);
                if (!line) continue;

                // Handle ad-hoc (new) items
                let targetItemId = line.itemId;

                if (!targetItemId && (line as { newItemName?: string | null }).newItemName) {
                    const newItemName = (line as { newItemName: string }).newItemName;
                    const newItemSku = (line as { newItemSku?: string | null }).newItemSku;

                    const existingItem = await tx.item.findFirst({ where: { name: newItemName, deletedAt: null } });

                    if (existingItem) {
                        targetItemId = existingItem.id;
                    } else {
                        const newItem = await tx.item.create({
                            data: {
                                name: newItemName,
                                sku: newItemSku || `ADHOC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                                type: 'Raw',
                                minStock: 0,
                                currentStock: 0,
                                cost: line.unitCost || 0,
                                price: 0,
                                version: 0
                            }
                        });
                        targetItemId = newItem.id;
                    }

                    // Link PO line to the new/found item
                    await tx.pOLine.update({
                        where: { id: line.id },
                        data: { itemId: targetItemId }
                    });
                }

                if (!targetItemId) continue;

                const newReceived = line.received + rec.qty;

                // Update received quantity on the PO line
                await tx.pOLine.update({
                    where: { id: rec.lineId },
                    data: { received: newReceived }
                });

                // Increment global item stock + bump version (concurrency-safe)
                const currentItem = await tx.item.findUnique({ where: { id: targetItemId }, select: { version: true } });
                if (!currentItem) throw new Error('Item not found for concurrency check');
                const occResult = await tx.item.updateMany({
                    where: { id: targetItemId, version: currentItem.version },
                    data: {
                        currentStock: { increment: rec.qty },
                        version: { increment: 1 }
                    }
                });
                if (occResult.count === 0) throw new Error('Concurrency conflict: item was updated simultaneously. Please try again.');

                // Upsert warehouse-specific stock record
                await tx.itemStock.upsert({
                    where: { itemId_warehouseId: { itemId: targetItemId, warehouseId } },
                    update: { quantity: { increment: rec.qty } },
                    create: { itemId: targetItemId, warehouseId, quantity: rec.qty }
                });
            }

            // Determine new PO status
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
        revalidatePath('/inventory');
        return { success: true };
    } catch (error: unknown) {
        await logError('purchasing.receivePOItems', error);
        const msg = error instanceof Error ? error.message : 'Failed to receive items';
        return { success: false, error: msg };
    }
}
