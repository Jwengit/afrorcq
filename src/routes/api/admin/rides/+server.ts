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
						'SUPABASE_SERVICE_ROLE_KEY is missing. Set it in your environment (.env.local for local dev, or Vercel Project Settings > Environment Variables for deployment) and redeploy/restart.'
				},
				{ status: 500 }
			);
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);

		// Build filters
		let query = adminClient
			.from('rides')
			.select('id, departure, arrival, ride_date, price, seats, driver_id, created_at');

		// Apply filters
		const cityFrom = url.searchParams.get('cityFrom');
		const cityTo = url.searchParams.get('cityTo');
		const status = url.searchParams.get('status');
		const fromDate = url.searchParams.get('fromDate');

		if (cityFrom) {
			query = query.ilike('departure', `%${cityFrom}%`);
		}
		if (cityTo) {
			query = query.ilike('arrival', `%${cityTo}%`);
		}
		if (fromDate) {
			query = query.gte('ride_date', fromDate);
		}

		const { data: rides, error: ridesError } = await query.order('ride_date', { ascending: false });

		if (ridesError) {
			return json({ error: ridesError.message }, { status: 500 });
		}

		// Resolve driver profile info explicitly (no FK relation required in PostgREST schema cache)
		const driverIds = Array.from(
			new Set((rides ?? []).map((r) => r.driver_id).filter((id): id is string => Boolean(id)))
		);
		let driverProfilesById = new Map<
			string,
			{ first_name: string | null; last_name: string | null; email: string | null }
		>();

		if (driverIds.length > 0) {
			const { data: driverProfiles, error: driverProfilesError } = await adminClient
				.from('profiles')
				.select('id, first_name, last_name, email')
				.in('id', driverIds);

			if (driverProfilesError) {
				return json({ error: driverProfilesError.message }, { status: 500 });
			}

			driverProfilesById = new Map(
				(driverProfiles ?? []).map((p) => [
					p.id,
					{
						first_name: p.first_name ?? null,
						last_name: p.last_name ?? null,
						email: p.email ?? null
					}
				])
			);
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

		const now = Date.now();
		const enrichedRides = (rides ?? [])
			.map((ride) => {
				const bookedSeats = bookingCounts[ride.id] ?? 0;
				const totalSeats = Number(ride.seats ?? 0);
				const isPastRide = new Date(ride.ride_date).getTime() < now;
				const computedStatus = isPastRide ? 'Terminé' : bookedSeats >= totalSeats && totalSeats > 0 ? 'Complet' : 'Actif';

				return {
					id: ride.id,
					city_from: ride.departure,
					city_to: ride.arrival,
					ride_date: ride.ride_date,
					price: ride.price,
					available_seats: totalSeats,
					driver_id: ride.driver_id,
					status: computedStatus,
					created_at: ride.created_at,
					profiles: driverProfilesById.get(ride.driver_id) ?? {
				first_name: null,
				last_name: null,
				email: null
			},
					bookedSeats
				};
			})
			.filter((ride) => {
				if (!status) return true;
				return ride.status === status;
			});

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
						'SUPABASE_SERVICE_ROLE_KEY is missing. Set it in your environment (.env.local for local dev, or Vercel Project Settings > Environment Variables for deployment) and redeploy/restart.'
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
