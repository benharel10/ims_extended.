/**
 * Test script to verify decimal production deduction
 * Run with: npx tsx test-production.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testProduction() {
    console.log('🔍 Testing Production Decimal Deduction...\n');

    try {
        // 1. Find the thermal paste item
        const thermalPaste = await prisma.item.findFirst({
            where: { sku: 'CHM-00017' }
        });

        if (!thermalPaste) {
            console.error('❌ Thermal paste item not found!');
            return;
        }

        console.log(`📦 Item: ${thermalPaste.name} (${thermalPaste.sku})`);
        console.log(`   Current Stock: ${thermalPaste.currentStock}\n`);

        // 2. Get BOM
        const bom = await prisma.bOM.findMany({
            where: { parentId: thermalPaste.id },
            include: { child: true }
        });

        if (bom.length === 0) {
            console.error('❌ No BOM found for this item!');
            return;
        }

        console.log(`📋 BOM (${bom.length} components):`);
        for (const line of bom) {
            console.log(`   - ${line.child.sku}: qty=${line.quantity} (current stock: ${line.child.currentStock})`);
        }

        // 3. Calculate what should be deducted for 0.1 production
        const productionQty = 0.1;
        console.log(`\n🏭 Simulating production of ${productionQty} units:\n`);

        for (const line of bom) {
            const requiredQty = Number(line.quantity) * productionQty;
            const newStock = Number(line.child.currentStock) - requiredQty;
            console.log(`   ${line.child.sku}:`);
            console.log(`      BOM Qty: ${line.quantity}`);
            console.log(`      Required: ${requiredQty}`);
            console.log(`      Current Stock: ${line.child.currentStock}`);
            console.log(`      Expected After: ${newStock}`);
            console.log(`      Type of currentStock: ${typeof line.child.currentStock}`);
            console.log(`      Is Decimal object: ${line.child.currentStock.constructor.name}\n`);
        }

        // 4. Test actual production
        console.log('⚙️ Testing actual production in transaction...\n');

        await prisma.$transaction(async (tx) => {
            for (const line of bom) {
                const requiredQty = Number(line.quantity) * productionQty;

                console.log(`   Decrementing ${line.child.sku} by ${requiredQty}...`);

                const updated = await tx.item.update({
                    where: { id: line.childId },
                    data: { currentStock: { decrement: requiredQty } }
                });

                console.log(`   ✓ New stock: ${updated.currentStock}`);
            }

            // Add to parent
            const updatedParent = await tx.item.update({
                where: { id: thermalPaste.id },
                data: { currentStock: { increment: productionQty } }
            });

            console.log(`\n   ✓ Parent ${thermalPaste.sku} new stock: ${updatedParent.currentStock}`);

            // Create production run record
            await tx.productionRun.create({
                data: {
                    itemId: thermalPaste.id,
                    quantity: productionQty,
                    status: 'Completed'
                }
            });

            console.log('   ✓ Production run created');
        });

        console.log('\n✅ TEST PASSED: Production transaction completed successfully!');

        // 5. Verify final state
        const finalBom = await prisma.bOM.findMany({
            where: { parentId: thermalPaste.id },
            include: { child: true }
        });

        console.log('\n📊 Final Component Stocks:');
        for (const line of finalBom) {
            console.log(`   ${line.child.sku}: ${line.child.currentStock}`);
        }

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testProduction();
