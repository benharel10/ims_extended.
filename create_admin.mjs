// create_admin.mjs -- run with: node create_admin.mjs
// Requires env var: ADMIN_PASSWORD
// Example: $env:ADMIN_PASSWORD="<pass>"; node create_admin.mjs
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const EMAIL = 'ben.harel@ks-waves.com';
const PASSWORD = process.env.ADMIN_PASSWORD;
const NAME = 'Ben Harel';
const ROLE = 'Admin';

if (!PASSWORD) {
    console.error('❌ ADMIN_PASSWORD env var is not set. Aborting.');
    process.exit(1);
}

async function main() {
    const hash = await bcrypt.hash(PASSWORD, 12);

    const user = await prisma.user.upsert({
        where: { email: EMAIL },
        update: { password: hash, name: NAME, role: ROLE },
        create: { email: EMAIL, password: hash, name: NAME, role: ROLE },
    });

    console.log(`✅ User ready: ${user.email} (${user.role}) — ID ${user.id}`);
}

main()
    .catch(e => { console.error('❌ Error:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
