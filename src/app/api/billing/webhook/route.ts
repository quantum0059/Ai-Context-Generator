import { verifyStripeSignature } from "../../../../lib/stripe";
import { getSupabase } from "../../../../lib/supabase";

/**
 * Stripe webhook handler.
 *
 * Security properties:
 * - Every request MUST pass HMAC signature verification (verifyStripeSignature).
 * - Events are de-duplicated via the processed_stripe_events table so Stripe's
 *   at-least-once delivery can never double-apply a state change (replay-safe).
 * - Subscription state is driven ONLY by the event type. A user is marked
 *   "active" only on checkout completion or an active subscription update, and
 *   is downgraded to "canceled" on deletion or a non-active status. The user is
 *   always keyed off Stripe-provided identifiers, never a client-controlled body.
 */

interface StripeSubscriptionObject {
  client_reference_id?: string;
  customer?: string;
  subscription?: string;
  status?: string;
  metadata?: { userId?: string };
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: StripeSubscriptionObject };
}

export async function POST(req: Request) {
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"))) {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!event.id || !event.type) {
    return Response.json({ error: "Malformed event" }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    // Acknowledge so Stripe does not retry against an unconfigured instance.
    return Response.json({ received: true, skipped: "db_unavailable" });
  }

  // ---- Idempotency: reject already-processed events (replay protection) ----
  const { data: seen } = await supabase
    .from("processed_stripe_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();
  if (seen) {
    return Response.json({ received: true, duplicate: true });
  }

  const obj = event.data?.object ?? {};
  // Resolve the user from Stripe-provided identifiers only.
  const userId = obj.client_reference_id ?? obj.metadata?.userId;

  // Map event type -> subscription status. State is derived from the event
  // type, never from a client-supplied "status" field alone.
  let nextStatus: "active" | "canceled" | null = null;
  switch (event.type) {
    case "checkout.session.completed":
      nextStatus = "active";
      break;
    case "customer.subscription.updated":
      nextStatus = obj.status === "active" || obj.status === "trialing" ? "active" : "canceled";
      break;
    case "customer.subscription.deleted":
      nextStatus = "canceled";
      break;
    default:
      nextStatus = null; // Unhandled event types are acknowledged but ignored.
  }

  if (nextStatus && userId) {
    await supabase.from("subscriptions").upsert(
      {
        user_id: userId,
        stripe_customer_id: obj.customer ?? null,
        stripe_subscription_id: obj.subscription ?? null,
        status: nextStatus,
      },
      { onConflict: "user_id" },
    );
  }

  // Record the event as processed so retries are ignored.
  await supabase.from("processed_stripe_events").insert({
    event_id: event.id,
    event_type: event.type,
  });

  return Response.json({ received: true });
}
