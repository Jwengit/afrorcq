import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

type AdminAuth = { ok: boolean; userId?: string };

async function isRequesterAdmin(token: string): Promise<AdminAuth> {
	if (!supabaseUrl || !supabaseAnonKey) {
		return { ok: false };
	}

	const anonClient = createClient(supabaseUrl, supabaseAnonKey);
	const {
		data: { user },
		error: userError
	} = await anonClient.auth.getUser(token);

	if (userError || !user) {
		return { ok: false };
	}

	const isHizliAccount = (user.email ?? '').toLowerCase() === 'hizli.carpooling@gmail.com';
	if (isHizliAccount) {
		return { ok: true, userId: user.id };
	}

	const { data: profile } = await anonClient
		.from('profiles')
		.select('is_admin')
		.eq('id', user.id)
		.maybeSingle();

	return { ok: Boolean(profile?.is_admin), userId: user.id };
}

function getBearerToken(request: Request): string | null {
	const authHeader = request.headers.get('authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}
	return authHeader.slice(7);
}

function adminClientOrError() {
	if (!supabaseUrl || !supabaseAnonKey) {
		return { error: json({ error: 'Server configuration error' }, { status: 500 }) };
	}
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!serviceRoleKey) {
		return {
			error: json(
				{
					error:
						'SUPABASE_SERVICE_ROLE_KEY is missing. Set it in your environment (.env.local for local dev, or Vercel Project Settings > Environment Variables for deployment) and redeploy/restart.'
				},
				{ status: 500 }
			)
		};
	}
	return { client: createClient(supabaseUrl, serviceRoleKey) };
}

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		const token = getBearerToken(request);
		if (!token) return json({ error: 'Unauthorized' }, { status: 401 });

		const adminCheck = await isRequesterAdmin(token);
		if (!adminCheck.ok) return json({ error: 'Forbidden' }, { status: 403 });

		const result = adminClientOrError();
		if (result.error) return result.error;
		const adminClient = result.client;

		const ticketId = url.searchParams.get('ticketId');
		const status = url.searchParams.get('status');

		if (ticketId) {
			const [{ data: ticket, error: ticketError }, { data: messages, error: messagesError }] =
				await Promise.all([
					adminClient
						.from('support_tickets')
						.select('id, user_id, subject, status, priority, created_at, updated_at, profiles(first_name, last_name, email)')
						.eq('id', ticketId)
						.maybeSingle(),
					adminClient
						.from('support_messages')
						.select('id, ticket_id, sender_id, sender_role, message, created_at, profiles(first_name, last_name, email)')
						.eq('ticket_id', ticketId)
						.order('created_at', { ascending: true })
				]);

			if (ticketError) return json({ error: ticketError.message }, { status: 500 });
			if (messagesError) return json({ error: messagesError.message }, { status: 500 });

			return json({ ticket, messages: messages ?? [] });
		}

		const priority = url.searchParams.get('priority');

		let query = adminClient
			.from('support_tickets')
			.select('id, user_id, subject, status, priority, created_at, updated_at, profiles(first_name, last_name, email)')
			.order('updated_at', { ascending: false });

		if (status) {
			query = query.eq('status', status);
		}
		if (priority) {
			query = query.eq('priority', priority);
		}

		const { data: tickets, error: ticketsError } = await query;
		if (ticketsError) {
			if (ticketsError.message.toLowerCase().includes('relation') && ticketsError.message.toLowerCase().includes('support_tickets')) {
				return json({ tickets: [] });
			}
			return json({ error: ticketsError.message }, { status: 500 });
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

		const adminCheck = await isRequesterAdmin(token);
		if (!adminCheck.ok || !adminCheck.userId) return json({ error: 'Forbidden' }, { status: 403 });

		const body = await request.json();
		const ticketId = body?.ticketId as string | undefined;
		const message = (body?.message as string | undefined)?.trim();

		if (!ticketId || !message) {
			return json({ error: 'ticketId and message are required' }, { status: 400 });
		}

		const result = adminClientOrError();
		if (result.error) return result.error;
		const adminClient = result.client;

		const { error: insertError } = await adminClient.from('support_messages').insert({
			ticket_id: ticketId,
			sender_id: adminCheck.userId,
			sender_role: 'admin',
			message
		});
		if (insertError) return json({ error: insertError.message }, { status: 500 });

		const { error: updateError } = await adminClient
			.from('support_tickets')
			.update({ status: 'in_progress', updated_at: new Date().toISOString() })
			.eq('id', ticketId);
		if (updateError) return json({ error: updateError.message }, { status: 500 });

		return json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async ({ request }) => {
	try {
		const token = getBearerToken(request);
		if (!token) return json({ error: 'Unauthorized' }, { status: 401 });

		const adminCheck = await isRequesterAdmin(token);
		if (!adminCheck.ok) return json({ error: 'Forbidden' }, { status: 403 });

		const body = await request.json();
		const ticketId = body?.ticketId as string | undefined;
		const status = body?.status as 'open' | 'in_progress' | 'resolved' | 'closed' | undefined;
		const action = body?.action as string | undefined;
		const priority = body?.priority as 'low' | 'normal' | 'high' | 'urgent' | undefined;

		if (!ticketId) {
			return json({ error: 'ticketId is required' }, { status: 400 });
		}

		const result = adminClientOrError();
		if (result.error) return result.error;
		const adminClient = result.client;

		if (action === 'update_priority') {
			if (!priority) return json({ error: 'priority is required' }, { status: 400 });
			const { error } = await adminClient
				.from('support_tickets')
				.update({ priority, updated_at: new Date().toISOString() })
				.eq('id', ticketId);
			if (error) return json({ error: error.message }, { status: 500 });
			return json({ success: true });
		}

		if (!status) {
			return json({ error: 'status or action is required' }, { status: 400 });
		}

		const { error } = await adminClient
			.from('support_tickets')
			.update({ status, updated_at: new Date().toISOString() })
			.eq('id', ticketId);
		if (error) return json({ error: error.message }, { status: 500 });

		return json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request, url }) => {
	try {
		const token = getBearerToken(request);
		if (!token) return json({ error: 'Unauthorized' }, { status: 401 });

		const adminCheck = await isRequesterAdmin(token);
		if (!adminCheck.ok) return json({ error: 'Forbidden' }, { status: 403 });

		const ticketId = url.searchParams.get('ticketId');
		if (!ticketId) return json({ error: 'ticketId is required' }, { status: 400 });

		const result = adminClientOrError();
		if (result.error) return result.error;
		const adminClient = result.client;

		const { error: msgError } = await adminClient
			.from('support_messages')
			.delete()
			.eq('ticket_id', ticketId);
		if (msgError) return json({ error: msgError.message }, { status: 500 });

		const { error: ticketError } = await adminClient
			.from('support_tickets')
			.delete()
			.eq('id', ticketId);
		if (ticketError) return json({ error: ticketError.message }, { status: 500 });

		return json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
