import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { sendAdminMemberMessageEmail } from '$lib/email';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

function getBearerToken(request: Request): string | null {
	const authHeader = request.headers.get('authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
	return authHeader.slice(7);
}

async function getAdminUserId(token: string): Promise<string | null> {
	if (!supabaseUrl || !supabaseAnonKey) return null;

	const anonClient = createClient(supabaseUrl, supabaseAnonKey);
	const {
		data: { user },
		error
	} = await anonClient.auth.getUser(token);

	if (error || !user) return null;
	if ((user.email ?? '').toLowerCase() === 'hizli.carpooling@gmail.com') return user.id;

	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!serviceRoleKey) return null;

	const adminClient = createClient(supabaseUrl, serviceRoleKey);
	const { data: profile, error: profileError } = await adminClient
		.from('profiles')
		.select('is_admin')
		.eq('id', user.id)
		.maybeSingle();

	if (profileError || !profile?.is_admin) return null;
	return user.id;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const token = getBearerToken(request);
		if (!token) return json({ error: 'Unauthorized' }, { status: 401 });

		const adminUserId = await getAdminUserId(token);
		if (!adminUserId) return json({ error: 'Forbidden' }, { status: 403 });

		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!supabaseUrl || !serviceRoleKey) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const body = await request.json();
		const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
		const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
		const message = typeof body?.message === 'string' ? body.message.trim() : '';

		if (!userId || !subject || !message) {
			return json({ error: 'userId, subject and message are required' }, { status: 400 });
		}
		if (subject.length > 150 || message.length > 5000) {
			return json({ error: 'Subject must be 150 characters or fewer and message 5,000 characters or fewer.' }, { status: 400 });
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);
		const { data: targetProfile, error: profileError } = await adminClient
			.from('profiles')
			.select('first_name, email')
			.eq('id', userId)
			.maybeSingle();

		if (profileError) return json({ error: profileError.message }, { status: 500 });

		const { data: authResult, error: authError } = await adminClient.auth.admin.getUserById(userId);
		if (authError || !authResult.user) {
			return json({ error: 'Member not found' }, { status: 404 });
		}

		const email = (targetProfile?.email ?? authResult.user.email ?? '').trim();
		const firstName = targetProfile?.first_name ?? null;
		const { data: ticket, error: ticketError } = await adminClient
			.from('support_tickets')
			.insert({
				user_id: userId,
				subject,
				status: 'open',
				priority: 'normal',
				initiated_by_admin: true
			})
			.select('id')
			.single();

		if (ticketError) {
			console.error('Admin conversation creation failed:', ticketError);
			return json({ error: 'Unable to start the member conversation.' }, { status: 500 });
		}

		const { error: messageError } = await adminClient.from('support_messages').insert({
			ticket_id: ticket.id,
			sender_id: adminUserId,
			sender_role: 'admin',
			message
		});

		if (messageError) {
			const { error: cleanupError } = await adminClient
				.from('support_tickets')
				.delete()
				.eq('id', ticket.id);
			if (cleanupError) console.error('Admin conversation cleanup failed:', cleanupError);
			console.error('Admin conversation opening message failed:', messageError);
			return json({ error: 'Unable to save the opening message.' }, { status: 500 });
		}

		if (!email) {
			console.error('Admin member message saved without email: member has no email address.', userId);
			return json({
				success: true,
				ticketId: ticket.id,
				emailSent: false,
				warning: 'The conversation was started, but the member has no email address.'
			});
		}

		const emailId = await sendAdminMemberMessageEmail({ to: email, firstName, subject, message });
		if (!emailId) {
			return json({
				success: true,
				ticketId: ticket.id,
				emailSent: false,
				warning: 'The conversation was started, but the email could not be sent. Check the server and Resend logs.'
			});
		}

		return json({ success: true, ticketId: ticket.id, emailSent: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		console.error('Admin member message failed:', message);
		return json({ error: message }, { status: 500 });
	}
};
