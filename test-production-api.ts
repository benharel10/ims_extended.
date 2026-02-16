/**
 * Direct API test for production
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('\n🔍 CHECKING CURRENT STATE\n');

    // 1. Find the thermal paste item
    const item = await prisma.item.findFirst({
        where: { sku: 'CHM-00017' }
    });

    if (!item) {
        console.log('❌ Item not found');
        return;
    }

    // Get BOM separately
    const bom = await prisma.bOM.findMany({
        where: { parentId: item.id },
        include: {
            child: true
        }
    });

    console.log(`📦 Item: ${item.name} (SKU: ${item.sku})`);
    console.log(`   Type: ${item.type}`);
    console.log(`   Current Stock: ${item.currentStock}`);
    console.log(`   Current Stock Type: ${typeof item.currentStock}`);
    console.log(`   Current Stock Constructor: ${item.currentStock.constructor.name}`);

    console.log(`\n📋 BOM Components (${bom.length}):`);

    const componentsBefore: any[] = [];
    for (const bomLine of bom) {
        console.log(`\n   Component: ${bomLine.child.sku} - ${bomLine.child.name}`);
        console.log(`      BOM Quantity: ${bomLine.quantity} (${typeof bomLine.quantity})`);
        console.log(`      Current Stock: ${bomLine.child.currentStock}`);

        componentsBefore.push({
            id: bomLine.child.id,
            sku: bomLine.child.sku,
            name: bomLine.child.name,
            bomQty: bomLine.quantity,
            stockBefore: bomLine.child.currentStock
        });
    }

    // 2. Simulate production of 0.1 units
    const productionQty = 0.1;
    console.log(`\n\n🏭 SIMULATING PRODUCTION OF ${productionQty} UNITS\n`);

    for (const comp of componentsBefore) {
        const required = Number(comp.bomQty) * productionQty;
        const expected = Number(comp.stockBefore) - required;
        console.log(`   ${comp.sku}:`);
        console.log(`      Required: ${comp.bomQty} × ${productionQty} = ${required}`);
        console.log(`      Stock: ${comp.stockBefore} → ${expected}`);
    }

    console.log('\n\n⚙️  EXECUTING PRODUCTION TRANSACTION...\n');

    try {
        await prisma.$transaction(async (tx) => {
            // Process each BOM line
            for (const bomLine of bom) {
                const requiredQty = Number(bomLine.quantity) * productionQty;

                console.log(`   Deducting ${requiredQty} from ${bomLine.child.sku}...`);

                await tx.item.update({
                    where: { id: bomLine.child.id },
                    data: { currentStock: { decrement: requiredQty } }
                });
            }

            // Add to parent
            console.log(`   Adding ${productionQty} to ${item.sku}...`);
            await tx.item.update({
                where: { id: item.id },
                data: { currentStock: { increment: productionQty } }
            });

            // Create production run
            await tx.productionRun.create({
                data: {
                    itemId: item.id,
                    quantity: productionQty,
                    status: 'Completed'
                }
            });
        });

        console.log('\n✅ TRANSACTION COMPLETED SUCCESSFULLY!\n');

    } catch (error) {
        console.log('\n❌ TRANSACTION FAILED:', error);
        return;
    }

    // 3. Check the result
    console.log('\n📊 VERIFYING FINAL STATE\n');

    const bomAfter = await prisma.bOM.findMany({
        where: { parentId: item.id },
        include: {
            child: true
        }
    });

    const itemAfter = await prisma.item.findUnique({
        where: { id: item.id }
    });

    console.log(`📦 ${itemAfter!.name}:`);
    console.log(`   Stock After: ${itemAfter!.currentStock}`);
    console.log(`   Expected: ${Number(item.currentStock) + productionQty}`);

    console.log(`\n📋 Components After:\n`);
    for (let i = 0; i < componentsBefore.length; i++) {
        const comp = componentsBefore[i];
        const after = bomAfter.find(b => b.child.id === comp.id);
        const required = Number(comp.bomQty) * productionQty;
        const expected = Number(comp.stockBefore) - required;

        console.log(`   ${comp.sku}:`);
        console.log(`      Before: ${comp.stockBefore}`);
        console.log(`      After:  ${after?.child.currentStock}`);
        console.log(`      Expected: ${expected}`);
        console.log(`      Match: ${Number(after?.child.currentStock) === expected ? '✅' : '❌'}`);
        console.log();
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
