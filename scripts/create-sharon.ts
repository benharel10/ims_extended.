import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const EMAIL = 'sharon.harel@ks-waves.com';
    const PASSWORD = 'K9#fP2!vLq7*Zt$5nB@x8W&m';
    const NAME = 'Sharon Harel';
    const ROLE = 'Admin';

    console.log(`Creating user: ${EMAIL}...`);

    const hash = await bcrypt.hash(PASSWORD, 12);

    const user = await prisma.user.upsert({
        where: { email: EMAIL },
        update: { password: hash, name: NAME, role: ROLE },
        create: { email: EMAIL, password: hash, name: NAME, role: ROLE },
    });

    console.log(`\n✅ User upserted successfully: ${user.email} (${user.role}) — ID ${user.id}`);
}

main()
    .catch(e => {
        console.error('❌ Error:', e.message);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
