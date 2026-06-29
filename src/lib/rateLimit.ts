/**
 * In-memory rate limiter for API endpoints.
 * Uses a sliding window approach with configurable limits.
 * 
 * NOTE: For production with multiple servers, use Redis instead.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
}

const defaultConfig: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
};

const endpointConfigs: Record<string, RateLimitConfig> = {
  "/api/contextforge/discover":   { windowMs: 60 * 1000, maxRequests: 60 },
  "/api/contextforge/suggest":    { windowMs: 60 * 1000, maxRequests: 120 },
  "/api/contextforge/generate":   { windowMs: 60 * 1000, maxRequests: 30 },
  "/api/contextforge/regenerate": { windowMs: 60 * 1000, maxRequests: 30 },
  "/api/contextforge/upload":     { windowMs: 60 * 1000, maxRequests: 60 },
};

/**
 * Checks if a request is within rate limits.
 * Returns true if allowed, false if rate limited.
 */
export function checkRateLimit(
  identifier: string,
  endpoint: string,
): { allowed: boolean; remaining: number; resetAt: number } {
  const config = endpointConfigs[endpoint] ?? defaultConfig;
  const key = `${identifier}:${endpoint}`;
  const now = Date.now();

  const entry = store.get(key);

  // No entry or expired window - create new entry
  if (!entry || now > entry.resetAt) {
    store.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    };
  }

  // Within window
  if (entry.count < config.maxRequests) {
    entry.count += 1;
    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetAt: entry.resetAt,
    };
  }

  // Rate limit exceeded
  return {
    allowed: false,
    remaining: 0,
    resetAt: entry.resetAt,
  };
}

/**
 * Gets user identifier from request (IP address or user ID).
 */
export function getRateLimitIdentifier(req: Request): string {
  // Try to get user ID from headers (set by middleware if authenticated)
  const userId = req.headers.get("x-user-id");
  if (userId) return `user:${userId}`;

  // Fall back to IP address
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0] ??
    req.headers.get("x-real-ip") ??
    "unknown";

  return `ip:${ip}`;
}

/**
 * Cleanup old entries to prevent memory leaks.
 * Call periodically in production (e.g., every 5 minutes).
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  store.forEach((entry, key) => {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  });
}

// Auto-cleanup every 5 minutes
setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
