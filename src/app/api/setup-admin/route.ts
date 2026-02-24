import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ONE-TIME SETUP ROUTE — DELETE THIS FILE AFTER FIRST USE
// Access: GET http://localhost:3000/api/setup-admin
export async function GET() {
    try {
        const EMAIL = 'ben.harel@ks-waves.com';
        const PASSWORD = 'Benharel220';

        const hash = await bcrypt.hash(PASSWORD, 12);

        const user = await prisma.user.upsert({
            where: { email: EMAIL },
            update: { password: hash, name: 'Ben Harel', role: 'Admin' },
            create: { email: EMAIL, password: hash, name: 'Ben Harel', role: 'Admin' },
        });

        // Also show all users
        const allUsers = await prisma.user.findMany({
            select: { id: true, email: true, role: true, name: true }
        });

        return NextResponse.json({
            success: true,
            message: `User ${user.email} (${user.role}) is ready. ID: ${user.id}`,
            allUsers
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
