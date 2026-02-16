import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkStockDiscrepancy() {
    console.log('🔍 Checking Stock Discrepancy for CHM-00017...\n');

    const item = await prisma.item.findFirst({
        where: { sku: 'CHM-00017' },
        include: {
            stocks: {
                include: { warehouse: true }
            }
        }
    });

    if (!item) {
        console.log('❌ Item not found');
        return;
    }

    console.log(`📦 Item: ${item.name} (${item.sku})`);
    console.log(`   Global 'currentStock': ${item.currentStock}`);

    let calculatedTotal = 0;
    console.log(`\n🏭 Warehouse Stocks:`);
    for (const stock of item.stocks) {
        console.log(`   - ${stock.warehouse.name}: ${stock.quantity}`);
        calculatedTotal += Number(stock.quantity);
    }

    console.log(`\n∑ Calculated Total: ${calculatedTotal}`);
    console.log(`Δ Difference: ${Number(item.currentStock) - calculatedTotal}`);

    if (Number(item.currentStock) !== calculatedTotal) {
        console.log('\n❌ MISMATCH DETECTED! Global stock != Sum of Warehouse stocks');
    } else {
        console.log('\n✅ Data is consistent.');
    }

    await prisma.$disconnect();
}

checkStockDiscrepancy();
