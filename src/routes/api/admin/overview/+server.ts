import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

type AuthUserLite = {
	id: string;
	email: string | null;
	created_at: string | null;
};

type ProfileLite = {
	id: string;
	is_verified: boolean | null;
};

function getBearerToken(request: Request): string | null {
	const authHeader = request.headers.get('authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}
	return authHeader.slice(7);
}

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

export const GET: RequestHandler = async ({ request }) => {
	try {
		if (!supabaseUrl || !supabaseAnonKey) {
			return json({ error: 'Server configuration error' }, { status: 500 });
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

		const token = getBearerToken(request);
		if (!token) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const adminAllowed = await isRequesterAdmin(token);
		if (!adminAllowed) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);
		const nowIso = new Date().toISOString();

		const allAuthUsers: AuthUserLite[] = [];
		let page = 1;
		const perPage = 100;
		while (true) {
			const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
			if (error) {
				return json({ error: error.message }, { status: 500 });
			}

			const pageUsers = data?.users ?? [];
			allAuthUsers.push(
				...pageUsers.map((u) => ({
					id: u.id,
					email: u.email ?? null,
					created_at: u.created_at ?? null
				}))
			);

			if (pageUsers.length < perPage) {
				break;
			}
			page += 1;
		}

		const totalUsers = allAuthUsers.length;
		const userIds = allAuthUsers.map((u) => u.id);

		let profiles: ProfileLite[] = [];
		if (userIds.length > 0) {
			const { data: profileRows, error: profilesError } = await adminClient
				.from('profiles')
				.select('id, is_verified')
				.in('id', userIds);

			if (profilesError) {
				return json({ error: profilesError.message }, { status: 500 });
			}

			profiles = (profileRows ?? []) as ProfileLite[];
		}

		const profileById = new Map(profiles.map((p) => [p.id, p]));
		let missingProfileCount = 0;
		for (const user of allAuthUsers) {
			if (!profileById.has(user.id)) {
				missingProfileCount += 1;
			}
		}

		const pendingProfileVerifications = profiles.filter((p) => p.is_verified !== true).length;
		const accountsToVerify = pendingProfileVerifications + missingProfileCount;

		const [activeRidesRes, completedRidesRes, reservationsInProgressRes, confirmedBookingsWithRideRes] =
			await Promise.all([
				adminClient
					.from('rides')
					.select('id', { count: 'exact', head: true })
					.gt('ride_date', nowIso),
				adminClient
					.from('rides')
					.select('id', { count: 'exact', head: true })
					.lte('ride_date', nowIso),
				adminClient
					.from('bookings')
					.select('id', { count: 'exact', head: true })
					.in('status', ['Pending', 'Confirmed']),
				adminClient
					.from('bookings')
					.select('seats_booked, ride:rides(price)')
					.eq('status', 'Confirmed')
			]);

		if (activeRidesRes.error || completedRidesRes.error || reservationsInProgressRes.error || confirmedBookingsWithRideRes.error) {
			return json(
				{
					error:
						activeRidesRes.error?.message ||
						completedRidesRes.error?.message ||
						reservationsInProgressRes.error?.message ||
						confirmedBookingsWithRideRes.error?.message ||
						'Failed to compute overview stats'
				},
				{ status: 500 }
			);
		}

		const activeRides = activeRidesRes.count ?? 0;
		const completedRides = completedRidesRes.count ?? 0;
		const reservationsInProgress = reservationsInProgressRes.count ?? 0;

		const confirmedRows = (confirmedBookingsWithRideRes.data ?? []) as Array<{
			seats_booked: number;
			ride: Array<{ price: number | string }> | null;
		}>;

		const estimatedRevenue = confirmedRows.reduce((sum, row) => {
			const seats = Number(row.seats_booked ?? 0);
			const price = Number(row.ride?.[0]?.price ?? 0);
			if (Number.isNaN(seats) || Number.isNaN(price)) {
				return sum;
			}
			return sum + seats * price;
		}, 0);

		const reportsCount = 0;
		const alertsCount = reportsCount + accountsToVerify;

		return json({
			stats: {
				totalUsers,
				activeRides,
				completedRides,
				reservationsInProgress,
				revenue: {
					hasPaymentIntegration: false,
					estimatedRevenue
				},
				alerts: {
					total: alertsCount,
					reports: reportsCount,
					accountsToVerify
				}
			}
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
