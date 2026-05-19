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
			console.warn('[ADMIN_REPORTS_GET] Admin check failed - access denied');
			return json({ error: 'Forbidden' }, { status: 403 });
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

		let query = adminClient
			.from('reports')
			.select(
				'id, user_id, reporter_id, ride_id, type, description, status, action_taken, admin_note, created_at, updated_at'
			)
			.order('created_at', { ascending: false });

		const type = url.searchParams.get('type');
		const status = url.searchParams.get('status');

		if (type) query = query.eq('type', type);
		if (status) query = query.eq('status', status);

		const { data, error } = await query;

		if (error) {
			console.error('[ADMIN_REPORTS_GET] Query error:', error);
			return json({ error: error.message }, { status: 500 });
		}

		type RawReport = {
			id: string;
			user_id: string | null;
			reporter_id: string | null;
			ride_id: string | null;
			type: string;
			description: string | null;
			status: string;
			action_taken: string | null;
			admin_note: string | null;
			created_at: string;
			updated_at: string;
		};

		const rawReports = (data ?? []) as RawReport[];
		console.log('[ADMIN_REPORTS_GET] Retrieved reports count:', rawReports.length);
		if (rawReports.length === 0) {
			console.warn('[ADMIN_REPORTS_GET] No reports returned. Check whether reports are being inserted into the same Supabase project/environment.');
		}

		const allProfileIds = Array.from(
			new Set(
				rawReports
					.flatMap((r) => [r.user_id, r.reporter_id])
					.filter((id): id is string => Boolean(id))
			)
		);
		const rideIds = Array.from(
			new Set(rawReports.map((r) => r.ride_id).filter((id): id is string => Boolean(id)))
		);

		const profileMap: Record<string, { first_name: string | null; last_name: string | null; email: string | null }> = {};
		if (allProfileIds.length > 0) {
			const { data: profilesData } = await adminClient
				.from('profiles')
				.select('id, first_name, last_name, email')
				.in('id', allProfileIds);

			if (profilesData) {
				for (const p of profilesData) {
					profileMap[p.id] = {
						first_name: p.first_name ?? null,
						last_name: p.last_name ?? null,
						email: p.email ?? null
					};
				}
			}
		}

		const rideMap: Record<string, { city_from: string | null; city_to: string | null; ride_date: string | null }> = {};
		if (rideIds.length > 0) {
			const { data: ridesData } = await adminClient
				.from('rides')
				.select('id, departure, arrival, ride_date')
				.in('id', rideIds);

			if (ridesData) {
				for (const ride of ridesData) {
					rideMap[ride.id] = {
						city_from: ride.departure ?? null,
						city_to: ride.arrival ?? null,
						ride_date: ride.ride_date ?? null
					};
				}
			}
		}

		const enriched = rawReports.map((r) => ({
			...r,
			profiles: r.user_id ? (profileMap[r.user_id] ?? null) : null,
			reported_profile: r.user_id ? (profileMap[r.user_id] ?? null) : null,
			reporter_profile: r.reporter_id ? (profileMap[r.reporter_id] ?? null) : null,
			rides: r.ride_id ? (rideMap[r.ride_id] ?? null) : null
		}));

		return json({ reports: enriched });
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
		const action = body?.action as 'ignore' | 'warn' | 'suspend' | 'resolve' | undefined;
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
						'SUPABASE_SERVICE_ROLE_KEY is missing. Set it in your environment (.env.local for local dev, or Vercel Project Settings > Environment Variables for deployment) and redeploy/restart.'
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
		if (action === 'resolve') {
			status = 'resolved';
			actionTaken = 'resolved';
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

		if (action === 'warn' && userId) {
			const warningMessage =
				(note ?? '').trim() ||
				'Your account has received a warning from the admin team. Please review platform rules and avoid repeating the reported behavior.';

			const { data: createdTicket, error: createTicketError } = await adminClient
				.from('support_tickets')
				.insert({
					user_id: userId,
					subject: 'Account warning from admin',
					status: 'open',
					priority: 'high'
				})
				.select('id')
				.single();

			if (createTicketError || !createdTicket?.id) {
				return json(
					{ error: createTicketError?.message || 'Unable to create warning ticket.' },
					{ status: 500 }
				);
			}

			const { error: insertMessageError } = await adminClient.from('support_messages').insert({
				ticket_id: createdTicket.id,
				sender_id: null,
				sender_role: 'admin',
				message: warningMessage
			});

			if (insertMessageError) {
				return json({ error: insertMessageError.message }, { status: 500 });
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