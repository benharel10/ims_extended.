'use server'

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { logError } from '@/lib/errorLogger';
import bcrypt from 'bcryptjs';

// ─── Auth guard ───────────────────────────────────────────────────────────────

async function checkAdmin() {
    const session = await getSession();
    if (!session || session.user.role !== 'Admin') {
        throw new Error('Unauthorized — Admin only');
    }
    return session.user;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = ['Admin', 'Manager', 'Warehouse'];

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getUsers() {
    try {
        await checkAdmin();
        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            select: { id: true, name: true, email: true, role: true, createdAt: true }
        });
        return { success: true, data: users };
    } catch (error) {
        // Don't log auth rejections — they're expected
        const msg = error instanceof Error && error.message.startsWith('Unauthorized')
            ? error.message
            : 'Failed to fetch users. Please try again.';
        if (!msg.startsWith('Unauthorized')) await logError('users.getUsers', error);
        return { success: false, error: msg };
    }
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createUser(data: {
    email: string;
    password: string;
    name: string;
    role?: string;
}) {
    try {
        await checkAdmin();

        // ── Strict validation ──
        if (!data.email?.trim()) return { success: false, error: 'Email is required' };
        if (!EMAIL_RE.test(data.email.trim())) return { success: false, error: 'Enter a valid email address' };
        if (!data.password) return { success: false, error: 'Password is required' };
        if (data.password.length < 8) return { success: false, error: 'Password must be at least 8 characters' };
        if (!data.name?.trim()) return { success: false, error: 'Name is required' };

        const role = VALID_ROLES.includes(data.role ?? '') ? data.role! : 'Warehouse';

        const existing = await prisma.user.findUnique({ where: { email: data.email.trim().toLowerCase() } });
        if (existing) return { success: false, error: 'An account with this email already exists' };

        const hashedPassword = await bcrypt.hash(data.password, 12);

        await prisma.user.create({
            data: {
                email: data.email.trim().toLowerCase(),
                password: hashedPassword,
                name: data.name.trim(),
                role
            }
        });

        revalidatePath('/settings/users');
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error && error.message.startsWith('Unauthorized')
            ? error.message
            : 'Failed to create user. Please try again.';
        if (!msg.startsWith('Unauthorized')) await logError('users.createUser', error);
        return { success: false, error: msg };
    }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteUser(id: number) {
    try {
        const admin = await checkAdmin();

        if (admin.id === id) {
            return { success: false, error: 'You cannot delete your own account' };
        }

        // Guard: don't allow deleting the last Admin
        const adminCount = await prisma.user.count({ where: { role: 'Admin' } });
        const targetUser = await prisma.user.findUnique({ where: { id }, select: { role: true } });
        if (targetUser?.role === 'Admin' && adminCount <= 1) {
            return { success: false, error: 'Cannot delete the last Admin account' };
        }

        await prisma.user.delete({ where: { id } });
        revalidatePath('/settings/users');
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error && error.message.startsWith('Unauthorized')
            ? error.message
            : 'Failed to delete user. Please try again.';
        if (!msg.startsWith('Unauthorized')) await logError('users.deleteUser', error);
        return { success: false, error: msg };
    }
}
