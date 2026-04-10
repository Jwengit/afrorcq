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

		const userId = url.searchParams.get('userId');
		if (!userId) {
			return json({ error: 'userId query parameter required' }, { status: 400 });
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

		// Get rides where user is driver or complete booking info
		const [driverRidesRes, bookingsRes] = await Promise.all([
			adminClient
				.from('rides')
				.select('id, departure, arrival, ride_date, seats, price')
				.eq('driver_id', userId)
				.order('ride_date', { ascending: false })
				.limit(20),
			adminClient
				.from('bookings')
				.select(
					'id, status, seats_booked, ride:rides(id, departure, arrival, ride_date, price)'
				)
				.eq('passenger_id', userId)
				.order('created_at', { ascending: false })
				.limit(20)
		]);

		if (driverRidesRes.error || bookingsRes.error) {
			return json(
				{
					error:
						driverRidesRes.error?.message || bookingsRes.error?.message || 'Failed to fetch rides'
				},
				{ status: 500 }
			);
		}

		const now = Date.now();
		const normalizedDriverRides = (driverRidesRes.data ?? []).map((ride) => {
			const isPastRide = new Date(ride.ride_date).getTime() < now;
			return {
				id: ride.id,
				city_from: ride.departure,
				city_to: ride.arrival,
				ride_date: ride.ride_date,
				available_seats: ride.seats,
				price: ride.price,
				status: isPastRide ? 'Terminé' : 'Actif'
			};
		});

		const normalizedBookings = (bookingsRes.data ?? []).map((booking) => ({
			...booking,
			ride: (booking.ride ?? []).map((r) => ({
				...r,
				city_from: r.departure,
				city_to: r.arrival
			}))
		}));

		return json({
			driverRides: normalizedDriverRides,
			bookings: normalizedBookings
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
