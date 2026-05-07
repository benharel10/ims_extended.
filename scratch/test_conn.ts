import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    }
});

async function main() {
    try {
        const count = await prisma.item.count();
        console.log('Successfully connected! Items in local DB:', count);
    } catch (e) {
        console.error('Error connecting:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
