import { Redis } from '@upstash/redis';

/**
 * Distributed rate limiter for login attempts (Vercel Edge-compatible).
 * Uses Upstash Redis if environment variables are set, gracefully falling
 * back to an in-memory Map for local development and offline use.
 */
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

interface AttemptRecord {
    count: number;
    windowStart: number;
}
const localMemoryFallback = new Map<string, AttemptRecord>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const WINDOW_S = 15 * 60; // 15 minutes in seconds

export async function checkRateLimit(key: string): Promise<string | null> {
    if (redis) {
        try {
            const count = await redis.get<number>(`rl:login:${key}`);
            if (count && count >= MAX_ATTEMPTS) {
                // Account locked, get remaining time
                const ttl = await redis.ttl(`rl:login:${key}`);
                const remaining = ttl > 0 ? Math.ceil(ttl / 60) : 15;
                return `Too many login attempts. Please try again in ${remaining} minute(s).`;
            }
            return null;
        } catch {
            // Fail open on Redis networking errors to prioritize user access
            return null;
        }
    }

    // Local / Dev Fallback
    const now = Date.now();
    const record = localMemoryFallback.get(key);
    if (record) {
        const windowAge = now - record.windowStart;
        if (windowAge > WINDOW_MS) {
            localMemoryFallback.delete(key);
            return null;
        }
        if (record.count >= MAX_ATTEMPTS) {
            const remaining = Math.ceil((WINDOW_MS - windowAge) / 60000);
            return `Too many login attempts. Please try again in ${remaining} minute(s).`;
        }
    }
    return null;
}

export async function recordFailedAttempt(key: string): Promise<void> {
    if (redis) {
        try {
            const redisKey = `rl:login:${key}`;
            const count = await redis.incr(redisKey);
            if (count === 1) {
                // First failed attempt, apply the TTL sliding window
                await redis.expire(redisKey, WINDOW_S);
            }
            return;
        } catch {
            return;
        }
    }

    // Local / Dev Fallback
    const now = Date.now();
    const record = localMemoryFallback.get(key);
    if (record && now - record.windowStart <= WINDOW_MS) {
        record.count++;
    } else {
        localMemoryFallback.set(key, { count: 1, windowStart: now });
    }
}

export async function clearAttempts(key: string): Promise<void> {
    if (redis) {
        try {
            await redis.del(`rl:login:${key}`);
        } catch {}
    }
    localMemoryFallback.delete(key);
}
