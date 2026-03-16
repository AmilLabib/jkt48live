import { Redis } from "@upstash/redis";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis =
  redisUrl && redisToken
    ? new Redis({ url: redisUrl, token: redisToken })
    : null;

const memoryCache = new Map<string, { value: string; expiresAt: number }>();

const DEFAULT_TTL_SECONDS = 90;

export async function readCache<T>(key: string): Promise<T | null> {
  if (redis) {
    try {
      const data = await redis.get<string>(key);
      return data ? (JSON.parse(data) as T) : null;
    } catch (error) {
      console.warn("Redis read failed", error);
    }
  }

  const entry = memoryCache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  try {
    return JSON.parse(entry.value) as T;
  } catch (error) {
    memoryCache.delete(key);
    return null;
  }
}

export async function writeCache<T>(
  key: string,
  value: T,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
) {
  const payload = JSON.stringify(value);
  const expiresAt = Date.now() + ttlSeconds * 1000;

  if (redis) {
    try {
      await redis.set(key, payload, { ex: ttlSeconds });
      return;
    } catch (error) {
      console.warn("Redis write failed", error);
    }
  }

  memoryCache.set(key, { value: payload, expiresAt });
}

export async function deleteCache(key: string) {
  if (redis) {
    try {
      await redis.del(key);
    } catch (error) {
      console.warn("Redis delete failed", error);
    }
  }
  memoryCache.delete(key);
}
