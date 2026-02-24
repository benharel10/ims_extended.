'use server'

import { prisma } from '@/lib/prisma';

/**
 * Logs a technical error to the SystemError table.
 * Always resolves — never throws — so it cannot cause a cascade failure.
 */
export async function logError(
    context: string,
    error: unknown,
    userId?: number
): Promise<void> {
    try {
        const err = error instanceof Error ? error : new Error(String(error));
        await prisma.systemError.create({
            data: {
                context,
                message: err.message,
                stack: err.stack ?? null,
                userId: userId ?? null,
            }
        });
    } catch {
        // Fallback: if DB is unavailable, log to console so Vercel captures it
        console.error(`[errorLogger] Failed to persist error for context "${context}":`, error);
    }
}
