import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const EMAIL = 'ben.harel@ks-waves.com';
    const PASSWORD = process.env.ADMIN_PASSWORD;

    if (!PASSWORD) {
        throw new Error(
            'ADMIN_PASSWORD env var is not set.\n' +
            'Example: $env:ADMIN_PASSWORD="<pass>"; npx ts-node create_admin.ts'
        );
    }

    console.log('Connecting to database...');

    const hash = await bcrypt.hash(PASSWORD, 12);

    // List current users first
    const allUsers = await prisma.user.findMany({
        select: { id: true, email: true, role: true, name: true }
    });
    console.log('Current users in DB:', JSON.stringify(allUsers, null, 2));

    // Upsert admin user
    const user = await prisma.user.upsert({
        where: { email: EMAIL },
        update: { password: hash, name: 'Ben Harel', role: 'Admin' },
        create: { email: EMAIL, password: hash, name: 'Ben Harel', role: 'Admin' },
    });

    console.log(`\n✅ User upserted: ${user.email} (${user.role}) — ID ${user.id}`);
}

main()
    .catch(e => {
        console.error('❌ Error:', e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
