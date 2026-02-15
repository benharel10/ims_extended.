
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const existing = await prisma.user.findFirst();
    if (existing) {
        console.log('User already exists, skipping seed.');
        return;
    }

    await prisma.user.create({
        data: {
            email: 'admin@ims.com',
            password: 'password123',
            name: 'System Admin',
            role: 'Admin'
        }
    });
    console.log('Created default user: admin@ims.com / password123');
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
