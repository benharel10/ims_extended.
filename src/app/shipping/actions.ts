'use server'

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

// Workaround for EPERM issue during type generation
const db = prisma as any;

// --- Warehouse Actions ---

export async function getWarehouses() {
    try {
        const warehouses = await db.warehouse.findMany({
            orderBy: { name: 'asc' }
        });
        return { success: true, data: warehouses };
    } catch (error) {
        return { success: false, error: 'Failed to fetch warehouses' };
    }
}

export async function createWarehouse(data: { name: string, location?: string, type?: string }) {
    try {
        const warehouse = await db.warehouse.create({
            data: {
                name: data.name,
                location: data.location,
                type: data.type || 'Standard'
            }
        });
        revalidatePath('/shipping');
        return { success: true, data: warehouse };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to create warehouse' };
    }
}

export async function deleteWarehouse(id: number) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized' };
        await db.warehouse.delete({ where: { id } });
        revalidatePath('/shipping');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to delete warehouse' };
    }
}

// --- Serialized Items ---

export async function getAvailableSerialNumbers(itemId: number) {
    try {
        const serials = await db.serializedItem.findMany({
            where: {
                itemId,
                status: 'InStock'
            },
            orderBy: { sn: 'asc' }
        });
        return { success: true, data: serials };
    } catch (error) {
        return { success: false, error: 'Failed to fetch serial numbers' };
    }
}

// --- Shipment Actions ---

export async function getShipments() {
    try {
        const shipments = await db.shipment.findMany({
            include: {
                salesOrder: true,
                fromWarehouse: true,
                toWarehouse: true,
                packages: {
                    include: {
                        items: {
                            include: {
                                item: true,
                                serializedItem: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        return { success: true, data: shipments };
    } catch (error) {
        console.error('Failed to get shipments:', error);
        return { success: false, error: 'Failed to get shipments' };
    }
}

export async function createShipment(data: {
    shipmentNo: string,
    soId?: number,
    carrier?: string,
    trackingNo?: string,
    type?: string,
    fromWarehouseId?: number,
    toWarehouseId?: number
}) {
    try {
        const shipment = await db.shipment.create({
            data: {
                shipmentNo: data.shipmentNo,
                soId: data.soId,
                carrier: data.carrier,
                trackingNo: data.trackingNo,
                status: 'Draft',
                type: data.type || 'Outbound',
                fromWarehouseId: data.fromWarehouseId,
                toWarehouseId: data.toWarehouseId
            }
        });
        revalidatePath('/shipping');
        return { success: true, data: shipment };
    } catch (error: any) {
        console.error('Failed to create shipment:', error);
        return { success: false, error: error.message || 'Failed to create shipment' };
    }
}

export async function updateShipmentStatus(id: number, status: string) {
    try {
        await db.shipment.update({
            where: { id },
            data: { status }
        });
        revalidatePath('/shipping');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed' };
    }
}

export async function completeTransfer(shipmentId: number) {
    try {
        const shipment = await db.shipment.findUnique({
            where: { id: shipmentId },
            include: {
                packages: {
                    include: {
                        items: {
                            include: {
                                item: true // Include item details for error messages
                            }
                        }
                    }
                }
            }
        });

        if (!shipment) throw new Error('Shipment not found');
        if (shipment.type !== 'Transfer') throw new Error('Not a transfer shipment');
        if (shipment.status === 'Completed') throw new Error('Transfer already completed');
        if (!shipment.fromWarehouseId || !shipment.toWarehouseId) throw new Error('Transfer info missing warehouses');

        await db.$transaction(async (tx: any) => {
            for (const pkg of shipment.packages) {
                for (const pItem of pkg.items) {
                    // 1. Check Source Stock
                    const currentStock = await tx.itemStock.findUnique({
                        where: {
                            itemId_warehouseId: {
                                itemId: pItem.itemId,
                                warehouseId: shipment.fromWarehouseId
                            }
                        }
                    });

                    if (!currentStock || currentStock.quantity < pItem.quantity) {
                        throw new Error(`Insufficient stock for item ${pItem.item?.sku || pItem.itemId} in source warehouse. Available: ${currentStock?.quantity || 0}, Required: ${pItem.quantity}`);
                    }

                    // 2. Remove from Source
                    await tx.itemStock.update({
                        where: {
                            itemId_warehouseId: {
                                itemId: pItem.itemId,
                                warehouseId: shipment.fromWarehouseId
                            }
                        },
                        data: { quantity: { decrement: pItem.quantity } }
                    });

                    // 3. Add to Destination
                    await tx.itemStock.upsert({
                        where: {
                            itemId_warehouseId: {
                                itemId: pItem.itemId,
                                warehouseId: shipment.toWarehouseId
                            }
                        },
                        update: { quantity: { increment: pItem.quantity } },
                        create: {
                            itemId: pItem.itemId,
                            warehouseId: shipment.toWarehouseId,
                            quantity: pItem.quantity
                        }
                    });
                }
            }

            // 4. Mark Completed
            await tx.shipment.update({
                where: { id: shipmentId },
                data: {
                    status: 'Completed',
                    receiveDate: new Date()
                }
            });
        });

        revalidatePath('/shipping');
        revalidatePath('/inventory');
        return { success: true };
    } catch (error: any) {
        console.error('Transfer failed:', error);
        return { success: false, error: error.message || 'Transfer failed' };
    }
}

// --- Package Actions ---

export async function createPackage(shipmentId: number, type: string = 'Box') {
    try {
        const pkg = await db.package.create({
            data: {
                shipmentId,
                type
            }
        });
        revalidatePath('/shipping');
        return { success: true, data: pkg };
    } catch (error) {
        return { success: false, error: 'Failed to add package' };
    }
}

export async function deletePackage(id: number) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized' };
        await db.package.delete({ where: { id } });
        revalidatePath('/shipping');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed' };
    }
}

// --- Package Item Actions ---

export async function addItemToPackage(packageId: number, itemId: number, quantity: number, serializedItemId?: number) {
    try {
        console.log(`Adding item to package. Pkg: ${packageId}, Item: ${itemId}, Qty: ${quantity}, Serial: ${serializedItemId}`);
        const item = await db.packageItem.create({
            data: {
                packageId,
                itemId,
                quantity,
                serializedItemId: serializedItemId || null
            }
        });
        revalidatePath('/shipping');
        return { success: true, data: item };
    } catch (error: any) {
        console.error('Error adding item to package:', error);
        return { success: false, error: 'Failed to add item: ' + error.message };
    }
}

export async function removeItemFromPackage(id: number) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized' };
        await db.packageItem.delete({ where: { id } });
        revalidatePath('/shipping');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed' };
    }
}

export async function deleteShipment(id: number) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized' };
        await db.shipment.delete({ where: { id } });
        revalidatePath('/shipping');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to delete shipment' };
    }
}

export async function bulkDeleteShipments(ids: number[]) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized' };
        await db.shipment.deleteMany({
            where: {
                id: { in: ids }
            }
        });
        revalidatePath('/shipping');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || 'Failed to delete shipments' };
    }
}
