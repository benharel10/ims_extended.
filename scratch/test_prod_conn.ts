import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.PROD_DATABASE_URL
        }
    }
});

async function main() {
    try {
        const count = await prisma.item.count();
        console.log('Successfully connected to PROD! Items in DB:', count);
    } catch (e) {
        console.error('Error connecting to PROD:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
