'use server'

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

// 1. Fetch items that can be parents (Assemblies or Products)
export async function getAssemblyParents() {
    try {
        const items = await prisma.item.findMany({
            where: {
                type: { in: ['Assembly', 'Product'] }
            },
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                sku: true,
                currentStock: true,
                isSerialized: true,
                cost: true,
                price: true
            }
        });

        // Convert Decimals to numbers
        const serialized = items.map(item => ({
            ...item,
            currentStock: Number(item.currentStock),
            cost: Number(item.cost),
            price: Number(item.price)
        }));

        return { success: true, data: serialized };
    } catch (error) {
        return { success: false, error: 'Failed to fetch assembly parents' };
    }
}

// 2. Fetch potential children (Raw Materials or Sub-Assemblies)
export async function getComponentOptions() {
    try {
        const items = await prisma.item.findMany({
            // Any item can theoretically be a component, but usually Raw or Assembly
            // We'll return everything to be safe, or filter if needed?
            // Let's just return all for flexibility.
            orderBy: { name: 'asc' }
        });
        return { success: true, data: items };
    } catch (error) {
        return { success: false, error: 'Failed to fetch component options' };
    }
}

// 3. Get existing BOM for a parent
export async function getBOM(parentId: number) {
    try {
        const bom = await prisma.bOM.findMany({
            where: { parentId },
            include: {
                child: true // Include child details like name, sku
            }
        });
        return { success: true, data: bom };
    } catch (error) {
        return { success: false, error: 'Failed to fetch BOM' };
    }
}

// 4. Save BOM (Definition) & Update Parent Item Cost/Price
export async function saveBOM(
    parentId: number,
    components: { childId: number, quantity: number }[],
    itemUpdates?: { cost?: number, price?: number }
) {
    try {
        // PRE-PROCESS: Aggregate duplicate components to prevent Unique Constraint violations
        const condensedComponents = new Map<number, number>();
        for (const c of components) {
            const current = condensedComponents.get(c.childId) || 0;
            condensedComponents.set(c.childId, current + c.quantity);
        }

        const finalComponents = Array.from(condensedComponents.entries()).map(([childId, quantity]) => ({
            childId,
            quantity
        }));

        // Transaction to ensure atomicity
        await prisma.$transaction(async (tx) => {
            // 1. Update Parent Item Cost/Price if provided
            if (itemUpdates) {
                await tx.item.update({
                    where: { id: parentId },
                    data: {
                        cost: itemUpdates.cost,
                        price: itemUpdates.price
                    }
                });
            }

            // 2. Clear existing BOM for this parent
            await tx.bOM.deleteMany({
                where: { parentId }
            });

            // 3. Create new BOM lines
            if (finalComponents.length > 0) {
                await tx.bOM.createMany({
                    data: finalComponents.map(c => ({
                        parentId,
                        childId: c.childId,
                        quantity: c.quantity
                    }))
                });
            }
        });

        revalidatePath('/production');
        revalidatePath('/inventory'); // Inventory items (cost/price) might check
        return { success: true };
    } catch (error: any) {
        console.error('Failed to save BOM:', error);
        return { success: false, error: error.message || 'Failed to save assembly structure' };
    }
}

