import { verifyStripeSignature } from "../../../../lib/stripe";
import { getSupabase } from "../../../../lib/supabase";

/** Records completed checkouts as active subscriptions in Supabase. */
export async function POST(req: Request) {
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"))) {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }
  const event = JSON.parse(payload) as {
    type: string;
    data: { object: { client_reference_id?: string; customer?: string; subscription?: string } };
  };
  if (event.type === "checkout.session.completed") {
    const supabase = getSupabase();
    if (supabase && event.data.object.client_reference_id) {
      await supabase.from("subscriptions").upsert(
        {
          user_id: event.data.object.client_reference_id,
          stripe_customer_id: event.data.object.customer ?? null,
          stripe_subscription_id: event.data.object.subscription ?? null,
          status: "active",
        },
        { onConflict: "user_id" },
      );
    }
  }
  return Response.json({ received: true });
}
