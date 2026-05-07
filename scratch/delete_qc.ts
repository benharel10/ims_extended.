import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const result = await prisma.inspectionRecord.deleteMany({
            where: { notes: 'Test inspection record generated for development.' }
        });
        console.log('Deleted records:', result.count);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
