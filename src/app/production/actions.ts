'use server'

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { logError } from '@/lib/errorLogger';

/** Filter active (non-soft-deleted) rows */
const ACTIVE_BOM = { deletedAt: null };

export async function getWarehouses() {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const warehouses = await prisma.warehouse.findMany({ orderBy: { name: 'asc' } });
        return { success: true, data: warehouses };
    } catch (error) {
        await logError('getWarehouses', error);
        return { success: false, error: 'Failed to fetch warehouses' };
    }
}

// ─── Assembly Parents & Components ───────────────────────────────────────────

export async function getAssemblyParents() {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const items = await prisma.item.findMany({
            where: { type: { in: ['Assembly', 'Product'] }, deletedAt: null },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, sku: true, currentStock: true, isSerialized: true, cost: true, price: true }
        });

        return {
            success: true,
            data: items.map(item => ({
                ...item,
                currentStock: Number(item.currentStock),
                cost: Number(item.cost),
                price: Number(item.price)
            }))
        };
    } catch (error) {
        await logError('getAssemblyParents', error);
        return { success: false, error: 'Failed to fetch assembly products. Please try again.' };
    }
}

export async function getComponentOptions() {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const items = await prisma.item.findMany({
            where: { deletedAt: null },
            orderBy: { name: 'asc' }
        });
        return { success: true, data: items };
    } catch (error) {
        await logError('getComponentOptions', error);
        return { success: false, error: 'Failed to fetch components. Please try again.' };
    }
}

// ─── BOM ─────────────────────────────────────────────────────────────────────

export async function getBOM(parentId: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const bom = await prisma.bOM.findMany({
            where: { parentId, ...ACTIVE_BOM },
            include: { child: true }
        });
        // Filter out BOM lines whose child item has been soft deleted
        const activeBom = bom.filter(b => b.child?.deletedAt === null);
        return { success: true, data: bom };
    } catch (error) {
        await logError('getBOM', error);
        return { success: false, error: 'Failed to fetch BOM. Please try again.' };
    }
}

export async function saveBOM(
    parentId: number,
    components: { childId: number; quantity: number }[],
    itemUpdates?: { cost?: number; price?: number }
) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        // ── Server-side validation ──
        for (const c of components) {
            if (c.quantity <= 0) return { success: false, error: 'All component quantities must be positive' };
            if (c.childId === parentId) return { success: false, error: 'An item cannot contain itself as a component' };
        }

        // ── Circular BOM check ──
        for (const c of components) {
            const hasCycle = await wouldCreateCycle(parentId, c.childId);
            if (hasCycle) {
                const child = await prisma.item.findUnique({ where: { id: c.childId }, select: { sku: true } });
                return {
                    success: false,
                    error: `Adding "${child?.sku ?? c.childId}" would create a circular BOM reference (item A cannot contain item B if B already contains A)`
                };
            }
        }

        // Aggregate duplicate childIds
        const condensed = new Map<number, number>();
        for (const c of components) {
            condensed.set(c.childId, (condensed.get(c.childId) ?? 0) + c.quantity);
        }
        const finalComponents = Array.from(condensed.entries()).map(([childId, quantity]) => ({ childId, quantity }));

        // ── Atomic transaction ──
        await prisma.$transaction(async (tx) => {
            if (itemUpdates) {
                if (itemUpdates.cost !== undefined && itemUpdates.cost < 0)
                    throw new Error('Cost cannot be negative');
                if (itemUpdates.price !== undefined && itemUpdates.price < 0)
                    throw new Error('Price cannot be negative');

                const currentItem = await tx.item.findUnique({ where: { id: parentId }, select: { version: true } });
                if (!currentItem) throw new Error('Item not found for concurrency check');
                const occResult = await tx.item.updateMany({
                    where: { id: parentId, version: currentItem.version },
                    data: { cost: itemUpdates.cost, price: itemUpdates.price, version: { increment: 1 } }
                });
                if (occResult.count === 0) throw new Error('Concurrency conflict: item was updated simultaneously. Please try again.');
            }

            // Soft-delete existing BOM lines for this parent
            await tx.bOM.updateMany({
                where: { parentId },
                data: { deletedAt: new Date() }
            });

            // Create new BOM lines
            if (finalComponents.length > 0) {
                // Upsert strategy: restore if exists (handles soft-deleted lines)
                for (const c of finalComponents) {
                    const existing = await tx.bOM.findFirst({
                        where: { parentId, childId: c.childId }
                    });
                    if (existing) {
                        await tx.bOM.update({
                            where: { id: existing.id },
                            data: { quantity: c.quantity, deletedAt: null }
                        });
                    } else {
                        await tx.bOM.create({
                            data: { parentId, childId: c.childId, quantity: c.quantity }
                        });
                    }
                }
            }
        });

        revalidatePath('/production');
        revalidatePath('/inventory');
        return { success: true };
    } catch (error: unknown) {
        await logError('saveBOM', error);
        const msg = error instanceof Error ? error.message : 'Failed to save assembly structure';
        return { success: false, error: msg };
    }
}

