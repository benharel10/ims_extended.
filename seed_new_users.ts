import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const sharonPassword = process.env.SHARON_PASSWORD;
    const victorPassword = process.env.VICTOR_PASSWORD;

    if (!sharonPassword || !victorPassword) {
        throw new Error(
            'Missing required env vars: SHARON_PASSWORD and VICTOR_PASSWORD must be set before running this script.\n' +
            'Example: $env:SHARON_PASSWORD="<pass>"; $env:VICTOR_PASSWORD="<pass>"; npx ts-node seed_new_users.ts'
        );
    }

    const users = [
        {
            email: 'sharon.harel@ks-waves.com',
            name: 'Sharon Harel',
            role: 'Admin',
            password: sharonPassword,
        },
        {
            email: 'victor.hoepfner@ks-waves.com',
            name: 'Victor Hoepfner',
            role: 'Warehouse',
            password: victorPassword,
        },
    ];

    console.log('🔌 Connecting to database...\n');

    const allUsersBefore = await prisma.user.findMany({
        select: { id: true, email: true, role: true, name: true },
    });
    console.log('📋 Current users in DB:', JSON.stringify(allUsersBefore, null, 2));
    console.log('');

    for (const u of users) {
        const hash = await bcrypt.hash(u.password, 12);
        const result = await prisma.user.upsert({
            where: { email: u.email },
            update: { password: hash, name: u.name, role: u.role },
            create: { email: u.email, password: hash, name: u.name, role: u.role },
        });
        console.log(`✅ Upserted: ${result.email}  |  Role: ${result.role}  |  ID: ${result.id}`);
    }

    console.log('\n🎉 Done! Both users are ready to sign in.');
}

main()
    .catch(e => {
        console.error('❌ Error:', e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
