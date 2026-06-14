import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getRateLimitIdentifier, checkRateLimit } from "./lib/rateLimit";
import { logEnvironmentValidation } from "./lib/envValidation";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

/**
 * Enhanced middleware with:
 * - CORS headers
 * - Rate limiting
 * - Environment validation (dev mode)
 * - Clerk authentication (if configured)
 */
export default clerkEnabled
  ? clerkMiddleware((auth, req) => {
      // Protect dashboard routes
      if (isProtectedRoute(req)) {
        auth().protect();
      }
      
      return handleMiddleware(req);
    })
  : async (req: NextRequest) => {
      return handleMiddleware(req);
    };

async function handleMiddleware(request: NextRequest) {
  // Log environment validation in development
  if (process.env.NODE_ENV === "development") {
    logEnvironmentValidation();
  }

  // Rate limiting for API routes
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const identifier = getRateLimitIdentifier(request);
    const rateLimit = checkRateLimit(identifier, request.nextUrl.pathname);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          retryAfter: rateLimit.resetAt,
        },
        { status: 429 },
      );
    }
  }

  // CORS headers for API routes
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const response = NextResponse.next();

    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") ?? [];
    const origin = request.headers.get("origin");

    if (origin && allowedOrigins.includes(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      response.headers.set("Access-Control-Max-Age", "86400");
    }

    // Handle preflight requests
    if (request.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 200,
        headers: response.headers,
      });
    }

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
