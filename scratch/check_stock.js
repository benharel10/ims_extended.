const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const item = await prisma.item.findFirst({
        where: { sku: 'Panasonic ERJ-3GEY0R00V' },
        include: { stocks: { include: { warehouse: true } } }
    });
    console.log(JSON.stringify(item, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
