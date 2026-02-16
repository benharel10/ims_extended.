
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function diagnose() {
    console.log("--- DIAGNOSING PRODUCTION ISSUE ---");

    // 1. Check Column Type (Raw SQL)
    try {
        const result = await prisma.$queryRaw`
            SELECT column_name, data_type, udt_name
            FROM information_schema.columns 
            WHERE table_name = 'ProductionRun' AND column_name = 'quantity';
        `;
        console.log("Column Type in DB:", result);
    } catch (e) {
        console.error("Failed to check column type:", e);
    }

    // 2. Create a Test Run with Hardcoded Quantity 5
    try {
        // Find or create a test item
        let item = await prisma.item.findFirst({ where: { type: 'Product' } });
        if (!item) {
            item = await prisma.item.create({
                data: { sku: 'TEST-PROD-FIX', name: 'Test Product', type: 'Product', currentStock: 100, cost: 0, price: 0, minStock: 0 }
            });
        }

        console.log(`Creating run for Item ${item.id} with Quantity 5...`);
        const run = await prisma.productionRun.create({
            data: {
                itemId: item.id,
                quantity: 5,
                status: 'Test'
            }
        });

        console.log(`Created Run ID: ${run.id}`);
        console.log(`Run Quantity returned by Prisma: ${run.quantity}`);

        // 3. Verify what is actually in DB
        const savedRun = await prisma.productionRun.findUnique({ where: { id: run.id } });
        console.log(`Run Quantity in DB (fetch): ${savedRun?.quantity}`);

        // Cleanup
        await prisma.productionRun.delete({ where: { id: run.id } });
        if (item.sku === 'TEST-PROD-FIX') await prisma.item.delete({ where: { id: item.id } });

    } catch (e) {
        console.error("Test Run Failed:", e);
    }
}

diagnose()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
