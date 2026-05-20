import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const WELCOME_TICKET_SUBJECT = 'Welcome to Hizli Carpooling';

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
		const safeFirstName = escapeHtml(firstName || 'there');
		const welcomeInboxMessage =
			`<p>Welcome to <strong>Hizli Carpooling</strong>, ${safeFirstName}! 🚗</p>` +
			`<p>We're thrilled to have you join our carpooling community. Here are the essential steps to get started:</p>` +
			`<ol>` +
			`<li><strong>Complete Your Profile</strong> - Add a professional photo and personalize your information</li>` +
			`<li><strong>Upload Your Documents</strong> - Verify your identity to build trust with the community</li>` +
			`<li><strong>Become a Driver (Optional)</strong> - Add your car details to offer rides to passengers</li>` +
			`</ol>` +
			`<p><em>💡 Verified profiles receive 2x more requests and better engagement!</em></p>` +
			`<p>Need help? Reply directly to this message and our team will assist you.</p>` +
			`<br/>` +
			`<p><strong>The Hizli Carpooling Team</strong></p>` +
			`<p style="color: #888; font-size: 0.9em;">Community-driven, accessible, and responsible carpooling 🌍</p>`;

		const { data: existingWelcomeTicket } = await adminClient
			.from('support_tickets')
			.select('id')
			.eq('user_id', userId)
			.eq('subject', WELCOME_TICKET_SUBJECT)
			.limit(1)
			.maybeSingle();

		if (!existingWelcomeTicket?.id) {
			const { data: createdTicket, error: createTicketError } = await adminClient
				.from('support_tickets')
				.insert({
					user_id: userId,
					subject: WELCOME_TICKET_SUBJECT,
					status: 'open',
					priority: 'normal'
				})
				.select('id')
				.single();

			if (!createTicketError && createdTicket?.id) {
				await adminClient.from('support_messages').insert({
					ticket_id: createdTicket.id,
					sender_id: null,
					sender_role: 'admin',
					message: welcomeInboxMessage
				});
			}
		}

		const { error: metadataUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
			user_metadata: {
				...existingMetadata,
				welcome_message_sent_at: new Date().toISOString(),
				welcome_email_sent_at: new Date().toISOString()
			}
		});

		if (metadataUpdateError) {
			console.error('Welcome metadata update error:', metadataUpdateError);
		}

		return json({ success: true });
	} catch (err) {
		console.error('Unexpected error:', err);
		return json({ error: 'Unexpected error' }, { status: 500 });
	}
}