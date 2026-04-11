'use server';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getUnmappedItems() {
    try {
        const unmappedLines = await prisma.pOLine.findMany({
            where: {
                itemId: null,
                newItemSku: { not: null }
            },
            distinct: ['newItemSku'],
            select: {
                newItemSku: true,
                newItemName: true,
            }
        });

        return { success: true, data: unmappedLines };
    } catch (error: any) {
        console.error('Failed to get unmapped items:', error);
        return { success: false, error: 'Database error' };
    }
}

export async function getInternalItems() {
    try {
        const items = await prisma.item.findMany({
            where: { deletedAt: null },
            select: {
                id: true,
                sku: true,
                name: true,
                description: true
            },
            orderBy: { name: 'asc' }
        });
        return { success: true, data: items };
    } catch (error: any) {
        return { success: false, error: 'Failed to load items' };
    }
}

export async function saveSkuMapping(externalSku: string, externalName: string, internalItemId: number) {
    try {
        await prisma.$transaction(async (tx) => {
            // 1. Create Mapping Record so future webhooks match it
            await tx.externalMapping.upsert({
                where: {
                    externalSku_source: {
                        externalSku: externalSku,
                        source: 'iCount'
                    }
                },
                update: {
                    internalItemId: internalItemId,
                    externalName: externalName
                },
                create: {
                    externalSku: externalSku,
                    externalName: externalName,
                    source: 'iCount',
                    internalItemId: internalItemId
                }
            });

            // 2. Retroactively fix existing historical PO Lines
            // Find the internal item to get its cost
            const internalItem = await tx.item.findUnique({
                where: { id: internalItemId },
                select: { cost: true }
            });
            const newCost = internalItem?.cost || 0;

            // Find all lines with this unidentified SKU
            const linesToFix = await tx.pOLine.findMany({
                where: { itemId: null, newItemSku: externalSku }
            });

            if (linesToFix.length > 0) {
                // Update the lines
                await tx.pOLine.updateMany({
                    where: { itemId: null, newItemSku: externalSku },
                    data: {
                        itemId: internalItemId,
                        newItemSku: null,
                        newItemName: null,
                        isAutoMapped: true,
                        ...(newCost > 0 ? { unitCost: newCost } : {})
                    }
                });

                // Gather affected PO IDs to review
                const poIds = [...new Set(linesToFix.map(l => l.poId))];

                // For each PO, figure out if it still has unmapped lines
                for (const poId of poIds) {
                    const remainingUnmapped = await tx.pOLine.count({
                        where: { poId: poId, itemId: null }
                    });

                    // If zero remaining unmapped -> PO is resolved
                    if (remainingUnmapped === 0) {
                        const po = await tx.purchaseOrder.findUnique({ where: { id: poId } });
                        if (po) {
                            // Only switch status to Synced if it was formally stuck on Pending SKU Mapping
                            const finalStatus = po.status === 'Pending SKU Mapping' ? 'Synced' : po.status;
                            await tx.purchaseOrder.update({
                                where: { id: poId },
                                data: {
                                    pendingManualMapping: false,
                                    status: finalStatus
                                }
                            });
                        }
                    }
                }
            }
        });

        return { success: true, message: 'Mapping saved and retroactive POs fixed!' };
    } catch (error: any) {
        console.error('Error saving mapping:', error);
        return { success: false, error: 'Database error occurred. Please contact support if this persists.' };
    }
}

export async function deleteUnmappedItem(externalSku: string, externalName: string) {
    try {
        await prisma.$transaction(async (tx) => {
            // Find all lines with this unidentified SKU
            const linesToDelete = await tx.pOLine.findMany({
                where: { itemId: null, newItemSku: externalSku, newItemName: externalName }
            });

            if (linesToDelete.length > 0) {
                // Gather affected PO IDs to review before deleting
                const poIds = [...new Set(linesToDelete.map(l => l.poId))];

                // Delete the lines
                await tx.pOLine.deleteMany({
                    where: { itemId: null, newItemSku: externalSku, newItemName: externalName }
                });

                // For each PO, check if it's now fully mapped or empty
                for (const poId of poIds) {
                    const remainingUnmapped = await tx.pOLine.count({
                        where: { poId: poId, itemId: null }
                    });

                    // If zero remaining unmapped -> PO status might change
                    if (remainingUnmapped === 0) {
                        const po = await tx.purchaseOrder.findUnique({ where: { id: poId } });
                        if (po) {
                            const finalStatus = po.status === 'Pending SKU Mapping' ? 'Synced' : po.status;
                            await tx.purchaseOrder.update({
                                where: { id: poId },
                                data: {
                                    pendingManualMapping: false,
                                    status: finalStatus
                                }
                            });
                        }
                    }
                }
            }
        });

        return { success: true, message: 'Unmapped item records deleted successfully' };
    } catch (error: any) {
        console.error('Error deleting unmapped item:', error);
        return { success: false, error: 'Database error' };
    }
}
