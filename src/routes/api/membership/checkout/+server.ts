import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { isMembershipVerificationReady } from '$lib/membershipVerification';
import { createMembershipCheckoutSession } from '$lib/server/membership-checkout';

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
		const selectedPlan = body?.plan === 'student' ? 'student' : body?.plan === 'standard' ? 'standard' : null;
		if (!selectedPlan) {
			return json({ error: 'Invalid plan selection. Use "student" or "standard".' }, { status: 400 });
		}

		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey) {
			return json({ error: 'Server configuration error: membership verification is unavailable.' }, { status: 500 });
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);
		const { data: profile, error: profileError } = await adminClient
			.from('profiles')
			.select('status, membership_plan, profile_photo_url, car_make, color')
			.eq('id', user.id)
			.maybeSingle();

		if (profileError) {
			console.error('Unable to verify membership eligibility for Stripe checkout:', profileError);
			return json({ error: 'Unable to verify membership eligibility.' }, { status: 500 });
		}
		if (!profile) {
			return json({ error: 'Membership profile not found.' }, { status: 403 });
		}
		if (profile.membership_plan !== selectedPlan) {
			return json({ error: 'The selected plan does not match your saved membership plan.' }, { status: 400 });
		}

		const { data: documents, error: documentsError } = await adminClient
			.from('verification_documents')
			.select('document_type, status, created_at')
			.eq('user_id', user.id);

		if (documentsError) {
			console.error('Unable to verify approved documents for Stripe checkout:', documentsError);
			return json({ error: 'Unable to verify your approved documents.' }, { status: 500 });
		}
		if (!isMembershipVerificationReady(profile, documents ?? [])) {
			return json({ error: 'Your documents must be approved before paying for membership.' }, { status: 403 });
		}

		const checkoutUrl = await createMembershipCheckoutSession({
			userId: user.id,
			email: user.email,
			plan: selectedPlan,
			appBaseUrl: env.PUBLIC_SITE_URL || url.origin
		});

		return json({ url: checkoutUrl });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
