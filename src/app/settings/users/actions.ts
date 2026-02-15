'use server'

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';

// Check if current user is admin
async function checkAdmin() {
    const session = await getSession();
    if (!session || session.user.role !== 'Admin') {
        throw new Error('Unauthorized');
    }
    return session.user;
}

export async function getUsers() {
    try {
        await checkAdmin();
        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            select: { id: true, name: true, email: true, role: true, createdAt: true }
        });
        return { success: true, data: users };
    } catch (error) {
        return { success: false, error: 'Unauthorized or Failed to fetch users' };
    }
}

export async function createUser(data: any) {
    try {
        await checkAdmin();

        if (!data.email || !data.password || !data.name) {
            return { success: false, error: 'Missing fields' };
        }

        const existing = await prisma.user.findUnique({
            where: { email: data.email }
        });

        if (existing) {
            return { success: false, error: 'Email already exists' };
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);

        await prisma.user.create({
            data: {
                email: data.email,
                password: hashedPassword,
                name: data.name,
                role: data.role || 'Warehouse'
            }
        });

        revalidatePath('/settings/users');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function deleteUser(id: number) {
    try {
        const admin = await checkAdmin();

        if (admin.id === id) {
            return { success: false, error: 'Cannot delete yourself' };
        }

        await prisma.user.delete({
            where: { id }
        });

        revalidatePath('/settings/users');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
