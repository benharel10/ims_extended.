const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const items = await prisma.item.findMany({
        where: { sku: { contains: 'ERJ-3GEY0R00V', mode: 'insensitive' } },
        include: { stocks: { include: { warehouse: true } } }
    });
    console.log(`Found ${items.length} items`);
    items.forEach(i => {
        console.log(`ID: ${i.id}, SKU: "${i.sku}", Stock Records: ${i.stocks.length}`);
        i.stocks.forEach(s => {
            console.log(`  - Warehouse: ${s.warehouse.name} (ID: ${s.warehouseId}), Qty: ${s.quantity}`);
        });
    });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
