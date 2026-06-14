/**
 * Environment variable validation at startup.
 * Ensures required env vars are present and warns about optional ones.
 */

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateEnvironment(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required for basic functionality
  if (!process.env.NEXT_PUBLIC_APP_URL && process.env.NODE_ENV === "production") {
    errors.push("NEXT_PUBLIC_APP_URL is required in production");
  }

  // Claude AI (optional but recommended)
  if (!process.env.ANTHROPIC_API_KEY) {
    warnings.push(
      "ANTHROPIC_API_KEY not set. Claude-powered features will use heuristic fallbacks.",
    );
  }

  // Clerk authentication (optional)
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    warnings.push(
      "Clerk not configured. User authentication and package saving will be disabled.",
    );
  }

  // Supabase database (optional but required for Clerk features)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    warnings.push(
      "Supabase not configured. Database features and image uploads will be disabled.",
    );
  }

  // Stripe billing (optional)
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    warnings.push(
      "Stripe not configured. Billing and subscription features will be disabled.",
    );
  } else if (!process.env.STRIPE_WEBHOOK_SECRET) {
    warnings.push(
      "STRIPE_WEBHOOK_SECRET not set. Stripe webhooks will not be verified.",
    );
  }

  // Validate URL formats
  const urlVars = ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL"];
  for (const varName of urlVars) {
    const value = process.env[varName];
    if (value) {
      try {
        new URL(value);
      } catch {
        errors.push(`${varName} must be a valid URL (got: ${value})`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Logs environment validation results.
 * Call this at app startup (e.g., in layout.tsx or middleware).
 */
export function logEnvironmentValidation(): void {
  if (process.env.NODE_ENV === "test") return;

  const result = validateEnvironment();

  if (result.errors.length > 0) {
    console.error("❌ Environment validation failed:");
    result.errors.forEach((err) => console.error(`   - ${err}`));
  }

  if (result.warnings.length > 0) {
    console.warn("⚠️  Environment warnings:");
    result.warnings.forEach((warn) => console.warn(`   - ${warn}`));
  }

  if (result.valid && result.warnings.length === 0) {
    console.log("✅ Environment validation passed");
  }
}