// 5. Run Production (Execute Assembly)
export async function runProduction(parentId: number, quantity: number, serialNumbers: string[] = []) {
    const session = await getSession();
    if (!session?.user) return { success: false, error: 'Unauthorized' };

    console.log(`[runProduction] Received request: Item=${parentId}, Qty=${quantity} (Type: ${typeof quantity})`);

    if (quantity <= 0) {
        console.error(`[runProduction] Invalid quantity: ${quantity}`);
        return { success: false, error: 'Quantity must be positive' };
    }

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Get BOM to know components
            const bom = await tx.bOM.findMany({
                where: { parentId }
            });

            if (bom.length === 0) {
                throw new Error('No assembly definition (BOM) found for this item.');
            }

            // 2. Check and Deduct Stock for Components
            console.log(`[runProduction] Processing ${bom.length} BOM lines for qty=${quantity}`);
            for (const line of bom) {
                const requiredQty = Number(line.quantity) * quantity;
                console.log(`[runProduction] Component ${line.childId}: BOM qty=${line.quantity}, Required=${requiredQty}`);

                const childItem = await tx.item.findUnique({
                    where: { id: line.childId },
                    include: { stocks: true } // Include warehouse stocks
                });

                if (!childItem) throw new Error(`Component item ID ${line.childId} not found`);

                console.log(`[runProduction] Component ${childItem.sku}: Total stock=${childItem.currentStock}`);

                // Check total availability first
                if (Number(childItem.currentStock) < requiredQty) {
                    throw new Error(`Insufficient stock for component ${childItem.sku}. Required: ${requiredQty}, Available: ${childItem.currentStock}`);
                }

                // Deduct from warehouses (ItemStock)
                let remainingToDeduct = requiredQty;

                // Prioritize KSW (ID 2) or similar logic if needed, otherwise just take from available
                // Let's sort to take from largest stock first or specific warehouse? 
                // For now, simple iteration: take from where available.
                for (const stock of childItem.stocks) {
                    if (remainingToDeduct <= 0) break;

                    const stockQty = Number(stock.quantity);
                    if (stockQty > 0) {
                        const deduct = Math.min(stockQty, remainingToDeduct);

                        console.log(`[runProduction] Deducting ${deduct} from Warehouse ${stock.warehouseId}`);

                        await tx.itemStock.update({
                            where: { id: stock.id },
                            data: { quantity: { decrement: deduct } }
                        });

                        remainingToDeduct -= deduct;
                    }
                }

                if (remainingToDeduct > 0.0001) { // Floating point tolerance
                    throw new Error(`Stock inconsistency for ${childItem.sku}. Total says enough, but warehouses don't have it.`);
                }

                // Deduct from main Item.currentStock
                console.log(`[runProduction] Decrementing total ${childItem.sku} by ${requiredQty}`);
                await tx.item.update({
                    where: { id: line.childId },
                    data: { currentStock: { decrement: requiredQty } }
                });
                console.log(`[runProduction] ✓ Deducted ${requiredQty} from ${childItem.sku}`);
            }

            // 3. Add Stock for Parent Item
            // Decide where to put it. KSW (ID 2) is a good default for production output based on user feedback.
            // Or use the first existing warehouse stock record.
            const targetWarehouseId = 2; // Default to KSW

            // Update/Create ItemStock
            const existingStock = await tx.itemStock.findUnique({
                where: { itemId_warehouseId: { itemId: parentId, warehouseId: targetWarehouseId } }
            });

            if (existingStock) {
                await tx.itemStock.update({
                    where: { id: existingStock.id },
                    data: { quantity: { increment: quantity } }
                });
            } else {
                await tx.itemStock.create({
                    data: {
                        itemId: parentId,
                        warehouseId: targetWarehouseId,
                        quantity: quantity
                    }
                });
            }

            // Update Parent Total
            const parentItem = await tx.item.update({
                where: { id: parentId },
                data: { currentStock: { increment: quantity } }
            });

            // 3b. Verify Serialization
            if (parentItem?.isSerialized) {
                // For fractional quantities, serialization logic is tricky. 
                // We enforce integer check for serialized items.
                if (!Number.isInteger(quantity)) {
                    throw new Error(`Serialized items must be produced in whole numbers.`);
                }
                if (serialNumbers.length !== quantity) {
                    throw new Error(`Item is serialized. You must provide ${quantity} serial numbers.`);
                }
            }

            // 4. Create Production Record
            const run = await tx.productionRun.create({
                data: {
                    itemId: parentId,
                    quantity: quantity,
                    status: 'Completed'
                }
            });

            if (parentItem?.isSerialized) {
                for (const sn of serialNumbers) {
                    // Check if SN exists
                    const existingSn = await tx.serializedItem.findUnique({ where: { sn } });
                    if (existingSn) throw new Error(`Serial Number ${sn} already exists.`);

                    await tx.serializedItem.create({
                        data: {
                            sn,
                            itemId: parentId,
                            status: 'InStock',
                            productionRunId: run.id
                        }
                    });
                }
            }


            // 5. Audit Log (Optional - comment out if SystemLog not in use)
            // await tx.systemLog.create({
            //     data: {
            //         userId: session.user.id,
            //         action: 'Run Production',
            //         entity: 'ProductionRun',
            //         entityId: run.id,
            //         details: `Produced ${quantity} x ${parentItem.sku}`
            //     }
            // });
        });

        console.log(`[runProduction] ✅ Production transaction completed successfully!`);
        revalidatePath('/production');
        revalidatePath('/inventory'); // Inventory also changes
        return { success: true };

    } catch (error: any) {
        console.error('Production Run Failed:', error);
        return { success: false, error: error.message || 'Production failed' };
    }
}

