
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testGetItemsWithDecimal() {
    console.log("--- TESTING getItems() WITH DECIMAL SCHEMA ---");

    try {
        const items = await prisma.item.findMany({
            include: {
                stocks: {
                    include: {
                        warehouse: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 3
        });

        console.log(`✅ Found ${items.length} items\n`);

        if (items.length > 0) {
            items.forEach((item, idx) => {
                console.log(`\nItem ${idx + 1}:`);
                console.log(`  SKU: ${item.sku}`);
                console.log(`  Name: ${item.name}`);
                console.log(`  CurrentStock: ${item.currentStock} (Type: ${typeof item.currentStock})`);
                console.log(`  MinStock: ${item.minStock} (Type: ${typeof item.minStock})`);
                console.log(`  UOM: ${item.uom}`);

                // Check if it's a Prisma Decimal
                console.log(`  CurrentStock constructor: ${item.currentStock?.constructor?.name}`);
            });
        }

        // Try to serialize to JSON (this is what Next.js does)
        console.log("\n--- TESTING JSON SERIALIZATION ---");
        try {
            const json = JSON.stringify(items);
            console.log("❌ ISSUE: Prisma Decimal doesn't serialize to JSON by default!");
            console.log(`JSON size: ${(json.length / 1024).toFixed(2)} KB`);
        } catch (e: any) {
            console.error("❌ JSON Serialization failed:", e.message);
        }

        // Test conversion to plain object
        console.log("\n--- TESTING CONVERSION TO NUMBER ---");
        const converted = items.map(item => ({
            ...item,
            currentStock: Number(item.currentStock),
            minStock: Number(item.minStock),
            cost: Number(item.cost),
            price: Number(item.price),
            stocks: item.stocks.map(s => ({
                ...s,
                quantity: Number(s.quantity)
            }))
        }));

        const convertedJson = JSON.stringify(converted);
        console.log("✅ Conversion successful!");
        console.log(`JSON size: ${(convertedJson.length / 1024).toFixed(2)} KB`);

    } catch (error: any) {
        console.error("❌ Error:", error.message);
        console.error(error);
    }
}

testGetItemsWithDecimal()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
