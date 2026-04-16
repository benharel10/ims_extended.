'use server'

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { logError } from '@/lib/errorLogger';
import { CreatePOSchema, AddPOLineSchema, UpdatePOStatusSchema, UpdatePONumberSchema, parseSchema } from '@/lib/schemas';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { format } from 'date-fns';

/** Active (non-soft-deleted) items only */
const ACTIVE = { deletedAt: null };

async function logAudit(userId: number, action: string, entity: string, entityId?: number, details?: any) {
    try {
        await prisma.systemLog.create({
            data: { userId, action, entity, entityId, details: details ? JSON.stringify(details) : null }
        });
    } catch (e) {
        logError('audit', e);
    }
}

// ג”€ג”€ג”€ Read ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

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

export async function getBrands() {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const brands = await prisma.item.findMany({
            where: { brand: { not: null }, deletedAt: null },
            select: { brand: true },
            distinct: ['brand']
        });
        return { success: true, data: brands.map(b => b.brand).filter(Boolean) as string[] };
    } catch (error) {
        await logError('purchasing.getBrands', error);
        return { success: false, error: 'Failed to fetch brands. Please try again.' };
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

export async function getPurchaseOrders(includeCompleted = false) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const where: any = {};
        if (!includeCompleted) {
            where.status = { not: 'Completed' };
        }

        const pos = await prisma.purchaseOrder.findMany({
            where,
            include: { lines: { include: { item: true } }, salesOrder: true },
            orderBy: { createdAt: 'desc' },
            take: 500
        });
        return { success: true, data: pos };
    } catch (error) {
        await logError('purchasing.getPurchaseOrders', error);
        return { success: false, error: 'Failed to fetch purchase orders. Please try again.' };
    }
}

export async function getPurchaseOrder(id: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const po = await prisma.purchaseOrder.findUnique({
            where: { id },
            include: { 
                lines: { include: { item: true } }
            }
        });
        return { success: true, data: po };
    } catch (error) {
        await logError('purchasing.getPurchaseOrder', error);
        return { success: false, error: 'Failed to fetch purchase order. Please try again.' };
    }
}

// ג”€ג”€ג”€ Create ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

export async function searchItems(query: string) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };
        if (!query || query.length < 2) return { success: true, data: [] };

        const items = await prisma.item.findMany({
            where: {
                deletedAt: null,
                OR: [
                    { name: { contains: query, mode: 'insensitive' } },
                    { sku: { contains: query, mode: 'insensitive' } }
                ]
            },
            select: { id: true, name: true, sku: true, cost: true },
            take: 20,
            orderBy: { name: 'asc' }
        });
        return { success: true, data: items };
    } catch (error) {
        await logError('purchasing.searchItems', error);
        return { success: false, error: 'Failed to search items' };
    }
}

export async function getDraftSalesOrders() {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const orders = await prisma.salesOrder.findMany({
            where: { status: 'Draft' },
            select: { id: true, soNumber: true, customer: true },
            orderBy: { createdAt: 'desc' }
        });
        return { success: true, data: orders };
    } catch (error) {
        await logError('purchasing.getDraftSalesOrders', error);
        return { success: false, error: 'Failed to fetch sales orders' };
    }
}


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

        // ג”€ג”€ Validate every line ג”€ג”€
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

export async function createEmptyPO(supplier: string, leadTimeDays?: number, shippingCost?: number, salesOrderId?: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const p = parseSchema(CreatePOSchema, { supplier, leadTimeDays, shippingCost, salesOrderId });
        if (!p.success) return { success: false, error: p.error };

        const poNumber = `PO-${Date.now()}`;
        const po = await prisma.purchaseOrder.create({
            data: {
                poNumber,
                supplier: p.data.supplier,
                status: 'Draft',
                leadTimeDays: p.data.leadTimeDays ?? null,
                shippingCost: p.data.shippingCost ?? 0.0,
                salesOrderId: p.data.salesOrderId ?? null
            }
        });
        
        await logAudit(session.user.id, 'CREATE_PO', 'PurchaseOrder', po.id, { supplier: po.supplier, poNumber });

        revalidatePath('/purchasing');
        return { success: true, data: po };
    } catch (error) {
        await logError('purchasing.createEmptyPO', error);
        return { success: false, error: 'Failed to create purchase order. Please try again.' };
    }
}

// ג”€ג”€ג”€ PO Lines ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

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
        if (po?.status === 'Completed' || po?.status === 'Partial') {
            return { success: false, error: 'Cannot modify a Purchase Order that has received items (Completed or Partial)' };
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
        if (line?.po?.status === 'Completed' || line?.po?.status === 'Partial') {
            return { success: false, error: 'Cannot modify a Purchase Order that has received items (Completed or Partial)' };
        }

        await prisma.pOLine.delete({ where: { id: lineId } });
        revalidatePath('/purchasing/[id]');
        return { success: true };
    } catch (error) {
        await logError('purchasing.removePOLine', error);
        return { success: false, error: 'Failed to remove line. Please try again.' };
    }
}

