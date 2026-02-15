
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@ksw.com';
    const password = 'admin';
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
            email,
            password: hashedPassword,
            name: 'System Admin',
            role: 'Admin',
        },
    });

    // New Admin User
    const newAdminEmail = 'ben.harel@ks-waves.com';
    const newAdminPassword = 'Benharel220'; // In a real app, this should be hashed too!
    const hashedNewAdminPassword = await bcrypt.hash(newAdminPassword, 10);

    const newAdmin = await prisma.user.upsert({
        where: { email: newAdminEmail },
        update: {
            password: hashedNewAdminPassword, // Update password if exists
            role: 'Admin'
        },
        create: {
            email: newAdminEmail,
            password: hashedNewAdminPassword,
            name: 'Ben Harel',
            role: 'Admin',
        },
    });

    console.log({ user, newAdmin });
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
