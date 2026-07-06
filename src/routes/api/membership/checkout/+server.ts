import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { getAnnualMembershipPriceId, getStripeClient } from '$lib/server/stripe';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

function getBearerToken(request: Request): string | null {
	const authHeader = request.headers.get('authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}
	return authHeader.slice(7);
}

export const POST: RequestHandler = async ({ request, url }) => {
	try {
		if (!supabaseUrl || !supabaseAnonKey) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const token = getBearerToken(request);
		if (!token) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const supabase = createClient(supabaseUrl, supabaseAnonKey);
		const {
			data: { user },
			error: userError
		} = await supabase.auth.getUser(token);

		if (userError || !user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json().catch(() => ({}));
		const selectedPlan = body?.plan === 'annual' ? 'annual' : null;
		if (!selectedPlan) {
			return json({ error: 'Invalid plan selection' }, { status: 400 });
		}

		const stripe = getStripeClient();
		const annualPriceId = getAnnualMembershipPriceId();
		const appBaseUrl = (env.PUBLIC_SITE_URL || url.origin).replace(/\/$/, '');

		const checkoutSession = await stripe.checkout.sessions.create({
			mode: 'subscription',
			line_items: [{ price: annualPriceId, quantity: 1 }],
			client_reference_id: user.id,
			customer_email: user.email ?? undefined,
			allow_promotion_codes: true,
			success_url: `${appBaseUrl}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${appBaseUrl}/pricing?checkout=cancel`,
			metadata: {
				supabase_user_id: user.id,
				plan: 'annual_membership'
			},
			subscription_data: {
				metadata: {
					supabase_user_id: user.id,
					plan: 'annual_membership'
				}
			}
		});

		if (!checkoutSession.url) {
			return json({ error: 'Unable to create checkout session' }, { status: 500 });
		}

		return json({ url: checkoutSession.url });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
