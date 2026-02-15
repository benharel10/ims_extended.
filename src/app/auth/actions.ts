'use server'

import { prisma } from '@/lib/prisma';
import { login as setSession, logout as destroySession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';

export async function loginAction(formData: FormData) {
    const email = (formData.get('email') as string || '').trim().toLowerCase();
    const password = formData.get('password') as string;

    if (!email || !password) {
        return { success: false, error: 'Email and password required' };
    }

    if (!email.endsWith('@ks-waves.com') && email !== 'admin@ksw.com') {
        return { success: false, error: 'Only @ks-waves.com emails are allowed.' };
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            return { success: false, error: 'Invalid credentials' };
        }

        // Compare hashed password
        const isValid = await bcrypt.compare(password, user.password);

        if (!isValid) {
            return { success: false, error: 'Invalid credentials' };
        }

        await setSession({ id: user.id, email: user.email, name: user.name, role: user.role });
    } catch (error) {
        console.error(error);
        return { success: false, error: 'Login failed' };
    }

    redirect('/');
}

export async function logoutAction() {
    await destroySession();
    redirect('/login');
}
