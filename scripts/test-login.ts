import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function test(email: string, pass: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        console.log(`User ${email} not found in DB!`);
        return;
    }
    console.log(`Found ${email}`);
    const valid = await bcrypt.compare(pass, user.password);
    console.log(`Password match for ${email}: ${valid}`);
}

async function main() {
    await test('sharon.harel@ks-waves.com', 'K9#fP2!vLq7*Zt$5nB@x8W&m');
    await test('victor.hoepfner@ks-waves.com', 'Gb#8v!mZ2*5rX$q9Lp@7W&k4');
    await test('admin@ksw.com', 'admin'); // assuming admin@ksw.com is default
}

main().finally(() => prisma.$disconnect());