// ─── Circular BOM detection ──────────────────────────────────────────────────

async function wouldCreateCycle(parentId: number, childId: number): Promise<boolean> {
    if (parentId === childId) return true;

    // Walk DOWN from childId — if parentId is ever reachable, it's a cycle
    const visited = new Set<number>();
    const queue = [childId];

    while (queue.length > 0) {
        const current = queue.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);

        const children = await prisma.bOM.findMany({
            where: { parentId: current, deletedAt: null },
            select: { childId: true }
        });
        for (const bom of children) {
            if (bom.childId === parentId) return true;
            queue.push(bom.childId);
        }
    }
    return false;
}

// ─── Run Production ──────────────────────────────────────────────────────────

export async function runProduction(parentId: number, quantity: number, serialNumbers: string[] = [], toWarehouseId?: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        if (!Number.isFinite(quantity) || quantity <= 0) {
            return { success: false, error: 'Quantity must be a positive number' };
        }
        if (!toWarehouseId) {
            return { success: false, error: 'Destination warehouse is required.' };
        }

        await prisma.$transaction(async (tx) => {
            // 1. Load and validate BOM (only active lines)
            const bom = await tx.bOM.findMany({
                where: { parentId, deletedAt: null }
            });
            if (bom.length === 0) {
                throw new Error('No assembly definition (BOM) found for this product. Define the BOM first.');
            }

            // 2. Pre-flight stock check for ALL components before deducting anything
            for (const line of bom) {
                const requiredQty = Number(line.quantity) * quantity;
                const childItem = await tx.item.findUnique({
                    where: { id: line.childId },
                    include: { stocks: true }
                });
                if (!childItem || childItem.deletedAt) {
                    throw new Error(`Component (ID: ${line.childId}) no longer exists`);
                }

                // Calculate total available across all warehouses
                const available = childItem.stocks.reduce((acc, s) => acc + Number(s.quantity), 0);

                if (available < requiredQty) {
                    throw new Error(
                        `Insufficient stock for "${childItem.sku}". Required: ${requiredQty}, Available: ${available}`
                    );
                }
            }

            // 3. Deduct stock from components (all checks passed — safe to write)
            for (const line of bom) {
                const requiredQty = Number(line.quantity) * quantity;

                const childItem = await tx.item.findUnique({
                    where: { id: line.childId },
                    include: { stocks: true }
                });
                if (!childItem) throw new Error(`Component ID ${line.childId} not found`);

                // Deduct from warehouse stocks (auto-deduct from wherever available)
                let remaining = requiredQty;
                for (const stock of childItem.stocks) {
                    if (remaining <= 0) break;
                    const available = Number(stock.quantity);
                    if (available > 0) {
                        const deduct = Math.min(available, remaining);
                        await tx.itemStock.update({
                            where: { id: stock.id },
                            data: { quantity: { decrement: deduct } }
                        });
                        remaining -= deduct;
                    }
                }

                if (remaining > 0.0001) {
                    throw new Error(`Stock inconsistency for "${childItem.sku}". Please refresh and try again.`);
                }

                // Deduct from total stock + bump version
                const currentChild = await tx.item.findUnique({ where: { id: line.childId }, select: { version: true } });
                if (!currentChild) throw new Error('Item not found for concurrency check');
                const occResult = await tx.item.updateMany({
                    where: { id: line.childId, version: currentChild.version },
                    data: { currentStock: { decrement: requiredQty }, version: { increment: 1 } }
                });
                if (occResult.count === 0) throw new Error('Concurrency conflict: stock was updated simultaneously. Please try again.');
            }

            // 4. Add finished goods to selected destination warehouse
            const existingStock = await tx.itemStock.findUnique({
                where: { itemId_warehouseId: { itemId: parentId, warehouseId: toWarehouseId } }
            });
            if (existingStock) {
                await tx.itemStock.update({
                    where: { id: existingStock.id },
                    data: { quantity: { increment: quantity } }
                });
            } else {
                await tx.itemStock.create({
                    data: { itemId: parentId, warehouseId: toWarehouseId, quantity }
                });
            }

            const parentItem = await tx.item.findUnique({ where: { id: parentId } });
            if (!parentItem) throw new Error('Parent item not found');
            const occResult = await tx.item.updateMany({
                where: { id: parentId, version: parentItem.version },
                data: { currentStock: { increment: quantity }, version: { increment: 1 } }
            });
            if (occResult.count === 0) throw new Error('Concurrency conflict: item was updated simultaneously. Please try again.');

            // 5. Serial number validation
            if (parentItem?.isSerialized) {
                if (!Number.isInteger(quantity)) {
                    throw new Error('Serialized items must be produced in whole numbers');
                }
                if (serialNumbers.length !== quantity) {
                    throw new Error(`Item is serialized — provide exactly ${quantity} serial number(s)`);
                }
            }

            // 6. Create production run record (legacy fromWarehouseId will be null)
            const run = await tx.productionRun.create({
                data: { itemId: parentId, quantity, status: 'Completed', toWarehouseId }
            });

            // 7. Register serial numbers
            if (parentItem?.isSerialized) {
                for (const sn of serialNumbers) {
                    const trimmed = sn.trim();
                    if (!trimmed) throw new Error('Serial numbers cannot be empty strings');
                    const existing = await tx.serializedItem.findUnique({ where: { sn: trimmed } });
                    if (existing) throw new Error(`Serial Number "${trimmed}" already exists`);
                    await tx.serializedItem.create({
                        data: { sn: trimmed, itemId: parentId, status: 'InStock', productionRunId: run.id }
                    });
                }
            }
        });

        revalidatePath('/production');
        revalidatePath('/inventory');
        return { success: true };
    } catch (error: unknown) {
        await logError('runProduction', error);
        const msg = error instanceof Error ? error.message : 'Production run failed';
        return { success: false, error: msg };
    }
}

