import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "postgresql://neondb_owner:npg_ndIuzHe3pfi6@ep-curly-river-ai2v9888.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"
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
