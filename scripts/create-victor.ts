import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const EMAIL = 'victor.hoepfner@ks-waves.com';
    const PASSWORD = 'Gb#8v!mZ2*5rX$q9Lp@7W&k4';
    const NAME = 'Victor Hoepfner';
    const ROLE = 'Warehouse';

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
