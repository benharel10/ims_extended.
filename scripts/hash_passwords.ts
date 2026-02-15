
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting password migration...');

    // Get all users
    const users = await prisma.user.findMany();
    console.log(`Found ${users.length} users.`);

    for (const user of users) {
        // Check if password looks hashed (bcrypt hashes start with $2a$, $2b$, or $2y$ and are 60 chars long)
        const isHashed = user.password.startsWith('$2') && user.password.length === 60;

        if (isHashed) {
            console.log(`User ${user.email} already has a hashed password. Skipping.`);
            continue;
        }

        console.log(`Hashing password for user: ${user.email}`);

        // Hash the plain text password
        const hashedPassword = await bcrypt.hash(user.password, 10);

        // Update user
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword }
        });

        console.log(`Updated user ${user.email} successfully.`);
    }

    console.log('Password migration completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
