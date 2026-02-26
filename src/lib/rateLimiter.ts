/**
 * In-memory rate limiter for login attempts.
 * Uses a Map keyed by IP address.
 * 
 * Limits: 5 attempts per 15-minute window.
 * After that, returns a lockout error for the remainder of the window.
 * 
 * NOTE: This works per server instance. If you run multiple Vercel instances
 * (extremely unlikely on Starter plan), failed attempts won't cross instances.
 * For a distributed deployment, replace the Map with a Redis store.
 */

interface AttemptRecord {
    count: number;
    windowStart: number;
}

const attempts = new Map<string, AttemptRecord>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Checks if the given key (IP address) is rate-limited.
 * Returns an error string if blocked, null if allowed.
 * Call this BEFORE processing the login request.
 */
export function checkRateLimit(key: string): string | null {
    const now = Date.now();
    const record = attempts.get(key);

    if (record) {
        const windowAge = now - record.windowStart;

        // If the window has expired, clear the record and allow
        if (windowAge > WINDOW_MS) {
            attempts.delete(key);
            return null;
        }

        // Window is still active — check count
        if (record.count >= MAX_ATTEMPTS) {
            const remaining = Math.ceil((WINDOW_MS - windowAge) / 60000);
            return `Too many login attempts. Please try again in ${remaining} minute(s).`;
        }
    }

    return null;
}

/**
 * Records a failed login attempt for the given key.
 */
export function recordFailedAttempt(key: string): void {
    const now = Date.now();
    const record = attempts.get(key);

    if (record && now - record.windowStart <= WINDOW_MS) {
        record.count++;
    } else {
        attempts.set(key, { count: 1, windowStart: now });
    }
}

/**
 * Clears all failed attempts for a key (call on successful login).
 */
export function clearAttempts(key: string): void {
    attempts.delete(key);
}
