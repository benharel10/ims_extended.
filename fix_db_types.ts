
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixDatabaseTypes() {
    console.log("--- FIXING DATABASE TYPES ---");

    try {
        console.log("1. Altering ProductionRun.quantity to INTEGER...");
        await prisma.$executeRaw`
            ALTER TABLE "ProductionRun" 
            ALTER COLUMN "quantity" TYPE INTEGER 
            USING ROUND("quantity")::INTEGER;
        `;
        console.log("✅ ProductionRun fixed.");

        console.log("2. Altering ItemStock.quantity to INTEGER...");
        await prisma.$executeRaw`
            ALTER TABLE "ItemStock" 
            ALTER COLUMN "quantity" TYPE INTEGER 
            USING ROUND("quantity")::INTEGER;
        `;
        console.log("✅ ItemStock fixed.");

        console.log("3. Altering Item.currentStock/minStock to INTEGER...");
        await prisma.$executeRaw`
            ALTER TABLE "Item" 
            ALTER COLUMN "currentStock" TYPE INTEGER 
            USING ROUND("currentStock")::INTEGER;
        `;
        await prisma.$executeRaw`
            ALTER TABLE "Item" 
            ALTER COLUMN "minStock" TYPE INTEGER 
            USING ROUND("minStock")::INTEGER;
        `;
        console.log("✅ Item fixed.");

        // Verification
        const result = await prisma.$queryRaw`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'ProductionRun' AND column_name = 'quantity';
        `;
        console.log("New Column Type:", result);

    } catch (e) {
        console.error("❌ Failed to fix types:", e);
    }
}

fixDatabaseTypes()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
