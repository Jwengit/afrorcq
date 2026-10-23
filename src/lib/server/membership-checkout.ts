import { env } from '$env/dynamic/private';
import { getStandardPriceId, getStudentPriceId, getStripeClient } from '$lib/server/stripe';

export type MembershipPlan = 'student' | 'standard';

export async function createMembershipCheckoutSession(input: {
	userId: string;
	email?: string | null;
	plan: MembershipPlan;
	appBaseUrl: string;
}): Promise<string> {
	const stripe = getStripeClient();
	const priceId = input.plan === 'student' ? getStudentPriceId() : getStandardPriceId();
	const appBaseUrl = (input.appBaseUrl || env.PUBLIC_SITE_URL || '').replace(/\/$/, '');

	if (!appBaseUrl) {
		throw new Error('Public site URL is not configured.');
	}

	const checkoutSession = await stripe.checkout.sessions.create({
		mode: 'subscription',
		line_items: [{ price: priceId, quantity: 1 }],
		client_reference_id: input.userId,
		customer_email: input.email?.trim() || undefined,
		allow_promotion_codes: true,
		success_url: `${appBaseUrl}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${appBaseUrl}/pricing?checkout=cancel`,
		metadata: {
			supabase_user_id: input.userId,
			plan: input.plan
		},
		subscription_data: {
			metadata: {
				supabase_user_id: input.userId,
				plan: input.plan
			}
		}
	});

	if (!checkoutSession.url) {
		throw new Error('Stripe did not return a membership checkout URL.');
	}

	return checkoutSession.url;
}
