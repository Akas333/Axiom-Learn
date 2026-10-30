import crypto from "node:crypto";
import type { Hono } from "hono";
import { runAsTenant, currentTenant } from "@axiom/engine/tenant.ts";
import { currentPlan, savePlan, type PlanId } from "@axiom/engine/src/server/hosted.ts";
import type { AuthConfig } from "./auth.ts";
import { writeProfilePlan } from "./profiles.ts";

/**
 * Paid plans through Stripe (REST, no SDK).
 *
 *   POST /api/billing/checkout → { url } of a Checkout page for the Pro price
 *   POST /api/billing/portal   → { url } of the customer portal (manage/cancel)
 *   POST /billing/webhook      → Stripe events; updates <user dir>/plan.json
 *
 * The Supabase user id rides on the Checkout session (client_reference_id)
 * and on the subscription's metadata, so every later subscription event
 * names its user without any lookup table.
 */

export interface BillingConfig {
	secretKey: string;
	webhookSecret: string;
	proPriceId: string;
	/** Public site URL for Checkout's return links (e.g. https://kapany.app). */
	siteUrl: string;
}

export function billingConfigFromEnv(env = process.env): BillingConfig | null {
	const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRO_PRICE_ID, KAPANY_SITE_URL } = env;
	if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !STRIPE_PRO_PRICE_ID || !KAPANY_SITE_URL) return null;
	return {
		secretKey: STRIPE_SECRET_KEY,
		webhookSecret: STRIPE_WEBHOOK_SECRET,
		proPriceId: STRIPE_PRO_PRICE_ID,
		siteUrl: KAPANY_SITE_URL.replace(/\/+$/, ""),
	};
}

async function stripe<T>(config: BillingConfig, endpoint: string, form: Record<string, string>): Promise<T> {
	const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
		method: "POST",
		headers: { Authorization: `Bearer ${config.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(form),
	});
	const body = (await res.json()) as T & { error?: { message?: string } };
	if (!res.ok) throw new Error(body.error?.message ?? `Stripe ${endpoint} failed (${res.status})`);
	return body;
}

/** Verify a Stripe-Signature header (v1 scheme, 5-minute tolerance). */
export function verifyStripeSignature(payload: string, header: string | undefined, secret: string, now = Date.now()): boolean {
	if (!header) return false;
	const parts = header.split(",").map((p) => p.split("=") as [string, string]);
	const timestamp = parts.find(([k]) => k === "t")?.[1];
	const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
	if (!timestamp || signatures.length === 0) return false;
	if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
	const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
	return signatures.some((sig) => sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}

interface StripeEvent {
	type: string;
	data: { object: Record<string, unknown> };
}

/** Where a plan change lands: the local cache always, the Supabase profile
 *  row when a service key is configured. */
export type PlanSink = (userId: string, plan: { plan: PlanId; status: string; customer?: string; subscription?: string }) => Promise<void>;

export function planSink(auth: AuthConfig | null): PlanSink {
	return async (userId, change) => {
		runAsTenant({ userId }, () =>
			savePlan({ plan: change.plan, status: change.status, stripeCustomerId: change.customer, stripeSubscriptionId: change.subscription }),
		);
		if (auth) {
			await writeProfilePlan(auth, userId, {
				plan: change.plan,
				plan_status: change.status,
				stripe_customer_id: change.customer,
				stripe_subscription_id: change.subscription,
			});
		}
	};
}

const text = (v: unknown) => (typeof v === "string" ? v : undefined);

/** Apply one webhook event. Exported for tests. */
export async function applyStripeEvent(event: StripeEvent, sink: PlanSink): Promise<void> {
	const obj = event.data.object;
	if (event.type === "checkout.session.completed") {
		const userId = text(obj.client_reference_id);
		if (!userId) return;
		await sink(userId, { plan: "pro", status: "active", customer: text(obj.customer), subscription: text(obj.subscription) });
		return;
	}
	if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
		const userId = text((obj.metadata as Record<string, unknown> | undefined)?.user_id);
		if (!userId) return;
		const status = event.type === "customer.subscription.deleted" ? "canceled" : String(obj.status ?? "");
		await sink(userId, {
			plan: status === "active" || status === "trialing" ? "pro" : "free",
			status,
			customer: text(obj.customer),
			subscription: text(obj.id),
		});
	}
}

/** Signed-in billing routes (mounted under the /api auth middleware). */
export function mountBillingApi(app: Hono, config: BillingConfig | null): void {
	app.post("/api/billing/checkout", async (c) => {
		if (!config) return c.json({ error: "Billing is not set up on this server" }, 503);
		const tenant = currentTenant()!;
		const form: Record<string, string> = {
			mode: "subscription",
			"line_items[0][price]": config.proPriceId,
			"line_items[0][quantity]": "1",
			client_reference_id: tenant.userId,
			"subscription_data[metadata][user_id]": tenant.userId,
			success_url: `${config.siteUrl}/?billing=success`,
			cancel_url: `${config.siteUrl}/?billing=cancel`,
		};
		const customer = currentPlan().stripeCustomerId;
		if (customer) form.customer = customer;
		else if (tenant.email) form.customer_email = tenant.email;
		try {
			const session = await stripe<{ url: string }>(config, "checkout/sessions", form);
			return c.json({ url: session.url });
		} catch (err) {
			return c.json({ error: (err as Error).message }, 502);
		}
	});

	app.post("/api/billing/portal", async (c) => {
		if (!config) return c.json({ error: "Billing is not set up on this server" }, 503);
		const customer = currentPlan().stripeCustomerId;
		if (!customer) return c.json({ error: "No subscription yet" }, 404);
		try {
			const session = await stripe<{ url: string }>(config, "billing_portal/sessions", { customer, return_url: config.siteUrl });
			return c.json({ url: session.url });
		} catch (err) {
			return c.json({ error: (err as Error).message }, 502);
		}
	});
}

/** The public webhook (no user session; authenticated by signature). */
export function mountBillingWebhook(app: Hono, config: BillingConfig | null, sink: PlanSink): void {
	app.post("/billing/webhook", async (c) => {
		if (!config) return c.json({ error: "Billing is not set up" }, 503);
		const payload = await c.req.text();
		if (!verifyStripeSignature(payload, c.req.header("stripe-signature"), config.webhookSecret)) {
			return c.json({ error: "Bad signature" }, 400);
		}
		try {
			await applyStripeEvent(JSON.parse(payload) as StripeEvent, sink);
		} catch (err) {
			console.error("[billing] webhook failed:", err);
			return c.json({ error: "Webhook handling failed" }, 500);
		}
		return c.json({ received: true });
	});
}
