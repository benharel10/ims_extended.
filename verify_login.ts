
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function verify() {
    const email = 'ben.harel@ks-waves.com';
    const password = 'Benharel220';

    console.log(`Verifying login logic locally for: ${email}`);

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        console.error('❌ User NOT found in Neon DB!');
        return;
    }

    console.log('✅ User found in Neon DB.');
    console.log(`Stored Password Hash: ${user.password.substring(0, 15)}...`);

    const isValid = await bcrypt.compare(password, user.password);

    if (isValid) {
        console.log('✅ Password COMPARE SUCCESS!');
        console.log('This confirms the Database and Logic are correct.');
    } else {
        console.error('❌ Password COMPARE FAILED!');
    }
}

verify()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
