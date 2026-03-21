'use server'

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { logError } from '@/lib/errorLogger';
import { createInvoiceInICount } from '@/lib/icount';
import { CreateSalesOrderSchema, AddSalesLineSchema, UpdateSalesStatusSchema, LinkSalesOrderSchema, parseSchema } from '@/lib/schemas';

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getSalesOrders() {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const orders = await prisma.salesOrder.findMany({
            include: {
                lines: true,
                productionRun: { include: { item: true } },
                item: true,
                shipments: true,
                purchaseOrders: true,
                productionRuns: true
            },
            orderBy: { createdAt: 'desc' },
            take: 500
        });
        return { success: true, data: orders };
    } catch (error) {
        await logError('sales.getSalesOrders', error);
        return { success: false, error: 'Failed to fetch sales orders. Please try again.' };
    }
}

export async function getSellableItems() {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const items = await prisma.item.findMany({
            where: { deletedAt: null },
            select: {
                id: true,
                sku: true,
                name: true,
                type: true,
                currentStock: true,
                price: true,
                brand: true,
                isSerialized: true
            },
            orderBy: { name: 'asc' }
        });

        return {
            success: true,
            data: items.map(item => ({
                ...item,
                currentStock: Number(item.currentStock),
                price: Number(item.price)
            }))
        };
    } catch (error) {
        await logError('sales.getSellableItems', error);
        return { success: false, error: 'Failed to fetch items. Please try again.' };
    }
}

export async function getRecentProductionRuns() {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const runs = await prisma.productionRun.findMany({
            take: 20,
            orderBy: { createdAt: 'desc' },
            include: { item: true }
        });
        return { success: true, data: runs };
    } catch (error) {
        await logError('sales.getRecentProductionRuns', error);
        return { success: false, error: 'Failed to get production runs. Please try again.' };
    }
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createSalesOrder(data: {
    customer: string;
    soNumber: string;
    productionRunId?: number;
    itemId?: number;
    quantity?: number;
}) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const p = parseSchema(CreateSalesOrderSchema, data);
        if (!p.success) return { success: false, error: p.error };

        // Atomic: create order and auto-line together
        const order = await prisma.$transaction(async (tx) => {
            const created = await tx.salesOrder.create({
                data: {
                    customer: p.data.customer,
                    soNumber: p.data.soNumber,
                    status: 'Draft',
                    productionRunId: p.data.productionRunId ?? null,
                    itemId: p.data.itemId ?? null,
                    quantity: p.data.quantity ?? null
                }
            });

            if (p.data.productionRunId) {
                const run = await tx.productionRun.findUnique({
                    where: { id: p.data.productionRunId },
                    include: { item: true }
                });
                if (run) {
                    await tx.salesLine.create({
                        data: {
                            soId: created.id,
                            itemId: run.itemId,
                            quantity: Number(run.quantity),
                            unitPrice: Number(run.item.price) || 0
                        }
                    });
                }
            }
            return created;
        });

        revalidatePath('/sales');
        return { success: true, data: order };
    } catch (error: unknown) {
        await logError('sales.createSalesOrder', error);
        const msg = error instanceof Error && error.message.includes('Unique')
            ? `SO number "${data.soNumber?.trim()}" already exists`
            : 'Failed to create sales order. Please try again.';
        return { success: false, error: msg };
    }
}

export async function linkSalesOrderDetails(data: { id: number, itemId?: number | null, quantity?: number | null, productionRunId?: number | null }) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const p = parseSchema(LinkSalesOrderSchema, data);
        if (!p.success) return { success: false, error: p.error };

        const so = await prisma.salesOrder.findUnique({ where: { id: p.data.id } });
        if (!so) return { success: false, error: 'Sales order not found' };

        if (so.status !== 'Draft') {
            return { success: false, error: 'Cannot link items to a Sales Order that is not in Draft status' };
        }

        await prisma.salesOrder.update({
            where: { id: p.data.id },
            data: {
                itemId: p.data.itemId,
                quantity: p.data.quantity,
                productionRunId: p.data.productionRunId
            }
        });

        revalidatePath('/sales');
        return { success: true };
    } catch (error) {
        await logError('sales.linkSalesOrderDetails', error);
        return { success: false, error: 'Failed to update order links. Please try again.' };
    }
}

// ─── Lines ────────────────────────────────────────────────────────────────────

