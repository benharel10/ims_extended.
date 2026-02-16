import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    const item = await prisma.item.findFirst({ where: { sku: 'CHM-00017' } });
    const bom = await prisma.bOM.findMany({ where: { parentId: item?.id }, include: { child: true } });

    console.log('THERMAL PASTE CURRENT STOCK:', String(item?.currentStock));
    console.log('BOM:', bom.map(b => `${b.child.sku} needs ${String(b.quantity)}, currently has ${String(b.child.currentStock)}`).join('; '));

    await prisma.$disconnect();
}

check();
