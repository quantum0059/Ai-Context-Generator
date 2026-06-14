import { getSupabase, isClerkConfigured } from "./supabase";

export interface SubscriptionStatus {
  isActive: boolean;
  generationLimit: number;
  generationsUsed: number;
}

/**
 * Checks if user has an active subscription and hasn't exceeded their plan limits.
 * Returns subscription status with generation limits.
 */
export async function checkSubscriptionLimits(userId: string): Promise<{
  allowed: boolean;
  status: SubscriptionStatus;
  reason?: string;
}> {
  // If Clerk/Supabase not configured, allow free usage
  if (!isClerkConfigured()) {
    return {
      allowed: true,
      status: { isActive: false, generationLimit: 5, generationsUsed: 0 },
    };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return {
      allowed: true,
      status: { isActive: false, generationLimit: 5, generationsUsed: 0 },
    };
  }

  // Check subscription status
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, stripe_subscription_id")
    .eq("user_id", userId)
    .single();

  // No subscription = free tier (5 generations per month)
  if (!subscription || subscription.status !== "active") {
    // Count generations this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from("context_packages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", startOfMonth.toISOString());

    const generationsUsed = count ?? 0;
    const freeTierLimit = 5;

    if (generationsUsed >= freeTierLimit) {
      return {
        allowed: false,
        status: {
          isActive: false,
          generationLimit: freeTierLimit,
          generationsUsed,
        },
        reason: `Free tier limit reached (${generationsUsed}/${freeTierLimit} this month). Upgrade to Pro for unlimited generations.`,
      };
    }

    return {
      allowed: true,
      status: {
        isActive: false,
        generationLimit: freeTierLimit,
        generationsUsed,
      },
    };
  }

  // Active subscription = unlimited (or configurable limit)
  const proLimit = 100; // Can be adjusted based on plan tier

  const { count } = await supabase
    .from("context_packages")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  const generationsUsed = count ?? 0;

  return {
    allowed: generationsUsed < proLimit,
    status: {
      isActive: true,
      generationLimit: proLimit,
      generationsUsed,
    },
    reason: generationsUsed >= proLimit ? "Pro plan limit reached." : undefined,
  };
}

/** Records a generation in the database for limit tracking. */
export async function recordGeneration(userId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  // We don't insert here - the save endpoint already records the package.
  // This is just a helper for manual tracking if needed.
}
