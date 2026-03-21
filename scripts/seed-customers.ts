import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const customers = ['Tait', 'Dfend', 'Elbit', 'BA', 'Alma Laser'];
    for (const name of customers) {
        await prisma.customer.upsert({
            where: { name },
            update: {},
            create: { name }
        });
    }
    console.log('✅ Customers seeded:', customers.join(', '));
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
