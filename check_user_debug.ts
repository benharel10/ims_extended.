
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function checkUser() {
    const email = 'ben.harel@ks-waves.com';
    const password = 'Benharel220';

    console.log(`Checking user: ${email}`);

    const user = await prisma.user.findUnique({
        where: { email }
    });

    if (!user) {
        console.log('❌ User NOT found in database.');
        return;
    }

    console.log('✅ User found:', user);

    const isMatch = await bcrypt.compare(password, user.password);
    console.log(`Password match check: ${isMatch ? '✅ MATCH' : '❌ DO NOT MATCH'}`);

    if (!isMatch) {
        // Let's try to update it to be sure
        console.log('Update password to ensure it is correct...');
        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.update({
            where: { email },
            data: { password: hashedPassword }
        });
        console.log('✅ Password updated manually.');
    }
}

checkUser()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
