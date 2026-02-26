'use server'

import { prisma } from '@/lib/prisma';

// ── Patterns that should never appear in persisted error logs ──
const SENSITIVE_PATTERNS: { pattern: RegExp; replacement: string }[] = [
    // Passwords in query strings or JSON bodies
    { pattern: /("password"\s*:\s*)"[^"]*"/gi, replacement: '$1"[REDACTED]"' },
    { pattern: /(password=)[^\s&"]+/gi, replacement: '$1[REDACTED]' },
    // JWT / Bearer tokens
    { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, replacement: 'Bearer [REDACTED]' },
    { pattern: /(eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/=]*)/g, replacement: '[JWT_REDACTED]' },
    // Cookie header values
    { pattern: /(session=)[^\s;"]*/gi, replacement: '$1[REDACTED]' },
    // Generic secret/token key-value pairs
    { pattern: /("(secret|token|apiKey|api_key|authorization)"\s*:\s*)"[^"]*"/gi, replacement: '$1"[REDACTED]"' },
];

function sanitize(text: string | undefined): string | undefined {
    if (!text) return text;
    let result = text;
    for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
        result = result.replace(pattern, replacement);
    }
    return result;
}

/**
 * Logs a technical error to the SystemError table.
 * Sanitizes messages and stack traces to strip sensitive data before persisting.
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
                context: sanitize(context) ?? context,
                message: sanitize(err.message) ?? err.message,
                stack: sanitize(err.stack) ?? null,
                userId: userId ?? null,
            }
        });
    } catch {
        // Fallback: if DB is unavailable, log to console so Vercel captures it
        console.error(`[errorLogger] Failed to persist error for context "${context}":`, error);
    }
}

