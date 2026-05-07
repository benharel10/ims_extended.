import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const result = await prisma.user.updateMany({
            data: { role: 'Admin' }
        });
        console.log(`Successfully updated ${result.count} users to Admin role.`);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
