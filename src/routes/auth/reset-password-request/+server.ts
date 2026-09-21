import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { sendPasswordResetEmail } from '$lib/email';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';

function getOrigin(): string {
	const publicSiteUrl = process.env.PUBLIC_SITE_URL?.trim();
	if (publicSiteUrl) {
		return publicSiteUrl;
	}
	if (typeof process !== 'undefined' && process.env.PUBLIC_URL) {
		return process.env.PUBLIC_URL;
	}
	return 'https://hizli-carpooling.com';
}

// Public, self-service "forgot password" endpoint. Always returns a generic
// success response, whether or not the email exists, so this can't be used
// to check which addresses have an account (basic account-enumeration guard).
export const POST: RequestHandler = async ({ request }) => {
	const genericResponse = json({
		success: true,
		message: 'If an account exists for that email, a password reset link has been sent.'
	});

	try {
		if (!supabaseUrl) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const body = await request.json().catch(() => ({}));
		const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

		if (!email) {
			return json({ error: 'Email is required.' }, { status: 400 });
		}

		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);

		const { data, error } = await adminClient.auth.admin.generateLink({
			type: 'recovery',
			email,
			options: {
				redirectTo: `${getOrigin()}/auth/callback`
			}
		});

		// Don't leak whether the email exists: any lookup/generation failure
		// (including "user not found") still returns the generic response.
		if (error || !data) {
			return genericResponse;
		}

		const recoveryLink =
			typeof data?.properties?.action_link === 'string'
				? data.properties.action_link
				: `${getOrigin()}/auth/login`;

		const { data: profile } = await adminClient
			.from('profiles')
			.select('first_name')
			.eq('id', data.user?.id ?? '')
			.maybeSingle();

		await sendPasswordResetEmail({
			to: email,
			firstName: profile?.first_name,
			resetUrl: recoveryLink
		});

		return genericResponse;
	} catch (error) {
		console.error('reset-password-request error:', error);
		// Still return the generic response so the frontend UX stays consistent
		// and no internal detail leaks to the client.
		return genericResponse;
	}
};