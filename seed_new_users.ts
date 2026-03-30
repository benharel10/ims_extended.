import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const users = [
        {
            email: 'sharon.harel@ks-waves.com',
            name: 'Sharon Harel',
            role: 'Admin',
            password: 'K9#fP2!vLq7*Zt$5nB@x8W&m',
        },
        {
            email: 'victor.hoepfner@ks-waves.com',
            name: 'Victor Hoepfner',
            role: 'Warehouse',
            password: 'Gb#8v!mZ2*5rX$q9Lp@7W&k4',
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
