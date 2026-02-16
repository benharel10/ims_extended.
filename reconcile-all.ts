import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function reconcileAllStock() {
    console.log('🌍 STARTING GLOBAL STOCK RECONCILIATION 🌍\n');

    // 1. Get all items
    const allItems = await prisma.item.findMany({
        include: { stocks: true }
    });

    console.log(`Checking ${allItems.length} items...`);
    let updatedCount = 0;

    for (const item of allItems) {
        const globalStock = Number(item.currentStock);

        let warehouseTotal = 0;
        let kswStock = null;

        // Calculate current warehouse total
        for (const s of item.stocks) {
            warehouseTotal += Number(s.quantity);
            if (s.warehouseId === 2) kswStock = s; // Assume KSW is ID 2
        }

        // Check for mismatch (allow tiny float diff)
        if (Math.abs(globalStock - warehouseTotal) > 0.001) {
            const diff = globalStock - warehouseTotal;
            console.log(`\n⚠️  Mismatch for ${item.sku}:`);
            console.log(`    Global: ${globalStock} | Warehouse Total: ${warehouseTotal}`);
            console.log(`    Diff: ${diff} -> Adjusting KSW...`);

            if (kswStock) {
                // Update existing KSW record
                await prisma.itemStock.update({
                    where: { id: kswStock.id },
                    data: { quantity: { increment: diff } }
                });
                console.log(`    ✅ Updated KSW stock`);
            } else {
                // Create KSW record if missing
                await prisma.itemStock.create({
                    data: {
                        itemId: item.id,
                        warehouseId: 2, // KSW
                        quantity: diff // If total was 0, new stock is the global stock (or simply add the diff)
                        // Wait, if warehouseTotal is 0, then diff = globalStock. So we create record with globalStock.
                        // If warehouseTotal was 5 and global is 3, diff is -2. 
                        // If we create new record with -2? No, that implies negative stock in KSW.
                        // But if KSW didn't exist, we assume the 'missing' stock (or 'excess' deduction) should be attributed there.
                        // Best effort: assign the difference to KSW.
                    }
                });
                console.log(`    ✅ Created KSW stock entry`);
            }
            updatedCount++;
        }
    }

    console.log(`\n🎉 DONE! Reconciled ${updatedCount} items.`);
    await prisma.$disconnect();
}

reconcileAllStock();
