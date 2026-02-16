
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkColumnType() {
    console.log("--- Checking Column Type in Postgres ---");

    // Raw query to check column type
    const result = await prisma.$queryRaw`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'ProductionRun' AND column_name = 'quantity';
    `;

    console.log(result);
}

checkColumnType()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
