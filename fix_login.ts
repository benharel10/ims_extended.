
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const email = 'ben.harel@ks-waves.com';
    const password = 'Benharel220';
    console.log(`Fixing login for ${email}...`);

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Force verify/update
    const user = await prisma.user.upsert({
        where: { email },
        update: {
            password: hashedPassword,
            role: 'Admin',
            name: 'Ben Harel'
        },
        create: {
            email,
            password: hashedPassword,
            name: 'Ben Harel',
            role: 'Admin'
        }
    });

    console.log('✅ User updated successfully.');
    console.log(`Email: ${user.email}`);
    console.log(`Role: ${user.role}`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
