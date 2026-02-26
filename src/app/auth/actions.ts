'use server'

import { prisma } from '@/lib/prisma';
import { login as setSession, logout as destroySession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { checkRateLimit, recordFailedAttempt, clearAttempts } from '@/lib/rateLimiter';
import { LoginSchema, parseSchema } from '@/lib/schemas';

export async function loginAction(formData: FormData) {
    // ── Rate limiting ──
    const headerStore = await headers();
    const ip = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? headerStore.get('x-real-ip')
        ?? 'unknown';

    const rateLimitError = checkRateLimit(ip);
    if (rateLimitError) {
        return { success: false, error: rateLimitError };
    }

    // ── Zod validation ──
    const parsed = parseSchema(LoginSchema, {
        email: formData.get('email'),
        password: formData.get('password'),
    });
    if (!parsed.success) {
        return { success: false, error: parsed.error };
    }

    const { email, password } = parsed.data;

    if (!email.endsWith('@ks-waves.com') && email !== 'admin@ksw.com') {
        recordFailedAttempt(ip);
        return { success: false, error: 'Only @ks-waves.com emails are allowed.' };
    }

    try {
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            recordFailedAttempt(ip);
            return { success: false, error: 'Invalid credentials' };
        }

        const isValid = await bcrypt.compare(password, user.password);

        if (!isValid) {
            recordFailedAttempt(ip);
            return { success: false, error: 'Invalid credentials' };
        }

        // Successful login — clear failed attempt counter
        clearAttempts(ip);
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
