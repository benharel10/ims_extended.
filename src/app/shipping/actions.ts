'use server'

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { logError } from '@/lib/errorLogger';

// ─── Warehouses ───────────────────────────────────────────────────────────────

export async function getWarehouses() {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const warehouses = await prisma.warehouse.findMany({ orderBy: { name: 'asc' } });
        return { success: true, data: warehouses };
    } catch (error) {
        await logError('shipping.getWarehouses', error);
        return { success: false, error: 'Failed to fetch warehouses. Please try again.' };
    }
}

export async function createWarehouse(data: { name: string; location?: string; type?: string }) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized — Admin only' };

        // ── Validation ──
        if (!data.name?.trim()) return { success: false, error: 'Warehouse name is required' };
        if (data.name.trim().length > 80) return { success: false, error: 'Warehouse name must be 80 characters or fewer' };

        const validTypes = ['Standard', 'Virtual', 'Retail'];
        const type = validTypes.includes(data.type ?? '') ? data.type! : 'Standard';

        const warehouse = await prisma.warehouse.create({
            data: {
                name: data.name.trim(),
                location: data.location?.trim() || null,
                type
            }
        });

        revalidatePath('/shipping');
        revalidatePath('/inventory');
        return { success: true, data: warehouse };
    } catch (error: unknown) {
        await logError('shipping.createWarehouse', error);
        // Surface unique-constraint violation with a friendly message
        const msg = error instanceof Error && error.message.includes('Unique')
            ? `A warehouse named "${data.name.trim()}" already exists`
            : 'Failed to create warehouse. Please try again.';
        return { success: false, error: msg };
    }
}

export async function deleteWarehouse(id: number) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized — Admin only' };

        // Prevent deletion if warehouse holds stock
        const stockCount = await prisma.itemStock.count({ where: { warehouseId: id } });
        if (stockCount > 0) {
            return {
                success: false,
                error: 'This warehouse still has stock assigned to it. Transfer or zero out all stock before deleting.'
            };
        }

        await prisma.warehouse.delete({ where: { id } });
        revalidatePath('/shipping');
        revalidatePath('/inventory');
        return { success: true };
    } catch (error) {
        await logError('shipping.deleteWarehouse', error);
        return { success: false, error: 'Failed to delete warehouse. Please try again.' };
    }
}

// ─── Serialized Items ─────────────────────────────────────────────────────────

export async function getAvailableSerialNumbers(itemId: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const serials = await prisma.serializedItem.findMany({
            where: { itemId, status: 'InStock' },
            orderBy: { sn: 'asc' }
        });
        return { success: true, data: serials };
    } catch (error) {
        await logError('shipping.getAvailableSerialNumbers', error);
        return { success: false, error: 'Failed to fetch serial numbers. Please try again.' };
    }
}

// ─── Shipments ────────────────────────────────────────────────────────────────

export async function getShipments() {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const shipments = await prisma.shipment.findMany({
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
        await logError('shipping.getShipments', error);
        return { success: false, error: 'Failed to fetch shipments. Please try again.' };
    }
}

export async function createShipment(data: {
    shipmentNo: string;
    soId?: number;
    carrier?: string;
    trackingNo?: string;
    type?: string;
    fromWarehouseId?: number;
    toWarehouseId?: number;
}) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        // ── Validation ──
        if (!data.shipmentNo?.trim()) return { success: false, error: 'Shipment number is required' };

        const validTypes = ['Outbound', 'Inbound', 'Transfer'];
        const type = validTypes.includes(data.type ?? '') ? data.type! : 'Outbound';

        if (type === 'Transfer') {
            if (!data.fromWarehouseId) return { success: false, error: 'Transfer requires a source warehouse' };
            if (!data.toWarehouseId) return { success: false, error: 'Transfer requires a destination warehouse' };
            if (data.fromWarehouseId === data.toWarehouseId) {
                return { success: false, error: 'Source and destination warehouses must be different' };
            }
        }

        const shipment = await prisma.shipment.create({
            data: {
                shipmentNo: data.shipmentNo.trim(),
                soId: data.soId ?? null,
                carrier: data.carrier?.trim() ?? null,
                trackingNo: data.trackingNo?.trim() ?? null,
                status: 'Draft',
                type,
                fromWarehouseId: data.fromWarehouseId ?? null,
                toWarehouseId: data.toWarehouseId ?? null
            }
        });

        revalidatePath('/shipping');
        return { success: true, data: shipment };
    } catch (error: unknown) {
        await logError('shipping.createShipment', error);
        const msg = error instanceof Error && error.message.includes('Unique')
            ? `Shipment number "${data.shipmentNo?.trim()}" already exists`
            : 'Failed to create shipment. Please try again.';
        return { success: false, error: msg };
    }
}

export async function updateShipmentStatus(id: number, status: string) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const validStatuses = ['Draft', 'Packed', 'Shipped', 'Delivered', 'Completed', 'Cancelled'];
        if (!validStatuses.includes(status)) return { success: false, error: 'Invalid status value' };

        await prisma.shipment.update({ where: { id }, data: { status } });
        revalidatePath('/shipping');
        return { success: true };
    } catch (error) {
        await logError('shipping.updateShipmentStatus', error);
        return { success: false, error: 'Failed to update shipment status. Please try again.' };
    }
}

// ─── Warehouse Transfer (fully transactional + version bumps) ─────────────────

