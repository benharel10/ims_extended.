
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSpecificRuns() {
    console.log("--- Checking Specific Runs ---");

    const runs = await prisma.productionRun.findMany({
        orderBy: { id: 'desc' },
        take: 10,
        include: { item: true }
    });

    runs.forEach(r => {
        console.log(`ID: ${r.id} | Date: ${r.createdAt.toISOString()} | Qty: ${r.quantity} | Item: ${r.item?.name}`);
    });
}

checkSpecificRuns()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
