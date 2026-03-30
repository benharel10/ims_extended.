import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({
        select: { id: true, email: true, role: true, name: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
    });
    console.log('All users in production DB:');
    console.log(JSON.stringify(users, null, 2));
}

main()
    .catch(e => { console.error('Error:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
