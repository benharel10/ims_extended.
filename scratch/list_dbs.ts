import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const dbs = await prisma.$queryRawUnsafe(`SELECT datname FROM pg_database WHERE datistemplate = false;`);
    console.log('Available databases:', dbs);
}

main().finally(() => prisma.$disconnect());
