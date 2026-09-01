import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createClient } from '@supabase/supabase-js';
import { sendWelcomeEmail } from '$lib/email';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function getFirstName(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return '';
	return trimmed.split(/\s+/)[0] ?? '';
}

function buildWelcomeInboxMessage(safeFirstName: string): string {
	return (
		`<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">` +
		`<p style="margin: 0 0 12px;">Welcome to <strong>Hizli Carpooling</strong>, ${safeFirstName}! &#128663;</p>` +
		`<p style="margin: 0 0 12px;">` +
		`We're delighted to welcome you to our carpooling community. Here are the essential steps to get started:` +
		`</p>` +
		`<ol style="margin: 0 0 14px 20px; padding: 0;">` +
		`<li style="margin: 0 0 8px;"><strong>Complete your profile</strong> - Add an appropriate photo and personalize your information.</li>` +
		`<li style="margin: 0 0 8px;"><strong>Upload your documents</strong> - Verify your identity to build trust in the community.</li>` +
		`<li style="margin: 0;"><strong>Become a driver (optional)</strong> - Add your car details to welcome passengers.</li>` +
		`</ol>` +
		`<p style="margin: 0 0 12px; padding: 10px 12px; background: #f3f4f6; border-left: 4px solid #16a34a;">` +
		`&#128161; <strong>Tip:</strong> Verified profiles receive 2x more requests and interactions.` +
		`</p>` +
		`<p style="margin: 0 0 12px;">Need help? Reply directly to this message and our team will assist you.</p>` +
		`<p style="margin: 0;"><strong>The Hizli Carpooling Team</strong></p>` +
		`<p style="margin: 10px 0 0; color: #6b7280; font-size: 0.9em;">` +
		`Community-driven, accessible, and responsible carpooling &#127757;` +
		`</p>` +
		`</div>`
	);
}

function getAdminClient() {
	if (!supabaseUrl) return null;
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!serviceRoleKey) return null;
	return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST({ request }) {
	const { name, userId } = await request.json();

	try {
		if (!userId) {
			return json({ error: 'userId is required' }, { status: 400 });
		}

		const adminClient = getAdminClient();
		if (!adminClient) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(userId);
		if (userError || !userData?.user) {
			return json({ error: userError?.message || 'User not found' }, { status: 400 });
		}

		const user = userData.user;
		const existingMetadata = (user.user_metadata ?? {}) as Record<string, unknown>;
		if (existingMetadata.welcome_message_sent_at || existingMetadata.welcome_email_sent_at) {
			return json({ success: true, skipped: true, reason: 'already_sent' });
		}

		const displayName =
			(user.user_metadata?.full_name as string | undefined) ||
			(user.user_metadata?.name as string | undefined) ||
			(name as string | undefined) ||
			(user.email?.split('@')[0] as string | undefined) ||
			'';
		const firstName = getFirstName(displayName);
		let welcomeEmailSent = false;

		if (user.email) {
			const emailResult = await sendWelcomeEmail({
				to: user.email,
				firstName: firstName || null
			});

			if (!emailResult) {
				console.error('Welcome email send failed for user:', user.id);
				return json({ error: 'Failed to send welcome email' }, { status: 500 });
			}

			welcomeEmailSent = true;
		}

		if (!welcomeEmailSent) {
			return json({ error: 'No welcome email was sent' }, { status: 500 });
		}

		const metadata: Record<string, unknown> = {
			...existingMetadata
		};

		if (welcomeEmailSent) {
			metadata.welcome_email_sent_at = new Date().toISOString();
		}

		const { error: metadataUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
			user_metadata: metadata
		});

		if (metadataUpdateError) {
			console.error('Welcome metadata update error:', metadataUpdateError);
			return json({ error: 'Failed to update welcome metadata' }, { status: 500 });
		}

		return json({ success: true });
	} catch (err) {
		console.error('Unexpected error:', err);
		return json({ error: 'Unexpected error' }, { status: 500 });
	}
}