import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const EMAIL = 'moti.belo@ks-waves.com';
    const PASSWORD = process.env.MOTI_PASSWORD;
    const NAME = 'Moti Belo';
    const ROLE = 'Warehouse';

    if (!PASSWORD) {
        throw new Error(
            'MOTI_PASSWORD env var is not set.\n' +
            'Example: $env:MOTI_PASSWORD="<pass>"; npx ts-node scripts/create-moti.ts'
        );
    }

    console.log(`Creating/updating user: ${EMAIL}...`);

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