export async function getProductionRuns() {
    try {
        const runs = await prisma.productionRun.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: {
                item: true
            }
        });

        // Convert Decimals to numbers for JSON serialization
        const serializedRuns = runs.map(run => ({
            ...run,
            quantity: Number(run.quantity),
            item: run.item ? {
                ...run.item,
                minStock: Number(run.item.minStock),
                currentStock: Number(run.item.currentStock),
                cost: Number(run.item.cost),
                price: Number(run.item.price)
            } : null
        }));

        return { success: true, data: serializedRuns };
    } catch (error) {
        return { success: false, error: 'Failed to fetch production history' };
    }
}

export async function updateProductionRun(runId: number, newQuantity: number) {
    if (newQuantity <= 0) return { success: false, error: 'Quantity must be positive' };

    try {
        await prisma.$transaction(async (tx) => {
            const run = await tx.productionRun.findUnique({
                where: { id: runId },
                include: { item: true }
            });

            if (!run) throw new Error('Production Run not found');

            const diff = newQuantity - Number(run.quantity);
            if (diff === 0) return; // No change

            // Get BOM for the Item (Parent)
            // Note: We use the CURRENT BOM. If BOM changed since run, this might be inexact, 
            // but standard for simple systems unless we snapshot BOMs.
            const bom = await tx.bOM.findMany({
                where: { parentId: run.itemId }
            });

            if (bom.length === 0) throw new Error('BOM missing for this item. Cannot adjust stock.');

            if (diff > 0) {
                // INCREASE PRODUCTION: Need more components
                for (const line of bom) {
                    const paramsNeeded = Number(line.quantity) * diff;
                    const child = await tx.item.findUnique({ where: { id: line.childId } });
                    if (!child) throw new Error(`Component ${line.childId} missing`);

                    if (Number(child.currentStock) < paramsNeeded) {
                        throw new Error(`Insufficient stock key component ${child.sku} to increase production by ${diff}. Need ${paramsNeeded}.`);
                    }

                    await tx.item.update({
                        where: { id: line.childId },
                        data: { currentStock: { decrement: paramsNeeded } }
                    });
                }

                // Add Product
                await tx.item.update({
                    where: { id: run.itemId },
                    data: { currentStock: { increment: diff } }
                });

            } else {
                // DECREASE PRODUCTION: Return components, remove product
                const removeQty = Math.abs(diff);

                // Remove Product
                // (Check if we have enough product to remove? Theoretically yes if we just made it, 
                // but maybe we sold it? Simple system: Assume we can correct the record, potentially causing negative stock if sold.)
                await tx.item.update({
                    where: { id: run.itemId },
                    data: { currentStock: { decrement: removeQty } }
                });

                // Return Components
                for (const line of bom) {
                    const paramsReturning = Number(line.quantity) * removeQty;
                    await tx.item.update({
                        where: { id: line.childId },
                        data: { currentStock: { increment: paramsReturning } }
                    });
                }
            }

            // Update Run Record
            await tx.productionRun.update({
                where: { id: runId },
                data: { quantity: newQuantity }
            });
        });

        revalidatePath('/production');
        revalidatePath('/inventory');
        return { success: true };
    } catch (error: any) {
        console.error('Update Run Failed:', error);
        return { success: false, error: error.message || 'Failed to update production run' };
    }
}

export async function deleteProductionRun(runId: number) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized' };
        await prisma.productionRun.delete({ where: { id: runId } });
        revalidatePath('/production');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to delete run' };
    }
}

export async function bulkDeleteProductionRuns(ids: number[]) {
    try {
        const session = await getSession();
        if (session?.user?.role !== 'Admin') return { success: false, error: 'Unauthorized' };
        await prisma.productionRun.deleteMany({
            where: {
                id: { in: ids }
            }
        });
        revalidatePath('/production');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to delete runs' };
    }
}
