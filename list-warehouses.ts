import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function showWarehouses() {
    console.log('Warehouses:');
    const warehouses = await prisma.warehouse.findMany();
    warehouses.forEach(w => console.log(`- ${w.name} (ID: ${w.id})`));
    await prisma.$disconnect();
}

showWarehouses();
