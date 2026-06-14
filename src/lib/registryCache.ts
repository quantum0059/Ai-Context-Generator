import { TECHNOLOGIES, getTechnologyById } from "../registry/technologies";
import type { Technology } from "../types";

// In-memory cache with TTL
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Gets technology from cache or registry.
 */
export function getTechnologyCached(id: string, ttl = DEFAULT_TTL): Technology | undefined {
  const cacheKey = `tech:${id}`;
  const entry = cache.get(cacheKey);

  if (entry && Date.now() < entry.expiresAt) {
    return entry.data;
  }

  const tech = getTechnologyById(id);
  if (tech) {
    cache.set(cacheKey, {
      data: tech,
      expiresAt: Date.now() + ttl,
    });
  }

  return tech;
}

/**
 * Gets all technologies by category from cache or registry.
 */
export function getTechnologiesByCategoryCached(
  category: string,
  ttl = DEFAULT_TTL,
): Technology[] {
  const cacheKey = `tech:category:${category}`;
  const entry = cache.get(cacheKey);

  if (entry && Date.now() < entry.expiresAt) {
    return entry.data;
  }

  const techs = TECHNOLOGIES.filter((t) => t.category === category);
  cache.set(cacheKey, {
    data: techs,
    expiresAt: Date.now() + ttl,
  });

  return techs;
}

/**
 * Invalidates cache entries matching a pattern.
 */
export function invalidateCache(pattern: string): void {
  const keysToDelete: string[] = [];
  cache.forEach((_, key) => {
    if (key.includes(pattern)) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach((key) => cache.delete(key));
}

/**
 * Clears entire cache.
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Gets cache statistics.
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
  };
}