export async function completeTransfer(shipmentId: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        await prisma.$transaction(async (tx) => {
            const shipment = await tx.shipment.findUnique({
                where: { id: shipmentId },
                include: {
                    packages: {
                        include: {
                            items: { include: { item: true } }
                        }
                    }
                }
            });

            if (!shipment) throw new Error('Shipment not found');
            if (shipment.type !== 'Transfer') throw new Error('This shipment is not a warehouse transfer');
            if (shipment.status === 'Completed') throw new Error('Transfer has already been completed');
            if (!shipment.fromWarehouseId || !shipment.toWarehouseId) {
                throw new Error('Transfer is missing source or destination warehouse');
            }

            // ── Pre-flight: check ALL items have sufficient stock before moving anything ──
            for (const pkg of shipment.packages) {
                for (const pItem of pkg.items) {
                    const stock = await tx.itemStock.findUnique({
                        where: {
                            itemId_warehouseId: {
                                itemId: pItem.itemId,
                                warehouseId: shipment.fromWarehouseId!
                            }
                        }
                    });

                    const available = Number(stock?.quantity ?? 0);
                    if (available < pItem.quantity) {
                        const sku = pItem.item?.sku ?? `Item #${pItem.itemId}`;
                        throw new Error(
                            `Insufficient stock for "${sku}" in source warehouse. Available: ${available}, Required: ${pItem.quantity}`
                        );
                    }
                }
            }

            // ── Now apply all stock movements (all checks passed) ──
            for (const pkg of shipment.packages) {
                for (const pItem of pkg.items) {
                    // Deduct from source warehouse
                    await tx.itemStock.update({
                        where: {
                            itemId_warehouseId: {
                                itemId: pItem.itemId,
                                warehouseId: shipment.fromWarehouseId!
                            }
                        },
                        data: { quantity: { decrement: pItem.quantity } }
                    });

                    // Add to destination warehouse
                    await tx.itemStock.upsert({
                        where: {
                            itemId_warehouseId: {
                                itemId: pItem.itemId,
                                warehouseId: shipment.toWarehouseId!
                            }
                        },
                        update: { quantity: { increment: pItem.quantity } },
                        create: {
                            itemId: pItem.itemId,
                            warehouseId: shipment.toWarehouseId!,
                            quantity: pItem.quantity
                        }
                    });

                    // Bump item version so concurrent edits are detected
                    await tx.item.update({
                        where: { id: pItem.itemId },
                        data: { version: { increment: 1 } }
                    });
                }
            }

            // Mark shipment complete
            await tx.shipment.update({
                where: { id: shipmentId },
                data: { status: 'Completed', receiveDate: new Date() }
            });
        });

        revalidatePath('/shipping');
        revalidatePath('/inventory');
        return { success: true };
    } catch (error: unknown) {
        await logError('shipping.completeTransfer', error);
        const msg = error instanceof Error ? error.message : 'Transfer failed. Please try again.';
        return { success: false, error: msg };
    }
}

export async function deleteShipment(id: number) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized — Admin only' };

        // Prevent deletion of completed shipments
        const shipment = await prisma.shipment.findUnique({ where: { id }, select: { status: true } });
        if (shipment?.status === 'Completed') {
            return { success: false, error: 'Completed shipments cannot be deleted. Contact your system administrator.' };
        }

        await prisma.shipment.delete({ where: { id } });
        revalidatePath('/shipping');
        return { success: true };
    } catch (error) {
        await logError('shipping.deleteShipment', error);
        return { success: false, error: 'Failed to delete shipment. Please try again.' };
    }
}

export async function bulkDeleteShipments(ids: number[]) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized — Admin only' };

        // Prevent deletion of completed shipments
        const completed = await prisma.shipment.count({
            where: { id: { in: ids }, status: 'Completed' }
        });
        if (completed > 0) {
            return { success: false, error: `${completed} completed shipment(s) cannot be deleted.` };
        }

        await prisma.shipment.deleteMany({ where: { id: { in: ids } } });
        revalidatePath('/shipping');
        return { success: true };
    } catch (error) {
        await logError('shipping.bulkDeleteShipments', error);
        return { success: false, error: 'Failed to delete shipments. Please try again.' };
    }
}

// ─── Packages ─────────────────────────────────────────────────────────────────

export async function createPackage(shipmentId: number, type: string = 'Box') {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const validTypes = ['Box', 'Pallet', 'Envelope', 'Tube', 'Other'];
        const safeType = validTypes.includes(type) ? type : 'Box';

        const pkg = await prisma.package.create({ data: { shipmentId, type: safeType } });
        revalidatePath('/shipping');
        return { success: true, data: pkg };
    } catch (error) {
        await logError('shipping.createPackage', error);
        return { success: false, error: 'Failed to add package. Please try again.' };
    }
}

export async function deletePackage(id: number) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized — Admin only' };

        await prisma.package.delete({ where: { id } });
        revalidatePath('/shipping');
        return { success: true };
    } catch (error) {
        await logError('shipping.deletePackage', error);
        return { success: false, error: 'Failed to delete package. Please try again.' };
    }
}

// ─── Package Items ────────────────────────────────────────────────────────────

export async function addItemToPackage(
    packageId: number,
    itemId: number,
    quantity: number,
    serializedItemId?: number
) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        if (quantity <= 0) return { success: false, error: 'Quantity must be positive' };

        const item = await prisma.packageItem.create({
            data: {
                packageId,
                itemId,
                quantity,
                serializedItemId: serializedItemId ?? null
            }
        });
        revalidatePath('/shipping');
        return { success: true, data: item };
    } catch (error) {
        await logError('shipping.addItemToPackage', error);
        return { success: false, error: 'Failed to add item to package. Please try again.' };
    }
}

export async function removeItemFromPackage(id: number) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized — Admin only' };

        await prisma.packageItem.delete({ where: { id } });
        revalidatePath('/shipping');
        return { success: true };
    } catch (error) {
        await logError('shipping.removeItemFromPackage', error);
        return { success: false, error: 'Failed to remove item. Please try again.' };
    }
}