export async function addSalesLine(soId: number, itemId: number, quantity: number, unitPrice: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const p = parseSchema(AddSalesLineSchema, { soId, itemId, quantity, unitPrice });
        if (!p.success) return { success: false, error: p.error };

        const so = await prisma.salesOrder.findUnique({ where: { id: soId }, select: { status: true } });
        if (so?.status !== 'Draft') {
            return { success: false, error: 'Cannot modify a Sales Order that is not in Draft status' };
        }

        // Verify item is active
        const item = await prisma.item.findFirst({ where: { id: itemId, deletedAt: null } });
        if (!item) return { success: false, error: 'Item not found or has been deactivated' };

        await prisma.salesLine.create({ data: { soId, itemId, quantity, unitPrice } });
        revalidatePath('/sales');
        return { success: true };
    } catch (error) {
        await logError('sales.addSalesLine', error);
        return { success: false, error: 'Failed to add sales line. Please try again.' };
    }
}

export async function removeSalesLine(lineId: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const line = await prisma.salesLine.findUnique({ where: { id: lineId }, select: { so: { select: { status: true } } } });
        if (line?.so?.status !== 'Draft') {
            return { success: false, error: 'Cannot modify a Sales Order that is not in Draft status' };
        }

        await prisma.salesLine.delete({ where: { id: lineId } });
        revalidatePath('/sales');
        return { success: true };
    } catch (error) {
        await logError('sales.removeSalesLine', error);
        return { success: false, error: 'Failed to remove sales line. Please try again.' };
    }
}

// ─── Status + iCount Sync ─────────────────────────────────────────────────────

const VALID_STATUSES = ['Draft', 'Confirmed', 'Shipped', 'Completed', 'Cancelled'];

export async function updateSalesOrderStatus(id: number, status: string) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const p = parseSchema(UpdateSalesStatusSchema, { id, status });
        if (!p.success) return { success: false, error: p.error };

        const order = await prisma.$transaction(async (tx) => {
            const currentOrder = await tx.salesOrder.findUnique({
                where: { id },
                include: { lines: true }
            });

            if (!currentOrder) throw new Error('Order not found');

            // If the user manually marks the SO as Completed, deduct whatever hasn't been shipped yet
            if (status === 'Completed' && currentOrder.status !== 'Completed') {
                for (const line of currentOrder.lines) {
                    const remainingToDeduct = line.quantity - line.shipped;

                    if (remainingToDeduct > 0) {
                        // 1. Deduct overall stock
                        const currentItem = await tx.item.findUnique({ where: { id: line.itemId }, select: { version: true } });
                        if (!currentItem) throw new Error(`Item not found for concurrency check`);
                        const occResult = await tx.item.updateMany({
                            where: { id: line.itemId, version: currentItem.version },
                            data: { currentStock: { decrement: remainingToDeduct }, version: { increment: 1 } }
                        });
                        if (occResult.count === 0) throw new Error('Concurrency conflict: stock was updated simultaneously. Please try again.');

                        // 2. Deduct from whichever warehouses have it
                        let remainingWhDeduct = remainingToDeduct;
                        const stocks = await tx.itemStock.findMany({
                            where: { itemId: line.itemId, quantity: { gt: 0 } },
                            orderBy: { quantity: 'desc' },
                        });
                        for (const stock of stocks) {
                            if (remainingWhDeduct <= 0) break;
                            const qtyInStock = Number(stock.quantity);
                            const ded = Math.min(qtyInStock, remainingWhDeduct);
                            await tx.itemStock.update({
                                where: { id: stock.id },
                                data: { quantity: { decrement: ded } }
                            });
                            remainingWhDeduct -= ded;
                        }

                        // 3. Update shipped quantity so it's not double-deducted
                        await tx.salesLine.update({
                            where: { id: line.id },
                            data: { shipped: line.quantity }
                        });
                    }
                }
            }

            return await tx.salesOrder.update({
                where: { id },
                data: { status }
            });
        });

        // Trigger iCount invoice on confirmation
        if (status === 'Confirmed') {
            let syncStatus = 'Success';
            let syncMessage = '';

            try {
                const result = await createInvoiceInICount(order);
                syncStatus = result.success ? 'Success' : 'Failed';
                syncMessage = result.message || (result.success ? `Created iCount ID: ${result.icountId}` : 'Unknown iCount error');

                if (!result.success) {
                    await logError('sales.iCountSync', new Error(syncMessage));
                }
            } catch (syncError) {
                syncStatus = 'Failed';
                syncMessage = syncError instanceof Error ? syncError.message : 'iCount sync threw an exception';
                await logError('sales.iCountSync', syncError);
            }

            await prisma.iCountSyncLog.create({
                data: {
                    entityType: 'Invoice',
                    entityId: id,
                    action: 'Create',
                    status: syncStatus,
                    message: syncMessage
                }
            });

            if (syncStatus === 'Failed') {
                return {
                    success: true,
                    data: order,
                    warning: 'Order confirmed, but iCount sync failed. The error has been logged — check Settings › System Logs.'
                };
            }
        }

        revalidatePath('/sales');
        return { success: true, data: order };
    } catch (error) {
        await logError('sales.updateSalesOrderStatus', error);
        return { success: false, error: 'Failed to update sales order status. Please try again.' };
    }
}

