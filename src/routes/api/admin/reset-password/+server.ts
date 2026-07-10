import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { sendMemberEmail } from '$lib/server/memberEmail';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

async function isRequesterAdmin(token: string): Promise<boolean> {
	if (!supabaseUrl || !supabaseAnonKey) {
		return false;
	}

	const anonClient = createClient(supabaseUrl, supabaseAnonKey);
	const {
		data: { user },
		error: userError
	} = await anonClient.auth.getUser(token);

	if (userError || !user) {
		return false;
	}

	const isHizliAccount = (user.email ?? '').toLowerCase() === 'hizli.carpooling@gmail.com';
	if (isHizliAccount) {
		return true;
	}

	const { data: profile } = await anonClient
		.from('profiles')
		.select('is_admin')
		.eq('id', user.id)
		.maybeSingle();

	return Boolean(profile?.is_admin);
}

function getBearerToken(request: Request): string | null {
	const authHeader = request.headers.get('authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}
	return authHeader.slice(7);
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		if (!supabaseUrl || !supabaseAnonKey) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const token = getBearerToken(request);
		if (!token) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const adminAllowed = await isRequesterAdmin(token);
		if (!adminAllowed) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		const body = await request.json();
		const { userId, email } = body;

		if (!userId || !email) {
			return json({ error: 'Invalid userId or email' }, { status: 400 });
		}

		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey) {
			return json(
				{
					error:
						'SUPABASE_SERVICE_ROLE_KEY is missing. Set it in your environment (.env.local for local dev, or Vercel Project Settings > Environment Variables for deployment) and redeploy/restart.'
				},
				{ status: 500 }
			);
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);

		// Send password reset email
		const { data, error } = await adminClient.auth.admin.generateLink({
			type: 'recovery',
			email: email,
			options: {
				redirectTo: `${getOrigin()}/auth/callback`
			}
		});

		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		const recoveryLink =
			typeof data?.properties?.action_link === 'string' ? data.properties.action_link : `${getOrigin()}/auth/login`;

		await sendMemberEmail({
			to: email,
			subject: 'Reset your Hizli password',
			html:
				`<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">` +
				`<p style="margin:0 0 12px;">We received a request to reset your password.</p>` +
				`<p style="margin:0 0 12px;">` +
				`<a href="${recoveryLink}" style="display:inline-block;padding:9px 14px;border-radius:8px;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:600;">Reset my password</a>` +
				`</p>` +
				`<p style="margin:0; color:#6b7280; font-size:14px;">If you did not request this change, you can safely ignore this email.</p>` +
				`</div>`,
			text:
				`We received a request to reset your password.\n\n` +
				`Reset your password: ${recoveryLink}\n\n` +
				`If you did not request this change, you can ignore this email.`
		});

		return json({
			success: true,
			message: `Password reset email sent to ${email}`
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};

function getOrigin(): string {
	// In production, this would be the actual domain
	// In development, this is typically http://localhost:5173
	if (typeof process !== 'undefined' && process.env.PUBLIC_URL) {
		return process.env.PUBLIC_URL;
	}
	return 'http://localhost:5173';
}
