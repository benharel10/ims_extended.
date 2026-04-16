import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log('--- SYSTEM ERRORS ---');
        const errors = await prisma.systemError.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' }
        });
        console.log('Errors count:', errors.length);
        errors.forEach(e => {
            console.log(`[${e.createdAt.toISOString()}] ${e.context}: ${e.message}`);
        });
    } catch (error: any) {
        console.error('❌ Error fetching system errors:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
