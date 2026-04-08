import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

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

export const GET: RequestHandler = async ({ request, url }) => {
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

		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey) {
			return json(
				{
					error:
						'SUPABASE_SERVICE_ROLE_KEY is missing. Add it to .env.local then restart the dev server.'
				},
				{ status: 500 }
			);
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);

		let query = adminClient
			.from('reports')
			.select(
				'id, user_id, ride_id, type, description, status, action_taken, admin_note, created_at, updated_at, profiles(first_name, last_name, email), rides(city_from, city_to, ride_date)'
			)
			.order('created_at', { ascending: false });

		const type = url.searchParams.get('type');
		const status = url.searchParams.get('status');

		if (type) query = query.eq('type', type);
		if (status) query = query.eq('status', status);

		const { data, error } = await query;

		if (error) {
			if (error.message.toLowerCase().includes('relation') && error.message.toLowerCase().includes('reports')) {
				return json({ reports: [] });
			}
			return json({ error: error.message }, { status: 500 });
		}

		return json({ reports: data ?? [] });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async ({ request }) => {
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
		const reportId = body?.reportId as string | undefined;
		const action = body?.action as 'ignore' | 'warn' | 'suspend' | undefined;
		const note = (body?.note as string | undefined) ?? null;
		const userId = body?.userId as string | null | undefined;

		if (!reportId || !action) {
			return json({ error: 'reportId and action are required' }, { status: 400 });
		}

		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey) {
			return json(
				{
					error:
						'SUPABASE_SERVICE_ROLE_KEY is missing. Add it to .env.local then restart the dev server.'
				},
				{ status: 500 }
			);
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);

		let status: 'ignored' | 'resolved' = 'resolved';
		let actionTaken = 'warned_user';

		if (action === 'ignore') {
			status = 'ignored';
			actionTaken = 'ignored';
		}
		if (action === 'suspend') {
			status = 'resolved';
			actionTaken = 'suspended_user';
		}

		if (action === 'suspend' && userId) {
			const { error: suspendError } = await adminClient
				.from('profiles')
				.update({ user_status: 'suspended' })
				.eq('id', userId);
			if (suspendError) {
				return json({ error: suspendError.message }, { status: 500 });
			}
		}

		const { error: updateError } = await adminClient
			.from('reports')
			.update({
				status,
				action_taken: actionTaken,
				admin_note: note,
				updated_at: new Date().toISOString()
			})
			.eq('id', reportId);

		if (updateError) {
			return json({ error: updateError.message }, { status: 500 });
		}

		return json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};