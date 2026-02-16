
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testGetItems() {
    console.log("--- SIMULATING getItems() SERVER ACTION ---");

    try {
        // Simulate what getItems() does
        const items = await prisma.item.findMany({
            include: {
                stocks: {
                    include: {
                        warehouse: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        console.log(`✅ Found ${items.length} items`);

        if (items.length > 0) {
            console.log("\nFirst 5 items:");
            items.slice(0, 5).forEach(item => {
                console.log(`  - ${item.sku}: ${item.name} (Stock: ${item.currentStock}, Type: ${typeof item.currentStock})`);
            });
        }

        // Check if JSON serialization works
        const json = JSON.stringify(items);
        console.log(`\n✅ JSON serialization successful. Size: ${(json.length / 1024).toFixed(2)} KB`);

        return { success: true, data: items };

    } catch (error: any) {
        console.error("❌ Error:", error.message);
        return { success: false, error: error.message };
    }
}

testGetItems()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
