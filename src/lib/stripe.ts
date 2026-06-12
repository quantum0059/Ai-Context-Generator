import { createHmac, timingSafeEqual } from "crypto";

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

/** Creates a Stripe Checkout session via the REST API (no SDK dependency). */
export async function createCheckoutSession(params: {
  clientReferenceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": process.env.STRIPE_PRICE_ID as string,
    "line_items[0][quantity]": "1",
    client_reference_id: params.clientReferenceId,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`Stripe error: ${res.status}`);
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("Stripe did not return a checkout URL");
  return data.url;
}

/** Verifies a Stripe webhook signature (t=...,v1=... header format). */
export function verifyStripeSignature(payload: string, header: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=") as [string, string]),
  );
  if (!parts.t || !parts.v1) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  } catch {
    return false;
  }
}