// ─── Delete (hard delete is acceptable for Sales Orders — no soft-delete model) ──
// NOTE: Items (SKUs) and BOMs use soft delete. SalesOrders use hard delete because
// they don't have a deletedAt column and are referenced via foreign keys that cascade.

export async function deleteSalesOrder(id: number) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized — Admin only' };

        // Guard: prevent deletion of non-draft orders
        const order = await prisma.salesOrder.findUnique({
            where: { id },
            select: { status: true }
        });
        if (order?.status !== 'Draft') {
            return { success: false, error: 'Only Draft sales orders can be deleted. Archive others instead.' };
        }

        await prisma.salesOrder.delete({ where: { id } });
        revalidatePath('/sales');
        return { success: true };
    } catch (error) {
        await logError('sales.deleteSalesOrder', error);
        return { success: false, error: 'Failed to delete sales order. Please try again.' };
    }
}

export async function bulkDeleteSalesOrders(ids: number[]) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized — Admin only' };

        // Guard: prevent deletion of any non-draft orders in the selection
        const nonDraft = await prisma.salesOrder.count({
            where: { id: { in: ids }, status: { not: 'Draft' } }
        });
        if (nonDraft > 0) {
            return { success: false, error: `${nonDraft} non-draft sales order(s) cannot be deleted.` };
        }

        await prisma.salesOrder.deleteMany({ where: { id: { in: ids } } });
        revalidatePath('/sales');
        return { success: true };
    } catch (error) {
        await logError('sales.bulkDeleteSalesOrders', error);
        return { success: false, error: 'Failed to delete sales orders. Please try again.' };
    }
}

// ─── Procurement & BOM ────────────────────────────────────────────────────────

export async function explodeOrderBOM(itemId: number, orderQty: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const item = await prisma.item.findUnique({ where: { id: itemId } });
        if (!item) return { success: false, error: 'Item not found' };

        // Requirements map: key -> { item, baseQuantity }
        const requirements = new Map<number, { item: any; baseQuantity: number }>();

        async function traverse(currentId: number, multiplier: number) {
            const boms = await prisma.bOM.findMany({
                where: { parentId: currentId, deletedAt: null },
                include: { child: true }
            });

            if (boms.length === 0) {
                // It's a leaf node -> raw material / base component
                const existing = requirements.get(currentId);
                if (existing) {
                    existing.baseQuantity += multiplier;
                } else {
                    const currentItem = await prisma.item.findUnique({ where: { id: currentId } });
                    if (currentItem) {
                        requirements.set(currentId, { item: currentItem, baseQuantity: multiplier });
                    }
                }
                return;
            }

            // It has children, traverse them
            for (const bom of boms) {
                await traverse(bom.childId, multiplier * Number(bom.quantity));
            }
        }

        // We only explode if it's NOT a raw item initially, but let the traverse handle it.
        // If the item itself has no BOM, it just becomes the sole requirement.
        await traverse(itemId, orderQty);

        // Calculate buffered quantity (10% extra)
        const exploded = Array.from(requirements.values()).map(req => ({
            item: req.item,
            baseQuantity: req.baseQuantity,
            requiredQuantity: Math.ceil(req.baseQuantity * 1.10)
        }));

        return { success: true, data: exploded };
    } catch (error) {
        await logError('sales.explodeOrderBOM', error);
        return { success: false, error: 'Failed to calculate BOM explosion' };
    }
}
