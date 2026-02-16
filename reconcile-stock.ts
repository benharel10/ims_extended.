import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function reconcileStock() {
    console.log('🔧 Reconciling Stock for CHM-00017 and components...\n');

    // 1. Get Parent and Components
    const parent = await prisma.item.findFirst({
        where: { sku: 'CHM-00017' },
        include: {
            parentBOMs: { // updated from bOMsAsParent
                include: { child: true }
            }
        }
    });

    if (!parent) {
        console.log('Parent not found');
        return;
    }

    const itemsToCheck = [parent, ...parent.parentBOMs.map(b => b.child)];

    for (const item of itemsToCheck) {
        console.log(`\nChecking ${item.sku} (${item.name})...`);
        const globalStock = Number(item.currentStock);

        const stocks = await prisma.itemStock.findMany({
            where: { itemId: item.id }
        });

        let warehouseTotal = 0;
        let kswStock = null;
        let otherStock = null;

        for (const s of stocks) {
            warehouseTotal += Number(s.quantity);
            if (s.warehouseId === 2) kswStock = s; // Assume KSW is ID 2
            else otherStock = s; // Just grab any other
        }

        console.log(`   Global: ${globalStock}`);
        console.log(`   Warehouse Total: ${warehouseTotal}`);

        if (Math.abs(globalStock - warehouseTotal) > 0.001) {
            const diff = globalStock - warehouseTotal;
            console.log(`   ❌ Mismatch! Diff: ${diff}`);
            console.log(`   👉 Adjusting KSW warehouse stock to match global...`);

            if (kswStock) {
                await prisma.itemStock.update({
                    where: { id: kswStock.id },
                    data: { quantity: { increment: diff } }
                });
                console.log(`      Updated KSW stock by ${diff}`);
            } else {
                // Create KSW stock
                await prisma.itemStock.create({
                    data: {
                        itemId: item.id,
                        warehouseId: 2,
                        quantity: diff // If total was 0, new stock is the global stock
                    }
                });
                console.log(`      Created KSW stock with ${diff}`);
            }
        } else {
            console.log(`   ✅ Synced.`);
        }
    }

    await prisma.$disconnect();
}

reconcileStock();
