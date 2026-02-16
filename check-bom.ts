import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkBOM() {
    try {
        // Find thermal paste
        const item = await prisma.item.findFirst({
            where: { sku: 'CHM-00017' }
        });

        console.log('Item:', item?.name);
        console.log('Item ID:', item?.id);

        // Check BOM
        const bom = await prisma.bOM.findMany({
            where: { parentId: item?.id },
            include: { child: true, parent: true }
        });

        console.log('\nBOM Count:', bom.length);
        console.log('BOM:', JSON.stringify(bom, null, 2));

        // Check all BOMs
        const allBoms = await prisma.bOM.findMany({
            include: { parent: true, child: true }
        });

        console.log('\nAll BOMs in system:', allBoms.length);
        allBoms.forEach(b => {
            console.log(`- Parent: ${b.parent.sku}, Child: ${b.child.sku}, Qty: ${b.quantity}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkBOM();
