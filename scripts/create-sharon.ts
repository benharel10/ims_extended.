import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const EMAIL = 'sharon.harel@ks-waves.com';
    const PASSWORD = process.env.SHARON_PASSWORD;
    const NAME = 'Sharon Harel';
    const ROLE = 'Admin';

    if (!PASSWORD) {
        throw new Error(
            'SHARON_PASSWORD env var is not set.\n' +
            'Example: $env:SHARON_PASSWORD="<pass>"; npx ts-node scripts/create-sharon.ts'
        );
    }

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
