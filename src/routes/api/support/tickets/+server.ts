import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
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

async function getUserIdFromToken(token: string): Promise<string | null> {
	if (!supabaseUrl || !supabaseAnonKey) return null;
	const anonClient = createClient(supabaseUrl, supabaseAnonKey);
	const {
		data: { user },
		error
	} = await anonClient.auth.getUser(token);
	if (error || !user) return null;
	return user.id;
}

function getAdminClient() {
	if (!supabaseUrl) return null;
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!serviceRoleKey) return null;
	return createClient(supabaseUrl, serviceRoleKey);
}

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		const token = getBearerToken(request);
		if (!token) return json({ error: 'Unauthorized' }, { status: 401 });

		const userId = await getUserIdFromToken(token);
		if (!userId) return json({ error: 'Unauthorized' }, { status: 401 });

		const adminClient = getAdminClient();
		if (!adminClient) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const ticketId = url.searchParams.get('ticketId');
		if (ticketId) {
			const [{ data: ticket, error: ticketError }, { data: messages, error: messagesError }] =
				await Promise.all([
					adminClient
						.from('support_tickets')
						.select('id, user_id, subject, status, priority, created_at, updated_at')
						.eq('id', ticketId)
						.eq('user_id', userId)
						.maybeSingle(),
					adminClient
						.from('support_messages')
						.select('id, ticket_id, sender_id, sender_role, message, created_at')
						.eq('ticket_id', ticketId)
						.order('created_at', { ascending: true })
				]);

			if (ticketError) return json({ error: ticketError.message }, { status: 500 });
			if (messagesError) return json({ error: messagesError.message }, { status: 500 });
			if (!ticket) return json({ error: 'Ticket not found' }, { status: 404 });

			return json({ ticket, messages: messages ?? [] });
		}

		const { data: tickets, error } = await adminClient
			.from('support_tickets')
			.select('id, user_id, subject, status, priority, created_at, updated_at')
			.eq('user_id', userId)
			.order('updated_at', { ascending: false });

		if (error) {
			if (error.message.toLowerCase().includes('relation') && error.message.toLowerCase().includes('support_tickets')) {
				return json({ tickets: [] });
			}
			return json({ error: error.message }, { status: 500 });
		}

		return json({ tickets: tickets ?? [] });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const token = getBearerToken(request);
		if (!token) return json({ error: 'Unauthorized' }, { status: 401 });

		const userId = await getUserIdFromToken(token);
		if (!userId) return json({ error: 'Unauthorized' }, { status: 401 });

		const adminClient = getAdminClient();
		if (!adminClient) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const body = await request.json();
		const ticketId = body?.ticketId as string | undefined;
		const subject = (body?.subject as string | undefined)?.trim();
		const message = (body?.message as string | undefined)?.trim();
		const priority = (body?.priority as 'low' | 'normal' | 'high' | 'urgent' | undefined) ?? 'normal';

		if (!message) {
			return json({ error: 'message is required' }, { status: 400 });
		}

		if (ticketId) {
			const { data: existing, error: existingError } = await adminClient
				.from('support_tickets')
				.select('id')
				.eq('id', ticketId)
				.eq('user_id', userId)
				.maybeSingle();
			if (existingError) return json({ error: existingError.message }, { status: 500 });
			if (!existing) return json({ error: 'Ticket not found' }, { status: 404 });

			const { error: insertMsgError } = await adminClient.from('support_messages').insert({
				ticket_id: ticketId,
				sender_id: userId,
				sender_role: 'user',
				message
			});
			if (insertMsgError) return json({ error: insertMsgError.message }, { status: 500 });

			await adminClient
				.from('support_tickets')
				.update({ status: 'open', updated_at: new Date().toISOString() })
				.eq('id', ticketId)
				.eq('user_id', userId);

			return json({ success: true, ticketId });
		}

		if (!subject) {
			return json({ error: 'subject is required when creating a new ticket' }, { status: 400 });
		}

		const { data: createdTicket, error: createTicketError } = await adminClient
			.from('support_tickets')
			.insert({ user_id: userId, subject, priority, status: 'open' })
			.select('id')
			.single();
		if (createTicketError) return json({ error: createTicketError.message }, { status: 500 });

		const { error: createMsgError } = await adminClient.from('support_messages').insert({
			ticket_id: createdTicket.id,
			sender_id: userId,
			sender_role: 'user',
			message
		});
		if (createMsgError) return json({ error: createMsgError.message }, { status: 500 });

		return json({ success: true, ticketId: createdTicket.id });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
