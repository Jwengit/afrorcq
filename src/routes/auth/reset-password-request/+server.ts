import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { sendPasswordResetEmail } from '$lib/email';

// Force the Node.js runtime for this route. The 'resend' package and the
// Supabase admin client rely on Node APIs that aren't guaranteed to work on
// Vercel's Edge runtime — this is a likely cause of a 500 that only happens
// in production and never locally (local `npm run dev` always runs Node).
export const config = {
	runtime: 'nodejs20.x'
};

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
		// But we still need this logged, otherwise a failure here is
		// completely invisible — and it happens BEFORE we'd ever attempt
		// to send the email.
		if (error || !data) {
			if (error) {
				console.error(`[reset-password] generateLink failed for ${email}:`, error.message);
			} else {
				console.error(`[reset-password] generateLink returned no data for ${email}`);
			}
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

		const emailId = await sendPasswordResetEmail({
			to: email,
			firstName: profile?.first_name,
			resetUrl: recoveryLink
		});

		// sendPasswordResetEmail returns null on ANY failure (missing API key,
		// unverified domain, Resend error, etc.) without throwing. We still
		// return the generic response to the client (no account-enumeration
		// leak), but we need this logged server-side or the failure is
		// completely invisible.
		if (!emailId) {
			console.error(`[reset-password] email send failed for ${email}`);
		}

		return genericResponse;
	} catch (error) {
		console.error('reset-password-request error:', error);
		// Still return the generic response so the frontend UX stays consistent
		// and no internal detail leaks to the client.
		return genericResponse;
	}
};