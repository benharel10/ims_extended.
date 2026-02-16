
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkItems() {
    console.log("--- CHECKING ITEMS IN DATABASE ---");

    try {
        const count = await prisma.item.count();
        console.log(`Total Items in DB: ${count}`);

        const items = await prisma.item.findMany({
            take: 10,
            orderBy: { id: 'asc' }
        });

        console.log("\nFirst 10 Items:");
        items.forEach(item => {
            console.log(`ID: ${item.id} | SKU: ${item.sku} | Name: ${item.name} | Stock: ${item.currentStock}`);
        });

        // Check column types
        const result = await prisma.$queryRaw`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'Item' AND column_name IN ('currentStock', 'minStock');
        `;
        console.log("\nItem Column Types:", result);

    } catch (e) {
        console.error("Error checking items:", e);
    }
}

checkItems()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
