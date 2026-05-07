import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const count = await prisma.item.count();
    console.log('Items in local DB:', count);
    
    // Check if soft deleted
    const notDeleted = await prisma.item.count({ where: { deletedAt: null } });
    console.log('Not deleted items:', notDeleted);
    
    await prisma.$disconnect();
}

main();
