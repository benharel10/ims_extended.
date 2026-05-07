import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({
        select: { id: true, email: true, role: true, name: true },
    });
    console.log('Current users in DB:', users);

    // reset sharon's password to 'Admin123!'
    const hash = await bcrypt.hash('Admin123!', 12);
    await prisma.user.upsert({
        where: { email: 'sharon.harel@ks-waves.com' },
        update: { password: hash, role: 'Admin' },
        create: { email: 'sharon.harel@ks-waves.com', name: 'Sharon Harel', password: hash, role: 'Admin' }
    });
    console.log('Password for sharon.harel@ks-waves.com reset to: Admin123!');
}

main().finally(() => prisma.$disconnect());
