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
		let query = adminClient
			.from('rides')
			.select(
				'id, city_from, city_to, ride_date, price, available_seats, driver_id, status, created_at, profiles(first_name, last_name, email)'
			);

		// Apply filters
		const cityFrom = url.searchParams.get('cityFrom');
		const cityTo = url.searchParams.get('cityTo');
		const status = url.searchParams.get('status');
		const fromDate = url.searchParams.get('fromDate');

		if (cityFrom) {
			query = query.ilike('city_from', `%${cityFrom}%`);
		}
		if (cityTo) {
			query = query.ilike('city_to', `%${cityTo}%`);
		}
		if (status) {
			query = query.eq('status', status);
		}
		if (fromDate) {
			query = query.gte('ride_date', fromDate);
		}

		const { data: rides, error: ridesError } = await query.order('ride_date', { ascending: false });

		if (ridesError) {
			return json({ error: ridesError.message }, { status: 500 });
		}

		// Get booking counts for each ride
		const rideIds = (rides ?? []).map((r) => r.id);
		let bookingCounts: Record<string, number> = {};

		if (rideIds.length > 0) {
			const { data: bookings } = await adminClient
				.from('bookings')
				.select('ride_id, seats_booked')
				.in('ride_id', rideIds)
				.eq('status', 'Confirmed');

			bookings?.forEach((b) => {
				bookingCounts[b.ride_id] = (bookingCounts[b.ride_id] ?? 0) + (b.seats_booked ?? 0);
			});
		}

		const enrichedRides = (rides ?? []).map((ride) => ({
			...ride,
			bookedSeats: bookingCounts[ride.id] ?? 0
		}));

		return json({ rides: enrichedRides });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request, url }) => {
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

		const rideId = url.searchParams.get('rideId');
		if (!rideId) {
			return json({ error: 'rideId required' }, { status: 400 });
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

		// Delete associated bookings first
		await adminClient.from('bookings').delete().eq('ride_id', rideId);

		// Delete the ride
		const { error: deleteError } = await adminClient.from('rides').delete().eq('id', rideId);

		if (deleteError) {
			return json({ error: deleteError.message }, { status: 500 });
		}

		return json({ success: true, message: 'Ride deleted successfully' });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