// ─── Production History ───────────────────────────────────────────────────────

export async function getProductionRuns() {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const runs = await prisma.productionRun.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { item: true, toWarehouse: true }
        });

        return {
            success: true,
            data: runs.map(run => ({
                ...run,
                quantity: Number(run.quantity),
                item: run.item ? {
                    ...run.item,
                    minStock: Number(run.item.minStock),
                    currentStock: Number(run.item.currentStock),
                    cost: Number(run.item.cost),
                    price: Number(run.item.price)
                } : null
            }))
        };
    } catch (error) {
        await logError('getProductionRuns', error);
        return { success: false, error: 'Failed to fetch production history. Please try again.' };
    }
}

// ─── Update Production Run (re-adjusts stock transactionally) ────────────────

export async function updateProductionRun(runId: number, newQuantity: number) {
    try {
        if (!Number.isFinite(newQuantity) || newQuantity <= 0) {
            return { success: false, error: 'Quantity must be a positive number' };
        }

        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        await prisma.$transaction(async (tx) => {
            const run = await tx.productionRun.findUnique({
                where: { id: runId },
                include: { item: true }
            });
            if (!run) throw new Error('Production run not found');

            const diff = newQuantity - Number(run.quantity);
            if (diff === 0) return;

            if (!run.toWarehouseId) {
                throw new Error('Legacy production run cannot be altered because destination warehouse is missing.');
            }

            const bom = await tx.bOM.findMany({
                where: { parentId: run.itemId, deletedAt: null }
            });
            if (bom.length === 0) throw new Error('BOM missing — cannot adjust stock safely');

            if (diff > 0) {
                // Producing more — pre-flight check first
                for (const line of bom) {
                    const needed = Number(line.quantity) * diff;
                    const child = await tx.item.findUnique({
                        where: { id: line.childId },
                        include: { stocks: true }
                    });
                    if (!child) throw new Error(`Component ID ${line.childId} missing`);

                    const available = child.stocks.reduce((acc, s) => acc + Number(s.quantity), 0);
                    if (available < needed) {
                        throw new Error(`Insufficient stock for "${child.sku}". Need ${needed}, available in total ${available}`);
                    }
                }

                // Now deduct from stock auto
                for (const line of bom) {
                    const needed = Number(line.quantity) * diff;
                    const child = await tx.item.findUnique({
                        where: { id: line.childId },
                        include: { stocks: true }
                    });
                    if (child) {
                        let remaining = needed;
                        for (const stock of child.stocks) {
                            if (remaining <= 0) break;
                            const available = Number(stock.quantity);
                            if (available > 0) {
                                const deduct = Math.min(available, remaining);
                                await tx.itemStock.update({
                                    where: { id: stock.id },
                                    data: { quantity: { decrement: deduct } }
                                });
                                remaining -= deduct;
                            }
                        }
                    }
                    const currentChild = await tx.item.findUnique({ where: { id: line.childId }, select: { version: true } });
                    if (!currentChild) throw new Error('Item not found for concurrency check');
                    const occResult = await tx.item.updateMany({
                        where: { id: line.childId, version: currentChild.version },
                        data: { currentStock: { decrement: needed }, version: { increment: 1 } }
                    });
                    if (occResult.count === 0) throw new Error('Concurrency conflict: stock was updated simultaneously. Please try again.');
                }

                // Add to destination
                await tx.itemStock.upsert({
                    where: { itemId_warehouseId: { itemId: run.itemId, warehouseId: run.toWarehouseId } },
                    create: { itemId: run.itemId, warehouseId: run.toWarehouseId, quantity: diff },
                    update: { quantity: { increment: diff } }
                });
                const currentRunItem = await tx.item.findUnique({ where: { id: run.itemId }, select: { version: true } });
                if (!currentRunItem) throw new Error('Item not found for concurrency check');
                const occResult = await tx.item.updateMany({
                    where: { id: run.itemId, version: currentRunItem.version },
                    data: { currentStock: { increment: diff }, version: { increment: 1 } }
                });
                if (occResult.count === 0) throw new Error('Concurrency conflict: stock was updated simultaneously. Please try again.');
            } else {
                // Reducing — return components to their first available warehouse, or general.
                // It is hard to know exactly which warehouse to return to. We will put it in the default/first one, or toWarehouse
                const removeQty = Math.abs(diff);
                await tx.itemStock.update({
                    where: { itemId_warehouseId: { itemId: run.itemId, warehouseId: run.toWarehouseId } },
                    data: { quantity: { decrement: removeQty } }
                });
                const currentRunItem = await tx.item.findUnique({ where: { id: run.itemId }, select: { version: true } });
                if (!currentRunItem) throw new Error('Item not found for concurrency check');
                const occResult = await tx.item.updateMany({
                    where: { id: run.itemId, version: currentRunItem.version },
                    data: { currentStock: { decrement: removeQty }, version: { increment: 1 } }
                });
                if (occResult.count === 0) throw new Error('Concurrency conflict: stock was updated simultaneously. Please try again.');

                for (const line of bom) {
                    const returning = Number(line.quantity) * removeQty;
                    // Try to find ANY existing stock to return to
                    let stock = await tx.itemStock.findFirst({
                        where: { itemId: line.childId }
                    });

                    if (stock) {
                        await tx.itemStock.update({
                            where: { id: stock.id },
                            data: { quantity: { increment: returning } }
                        });
                    } else {
                        // Just use the toWarehouseId as fallback if no existing stock locations
                        await tx.itemStock.create({
                            data: { itemId: line.childId, warehouseId: run.toWarehouseId, quantity: returning }
                        });
                    }

                    const currentChild = await tx.item.findUnique({ where: { id: line.childId }, select: { version: true } });
                    if (!currentChild) throw new Error('Item not found for concurrency check');
                    const occResult = await tx.item.updateMany({
                        where: { id: line.childId, version: currentChild.version },
                        data: { currentStock: { increment: returning }, version: { increment: 1 } }
                    });
                    if (occResult.count === 0) throw new Error('Concurrency conflict: stock was updated simultaneously. Please try again.');
                }
            }

            await tx.productionRun.update({
                where: { id: runId },
                data: { quantity: newQuantity }
            });
        });

        revalidatePath('/production');
        revalidatePath('/inventory');
        return { success: true };
    } catch (error: unknown) {
        await logError('updateProductionRun', error);
        const msg = error instanceof Error ? error.message : 'Failed to update production run';
        return { success: false, error: msg };
    }
}

// ─── Delete Production Runs ───────────────────────────────────────────────────

export async function deleteProductionRun(runId: number) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized — Admin only' };
        await prisma.productionRun.delete({ where: { id: runId } });
        revalidatePath('/production');
        return { success: true };
    } catch (error) {
        await logError('deleteProductionRun', error);
        return { success: false, error: 'Failed to delete production run. Please try again.' };
    }
}

export async function bulkDeleteProductionRuns(ids: number[]) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized — Admin only' };
        await prisma.productionRun.deleteMany({ where: { id: { in: ids } } });
        revalidatePath('/production');
        return { success: true };
    } catch (error) {
        await logError('bulkDeleteProductionRuns', error);
        return { success: false, error: 'Failed to delete production runs. Please try again.' };
    }
}
