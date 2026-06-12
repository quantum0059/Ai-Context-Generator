import { auth } from "@clerk/nextjs/server";
import { createCheckoutSession, isStripeConfigured } from "../../../../lib/stripe";
import { isClerkConfigured } from "../../../../lib/supabase";

export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    return Response.json(
      { error: "Billing requires Stripe to be configured (see README)." },
      { status: 503 },
    );
  }
  if (!isClerkConfigured()) {
    return Response.json({ error: "Billing requires Clerk sign-in." }, { status: 503 });
  }
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to upgrade." }, { status: 401 });

  const origin = new URL(req.url).origin;
  try {
    const url = await createCheckoutSession({
      clientReferenceId: userId,
      successUrl: `${origin}/?billing=success`,
      cancelUrl: `${origin}/?billing=cancelled`,
    });
    return Response.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
