
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugProduction() {
    console.log("--- Debugging Production Runs ---");

    // 1. Fetch recent runs
    const runs = await prisma.productionRun.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { item: true }
    });

    console.log("Recent Runs in DB:");
    runs.forEach(r => {
        console.log(`ID: ${r.id}, Item: ${r.item?.sku}, Qty: ${r.quantity} (Type: ${typeof r.quantity})`);
    });

    // 2. Try to create a fractional run manually (to verify Schema allows Floats)
    try {
        // Find a product or create one
        let product = await prisma.item.findFirst({ where: { type: 'Product' } });
        if (!product) {
            console.log("No Product found, creating temp...");
            product = await prisma.item.create({
                data: { sku: 'DEBUG-PROD', name: 'Debug Product', type: 'Product', cost: 0, price: 0, minStock: 0, currentStock: 0 }
            });
        }

        console.log(`Attempting to create run for Item ${product.id} with Qty 1.5...`);
        const run = await prisma.productionRun.create({
            data: {
                itemId: product.id,
                quantity: 1.5,
                status: 'Debug'
            }
        });
        console.log(`✅ Success! Created Run ID ${run.id} with Qty ${run.quantity}`);

        // Cleanup
        await prisma.productionRun.delete({ where: { id: run.id } });
        if (product.sku === 'DEBUG-PROD') await prisma.item.delete({ where: { id: product.id } });

    } catch (e) {
        console.error("❌ Failed to create fractional run:", e);
    }
}

debugProduction()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
