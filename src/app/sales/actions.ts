'use server'

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';

export async function getSalesOrders() {
    try {
        const orders = await prisma.salesOrder.findMany({
            include: {
                lines: true,
                productionRun: {
                    include: { item: true }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        return { success: true, data: orders };
    } catch (error) {
        console.error('Failed to fetch sales orders:', error);
        return { success: false, error: 'Failed to fetch sales orders' };
    }
}

export async function createSalesOrder(data: { customer: string, soNumber: string, productionRunId?: number }) {
    try {
        const order = await prisma.salesOrder.create({
            data: {
                customer: data.customer,
                soNumber: data.soNumber,
                status: 'Draft',
                productionRunId: data.productionRunId
            }
        });

        // Auto-create line if linked to production
        if (data.productionRunId) {
            const run = await prisma.productionRun.findUnique({ where: { id: data.productionRunId }, include: { item: true } });
            if (run) {
                await prisma.salesLine.create({
                    data: {
                        soId: order.id,
                        itemId: run.itemId,
                        quantity: run.quantity,
                        unitPrice: run.item.price || 0
                    }
                });
            }
        }

        revalidatePath('/sales');
        return { success: true, data: order };
    } catch (error) {
        console.error('Failed to create sales order:', error);
        return { success: false, error: 'Failed to create sales order' };
    }
}

export async function getRecentProductionRuns() {
    try {
        const runs = await prisma.productionRun.findMany({
            take: 20,
            orderBy: { createdAt: 'desc' },
            include: { item: true }
        });
        return { success: true, data: runs };
    } catch (error) {
        return { success: false, error: 'Failed to get production runs' };
    }
}

import { createInvoiceInICount } from '@/lib/icount';

export async function updateSalesOrderStatus(id: number, status: string) {
    try {
        const order = await prisma.salesOrder.update({
            where: { id },
            data: { status }
        });

        // Trigger iCount sync if status is 'Confirmed'
        if (status === 'Confirmed') {
            const result = await createInvoiceInICount(order);

            // Log the sync attempt
            await prisma.iCountSyncLog.create({
                data: {
                    entityType: 'Invoice',
                    entityId: id,
                    action: 'Create',
                    status: result.success ? 'Success' : 'Failed',
                    message: result.message || (result.success ? `Created iCount ID: ${result.icountId}` : 'Unknown error')
                }
            });

            if (!result.success) {
                return { success: true, data: order, warning: 'Order updated but iCount sync failed.' };
            }
        }

        revalidatePath('/sales');
        return { success: true, data: order };
    } catch (error) {
        console.error('Failed to update sales order:', error);
        return { success: false, error: 'Failed to update sales order' };
    }
}


export async function addSalesLine(soId: number, itemId: number, quantity: number, unitPrice: number) {
    try {
        await prisma.salesLine.create({
            data: {
                soId,
                itemId,
                quantity,
                unitPrice
            }
        });
        revalidatePath('/sales');
        return { success: true };
    } catch (error) {
        console.error('Failed to add line:', error);
        return { success: false, error: 'Failed to add line' };
    }
}

export async function removeSalesLine(lineId: number) {
    try {
        await prisma.salesLine.delete({
            where: { id: lineId }
        });
        revalidatePath('/sales');
        return { success: true };
    } catch (error) {
        console.error('Failed to remove line:', error);
        return { success: false, error: 'Failed to remove line' };
    }
}

export async function getSellableItems() {
    try {
        // Return mostly Products/Assemblies, but maybe everything is sellable? 
        // User asked for "pick sales from production", so we highlight those.
        const items = await prisma.item.findMany({
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
            orderBy: {
                name: 'asc'
            }
        });
        return { success: true, data: items };
    } catch (error) {
        return { success: false, error: 'Failed to fetch items' };
    }
}

export async function deleteSalesOrder(id: number) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized' };

        await prisma.salesOrder.delete({ where: { id } });
        revalidatePath('/sales');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to delete order' };
    }
}

export async function bulkDeleteSalesOrders(ids: number[]) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized' };

        await prisma.salesOrder.deleteMany({
            where: {
                id: { in: ids }
            }
        });
        revalidatePath('/sales');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to delete orders' };
    }
}
