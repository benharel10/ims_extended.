'use server'

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { logError } from '@/lib/errorLogger';
import { RunProductionSchema, SaveBOMSchema, parseSchema } from '@/lib/schemas';

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
            select: { id: true, name: true, sku: true, type: true, currentStock: true, cost: true },
            orderBy: { name: 'asc' }
        });
        return { success: true, data: items.map(i => ({ ...i, currentStock: Number(i.currentStock), cost: Number(i.cost) })) };
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
        return { success: true, data: activeBom };
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

        // ── Zod validation ──
        const p = parseSchema(SaveBOMSchema, { parentId, components, itemUpdates });
        if (!p.success) return { success: false, error: p.error };

        // ── Circular BOM check ──
        for (const c of p.data.components) {
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
        for (const c of p.data.components) {
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

        const p = parseSchema(RunProductionSchema, { parentId, quantity, serialNumbers, toWarehouseId });
        if (!p.success) return { success: false, error: p.error };

        await prisma.$transaction(async (tx) => {
            // 1. Load and validate BOM (only active lines)
            const bom = await tx.bOM.findMany({
                where: { parentId, deletedAt: null }
            });
            if (bom.length === 0) {
                throw new Error('No assembly definition (BOM) found for this product. Define the BOM first.');
            }

            if (!toWarehouseId) {
                throw new Error('A warehouse must be selected for production.');
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

                const stockInSelectedWarehouse = childItem.stocks.find(s => s.warehouseId === toWarehouseId);
                const available = stockInSelectedWarehouse ? Number(stockInSelectedWarehouse.quantity) : 0;

                if (available < requiredQty) {
                    throw new Error(
                        `Insufficient stock for "${childItem.sku}" in the selected warehouse. Required: ${requiredQty}, Available: ${available}`
                    );
                }
            }

            // 3. Deduct stock from components (all checks passed — safe to write)
            for (const line of bom) {
                const requiredQty = Number(line.quantity) * quantity;

                const existingStock = await tx.itemStock.findUnique({
                    where: { itemId_warehouseId: { itemId: line.childId, warehouseId: toWarehouseId! } }
                });

                if (!existingStock) {
                    const childItem = await tx.item.findUnique({ where: { id: line.childId } });
                    throw new Error(`Stock record missing for "${childItem?.sku}" in the selected warehouse.`);
                }

                await tx.itemStock.update({
                    where: { id: existingStock.id },
                    data: { quantity: { decrement: requiredQty } }
                });

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
                where: { itemId_warehouseId: { itemId: parentId, warehouseId: toWarehouseId! } }
            });
            if (existingStock) {
                await tx.itemStock.update({
                    where: { id: existingStock.id },
                    data: { quantity: { increment: quantity } }
                });
            } else {
                await tx.itemStock.create({
                    data: { itemId: parentId, warehouseId: toWarehouseId!, quantity }
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
            include: { item: true, toWarehouse: true, salesOrder: true }
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

                    const stockInSelectedWarehouse = child.stocks.find(s => s.warehouseId === run.toWarehouseId);
                    const available = stockInSelectedWarehouse ? Number(stockInSelectedWarehouse.quantity) : 0;
                    if (available < needed) {
                        throw new Error(`Insufficient stock for "${child.sku}" in the selected warehouse. Need ${needed}, available ${available}`);
                    }
                }

                // Now deduct from stock in the selected warehouse
                for (const line of bom) {
                    const needed = Number(line.quantity) * diff;
                    
                    const existingStock = await tx.itemStock.findUnique({
                        where: { itemId_warehouseId: { itemId: line.childId, warehouseId: run.toWarehouseId! } }
                    });

                    if (existingStock) {
                        await tx.itemStock.update({
                            where: { id: existingStock.id },
                            data: { quantity: { decrement: needed } }
                        });
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
                    // Return it to the warehouse it was taken from
                    let stock = await tx.itemStock.findUnique({
                        where: { itemId_warehouseId: { itemId: line.childId, warehouseId: run.toWarehouseId! } }
                    });

                    if (stock) {
                        await tx.itemStock.update({
                            where: { id: stock.id },
                            data: { quantity: { increment: returning } }
                        });
                    } else {
                        await tx.itemStock.create({
                            data: { itemId: line.childId, warehouseId: run.toWarehouseId!, quantity: returning }
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

export async function exportBOMExcel(parentId: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const parentItem = await prisma.item.findUnique({ where: { id: parentId } });
        if (!parentItem) return { success: false, error: 'Product not found' };

        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('BOM Structure');

        sheet.columns = [
            { header: 'SKU', key: 'sku', width: 35 },
            { header: 'Name', key: 'name', width: 45 },
            { header: 'Type', key: 'type', width: 15 },
            { header: 'Qty Per Parent', key: 'qtyPerParent', width: 15 },
            { header: 'Available Stock', key: 'availableStock', width: 18 },
            { header: 'Max Build Potential', key: 'maxBuildPotential', width: 22 }
        ];

        // Format header row
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.eachCell((cell: any) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF7030A0' } // Purple header
            };
        });

        const treeRows: any[] = [];
        const visited = new Set<number>();

        async function traverse(itemId: number, depth: number, qtyPerParent: number) {
            if (visited.has(itemId)) return;
            visited.add(itemId);

            const item = await prisma.item.findUnique({ where: { id: itemId } });
            if (!item || item.deletedAt !== null) {
                visited.delete(itemId);
                return;
            }

            const boms = await prisma.bOM.findMany({
                where: { parentId: itemId, deletedAt: null },
                include: { child: true }
            });
            const activeBoms = boms.filter(bom => bom.child && bom.child.deletedAt === null);

            const currentStock = Number(item.currentStock || 0);
            const allocatedStock = Number(item.allocatedStock || 0);
            const availableStock = Math.max(0, currentStock - allocatedStock);

            const prefix = depth === 0 ? '' : '  '.repeat(depth - 1) + '└─ ';
            const skuWithIndent = prefix + item.sku;

            const qty = Number(qtyPerParent);
            const maxBuildPotential = (depth === 0 || isNaN(qty) || qty <= 0) ? '-' : Math.floor(Number((availableStock / qty).toFixed(4)));

            treeRows.push({
                sku: skuWithIndent,
                name: item.name,
                type: item.type,
                qtyPerParent: depth === 0 ? '-' : qtyPerParent,
                availableStock,
                maxBuildPotential,
                depth,
                isSubAssembly: depth > 0 && activeBoms.length > 0
            });

            for (const bom of activeBoms) {
                await traverse(bom.childId, depth + 1, Number(bom.quantity));
            }

            visited.delete(itemId);
        }

        // Start traversal from parent
        await traverse(parentId, 0, 1);

        // Add rows to sheet and apply styling
        for (const rowData of treeRows) {
            const row = sheet.addRow({
                sku: rowData.sku,
                name: rowData.name,
                type: rowData.type,
                qtyPerParent: rowData.qtyPerParent,
                availableStock: rowData.availableStock,
                maxBuildPotential: rowData.maxBuildPotential
            });

            // Format root products vs sub-assemblies vs raw components
            if (rowData.depth === 0) {
                row.eachCell((cell: any) => {
                    cell.font = { bold: true };
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFE8F1F5' } // Very light blue/gray background for root products
                    };
                });
            } else if (rowData.isSubAssembly) {
                row.eachCell((cell: any) => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFFF2CC' } // Soft yellow fill for sub-assemblies
                    };
                });
            }
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const fileName = `${parentItem.sku.replace(/[^a-z0-9]/gi, '_')}_BOM.xlsx`;

        return { success: true, data: { base64, fileName } };
    } catch (error: any) {
        await logError('exportBOMExcel', error);
        return { success: false, error: error.message || 'Failed to export BOM structure' };
    }
}
