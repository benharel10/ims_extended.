import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "postgresql://neondb_owner:npg_ndIuzHe3pfi6@ep-young-brook-ai7uc4we-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
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
