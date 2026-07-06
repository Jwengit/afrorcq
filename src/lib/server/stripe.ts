import Stripe from 'stripe';
import { env } from '$env/dynamic/private';

let stripeClient: Stripe | null = null;

function requireEnv(name: string, value: string | undefined): string {
	const normalized = value?.trim();
	if (!normalized) {
		throw new Error(`${name} is missing. Add it to your server environment variables.`);
	}
	return normalized;
}

export function getStripeClient(): Stripe {
	if (stripeClient) {
		return stripeClient;
	}

	const secretKey = requireEnv('STRIPE_SECRET_KEY', env.STRIPE_SECRET_KEY);
	stripeClient = new Stripe(secretKey);
	return stripeClient;
}

export function getAnnualMembershipPriceId(): string {
	return requireEnv('STRIPE_ANNUAL_MEMBERSHIP_PRICE_ID', env.STRIPE_ANNUAL_MEMBERSHIP_PRICE_ID);
}

export function getStripeWebhookSecret(): string {
	return requireEnv('STRIPE_WEBHOOK_SECRET', env.STRIPE_WEBHOOK_SECRET);
}
