// create_admin.mjs -- run with: node create_admin.mjs
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const EMAIL = 'ben.harel@ks-waves.com';
const PASSWORD = 'Benharel220';
const NAME = 'Ben Harel';
const ROLE = 'Admin';

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