export async function updatePOLine(lineId: number, quantity: number, unitCost: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        if (quantity <= 0) return { success: false, error: 'Quantity must be positive' };
        if (unitCost < 0) return { success: false, error: 'Cost cannot be negative' };

        const line = await prisma.pOLine.findUnique({ where: { id: lineId }, select: { po: { select: { status: true, id: true } } } });
        if (!line?.po) return { success: false, error: 'Line or PO not found' };
        if (line.po.status === 'Completed' || line.po.status === 'Partial') {
            return { success: false, error: 'Cannot modify a Purchase Order that has received items (Completed or Partial)' };
        }

        await prisma.pOLine.update({
            where: { id: lineId },
            data: { quantity, unitCost }
        });

        revalidatePath(`/purchasing/${line.po.id}`);
        return { success: true };
    } catch (error) {
        await logError('purchasing.updatePOLine', error);
        return { success: false, error: 'Failed to update line. Please try again.' };
    }
}

export async function deletePurchaseOrder(id: number) {
    try {
        const session = await getSession();
        if (!session?.user || session.user.role !== 'Admin') {
            return { success: false, error: 'Unauthorized: Admin access required to delete POs' };
        }

        const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { status: true } });
        if (po?.status === 'Completed' || po?.status === 'Partial') {
            return { success: false, error: 'Cannot delete a Purchase Order that has received items (Completed or Partial)' };
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

export async function deleteMultiplePOs(ids: number[]) {
    try {
        const session = await getSession();
        if (!session?.user || session.user.role !== 'Admin') {
            return { success: false, error: 'Unauthorized: Admin access required to delete POs' };
        }

        const pos = await prisma.purchaseOrder.findMany({ where: { id: { in: ids } } });
        const invalidPOs = pos.filter(po => po.status === 'Completed' || po.status === 'Partial');
        if (invalidPOs.length > 0) {
            return { success: false, error: 'Cannot delete Purchase Orders that are Completed or Partial' };
        }

        await prisma.purchaseOrder.deleteMany({
            where: { id: { in: ids } }
        });

        revalidatePath('/purchasing');
        return { success: true };
    } catch (error) {
        await logError('purchasing.deleteMultiplePOs', error);
        return { success: false, error: 'Failed to delete Purchase Orders.' };
    }
}

export async function updatePODueDate(id: number, dueDateStr: string) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const po = await prisma.purchaseOrder.findUnique({ where: { id } });
        if (!po) return { success: false, error: 'PO not found' };

        if (po.status !== 'Draft' && po.status !== 'Sent') {
            return { success: false, error: 'Can only update due date for Draft or Sent POs' };
        }

        const createdAt = new Date(po.createdAt);
        const dueDate = new Date(dueDateStr);
        // Reset times for accurate day diff
        createdAt.setHours(0,0,0,0);
        dueDate.setHours(0,0,0,0);
        
        const diffTime = dueDate.getTime() - createdAt.getTime();
        let leadTimeDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (leadTimeDays < 0) leadTimeDays = 0;

        await prisma.purchaseOrder.update({
            where: { id },
            data: { leadTimeDays }
        });

        revalidatePath('/purchasing');
        return { success: true };
    } catch (error) {
        await logError('purchasing.updatePODueDate', error);
        return { success: false, error: 'Failed to update due date' };
    }
}

export async function updatePONumber(id: number, poNumber: string) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const p = parseSchema(UpdatePONumberSchema, { id, poNumber });
        if (!p.success) return { success: false, error: p.error };

        // Check if number is taken
        const existing = await prisma.purchaseOrder.findUnique({ where: { poNumber: p.data.poNumber } });
        if (existing && existing.id !== id) {
            return { success: false, error: 'That PO Number is already in use' };
        }

        await prisma.purchaseOrder.update({
            where: { id },
            data: { poNumber: p.data.poNumber }
        });

        // Audit log
        await prisma.systemLog.create({
            data: {
                userId: session.user.id,
                action: 'UPDATE_PO_NUMBER',
                entity: 'PurchaseOrder',
                entityId: id,
                details: JSON.stringify({ poNumber: p.data.poNumber })
            }
        });

        revalidatePath(`/purchasing/${id}`);
        revalidatePath('/purchasing');
        return { success: true };
    } catch (error) {
        await logError('purchasing.updatePONumber', error);
        return { success: false, error: 'Failed to update PO number' };
    }
}

// ג”€ג”€ג”€ Status Update ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

export async function updatePOStatus(id: number, status: string) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const p = parseSchema(UpdatePOStatusSchema, { id, status });
        if (!p.success) return { success: false, error: p.error };

        await prisma.purchaseOrder.update({ where: { id }, data: { status } });
        await logAudit(session.user.id, 'UPDATE_STATUS', 'PurchaseOrder', id, { status });
        
        revalidatePath(`/purchasing/${id}`);
        revalidatePath('/purchasing');
        return { success: true };
    } catch (error) {
        await logError('purchasing.updatePOStatus', error);
        return { success: false, error: 'Failed to update status. Please try again.' };
    }
}

