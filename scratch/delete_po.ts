import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const poNumber = 'PO-1778064454479';
    
    const po = await prisma.purchaseOrder.findUnique({
        where: { poNumber },
        include: { lines: true, inspectionRecords: true }
    });

    if (!po) {
        console.log(`PO ${poNumber} not found.`);
        return;
    }

    console.log('Found PO:', po.id, 'Status:', po.status);

    // 1. Revert received stock
    for (const line of po.lines) {
        if (line.received > 0 && line.itemId) {
            console.log(`Reverting ${line.received} units for item ${line.itemId}`);
            
            // Decrement global stock
            await prisma.item.update({
                where: { id: line.itemId },
                data: { currentStock: { decrement: line.received } }
            });

            // Find a warehouse stock to decrement
            const itemStocks = await prisma.itemStock.findMany({
                where: { itemId: line.itemId },
                orderBy: { quantity: 'desc' }
            });
            
            if (itemStocks.length > 0) {
                await prisma.itemStock.update({
                    where: { id: itemStocks[0].id },
                    data: { quantity: { decrement: line.received } }
                });
            }
        }
    }

    // 2. Delete Logs
    await prisma.systemLog.deleteMany({
        where: { entity: 'PurchaseOrder', entityId: po.id }
    });

    // 3. Delete PO Lines
    await prisma.pOLine.deleteMany({
        where: { poId: po.id }
    });

    // 4. Delete Inspection Records
    await prisma.inspectionRecord.deleteMany({
        where: { poId: po.id }
    });

    // 5. Delete the PO
    await prisma.purchaseOrder.delete({
        where: { id: po.id }
    });

    console.log(`✅ Successfully deleted PO ${poNumber} and reverted stock.`);
}

main().finally(() => prisma.$disconnect());
