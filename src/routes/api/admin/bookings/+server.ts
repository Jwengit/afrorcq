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

		// Build filters
		let query = adminClient.from('bookings').select(
			`
			id, 
			ride_id, 
			user_id, 
			seats_booked, 
			status, 
			created_at,
			rides(id, city_from, city_to, ride_date, price, driver_id),
			profiles(first_name, last_name, email)
		`
		);

		// Apply filters
		const filterStatus = url.searchParams.get('status');
		const filterUserId = url.searchParams.get('userId');
		const filterRideId = url.searchParams.get('rideId');
		const fromDate = url.searchParams.get('fromDate');

		if (filterStatus) {
			query = query.eq('status', filterStatus);
		}
		if (filterUserId) {
			query = query.eq('user_id', filterUserId);
		}
		if (filterRideId) {
			query = query.eq('ride_id', filterRideId);
		}
		if (fromDate) {
			query = query.gte('created_at', fromDate);
		}

		const { data: bookings, error: bookingsError } = await query.order('created_at', {
			ascending: false
		});

		if (bookingsError) {
			return json({ error: bookingsError.message }, { status: 500 });
		}

		return json({ bookings });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