// ג”€ג”€ג”€ Receive Items (full transaction + version bump) ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

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
                data: { 
                    status: allCompleted ? 'Completed' : 'Partial',
                    deliveredAt: allCompleted ? new Date() : null
                }
            });
            
            await tx.systemLog.create({
                data: {
                    userId: session.user.id,
                    action: 'RECEIVE_ITEMS',
                    entity: 'PurchaseOrder',
                    entityId: poId,
                    details: JSON.stringify({ itemsReceived: items.length, status: allCompleted ? 'Completed' : 'Partial' })
                }
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

export async function getPOHistory(poId: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const logs = await prisma.systemLog.findMany({
            where: { entity: 'PurchaseOrder', entityId: poId },
            include: { user: { select: { name: true, email: true } } },
            orderBy: { createdAt: 'desc' }
        });
        return { success: true, data: logs };
    } catch (error) {
        await logError('purchasing.getPOHistory', error);
        return { success: false, error: 'Failed to fetch PO history' };
    }
}


export async function updatePOLinkedSO(poId: number, salesOrderId: number | null) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        await prisma.purchaseOrder.update({
            where: { id: poId },
            data: { salesOrderId }
        });

        await logAudit(session.user.id, 'LINK_SO', 'PurchaseOrder', poId, { salesOrderId });
        
        revalidatePath(`/purchasing/${poId}`);
        revalidatePath('/purchasing');
        return { success: true };
    } catch (error) {
        await logError('purchasing.updatePOLinkedSO', error);
        return { success: false, error: 'Failed to update linked Sales Order' };
    }
}

export async function generateInspectionReports(poId: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const po = await prisma.purchaseOrder.findUnique({
            where: { id: poId },
            include: { lines: { include: { item: true } } }
        });

        if (!po) return { success: false, error: 'Purchase Order not found' };

        const zip = new JSZip();
        let reportsCount = 0;
        const userName = session.user.name || 'Unknown User';
        const currentDate = format(new Date(), 'yyyy-MM-dd');

        for (const line of po.lines) {
            const item = line.item as any;
            if (!item || !item.inspectionTemplateUrl) continue;

            try {
                // Fetch or Load template
                let arrayBuffer: ArrayBuffer;
                if (item.inspectionTemplateUrl.startsWith('data:')) {
                    const base64Data = item.inspectionTemplateUrl.split(',')[1];
                    const buffer = Buffer.from(base64Data, 'base64');
                    // In some environments, buffer.buffer might have offset issues
                    // Using buffer directly or creating a new Uint8Array is safer
                    arrayBuffer = new Uint8Array(buffer).buffer;
                } else {
                    const response = await fetch(item.inspectionTemplateUrl);
                    if (!response.ok) throw new Error(`Failed to fetch template for ${item.sku}`);
                    arrayBuffer = await response.arrayBuffer();
                }
                
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(arrayBuffer);

                // Placeholder Replacement
                workbook.eachSheet(sheet => {
                    sheet.eachRow(row => {
                        row.eachCell(cell => {
                            if (cell.value && typeof cell.value === 'string') {
                                let val = cell.value;
                                val = val.replace(/{{PN}}|{{SKU}}/g, item.sku);
                                val = val.replace(/{{DESC}}|{{NAME}}/g, item.name || '');
                                val = val.replace(/{{REV}}/g, item.revision || '');
                                val = val.replace(/{{USER}}|{{USERNAME}}/g, userName);
                                val = val.replace(/{{DATE}}/g, currentDate);
                                val = val.replace(/{{SUPPLIER}}/g, po.supplier || '');
                                val = val.replace(/{{QUANTITY}}/g, String(line.quantity));
                                val = val.replace(/{{PO}}/g, po.poNumber);
                                cell.value = val;
                            }
                        });
                    });
                });

                const buffer = await workbook.xlsx.writeBuffer();
                zip.file(`${item.sku}_${po.poNumber}.xlsx`, buffer);
                reportsCount++;
            } catch (err) {
                console.error(`Error generating report for ${item.sku}:`, err);
                // Continue with other items
            }
        }

        if (reportsCount === 0) {
            return { success: false, error: 'No inspection templates found for any items in this PO.' };
        }

        const zipBuffer = await zip.generateAsync({ type: 'base64' });
        const fileName = (po.poNumber.startsWith('PO') ? po.poNumber : `PO${po.poNumber}`) + '_Inspection_Reports.zip';

        return { 
            success: true, 
            data: { 
                base64: zipBuffer, 
                fileName 
            } 
        };

    } catch (error) {
        await logError('purchasing.generateInspectionReports', error);
        return { success: false, error: 'Failed to generate inspection reports.' };
    }
}
