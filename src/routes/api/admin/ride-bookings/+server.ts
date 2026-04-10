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

		// Get bookings for this ride with passenger info
		const { data: bookings, error: bookingsError } = await adminClient
			.from('bookings')
			.select('id, passenger_id, seats_booked, status, created_at')
			.eq('ride_id', rideId);

		if (bookingsError) {
			return json({ error: bookingsError.message }, { status: 500 });
		}

		const passengerIds = Array.from(
			new Set((bookings ?? []).map((b) => b.passenger_id).filter((id): id is string => Boolean(id)))
		);

		let passengersById = new Map<
			string,
			{ first_name: string | null; last_name: string | null; email: string | null }
		>();

		if (passengerIds.length > 0) {
			const { data: passengerProfiles, error: passengerProfilesError } = await adminClient
				.from('profiles')
				.select('id, first_name, last_name, email')
				.in('id', passengerIds);

			if (passengerProfilesError) {
				return json({ error: passengerProfilesError.message }, { status: 500 });
			}

			passengersById = new Map(
				(passengerProfiles ?? []).map((p) => [
					p.id,
					{
						first_name: p.first_name ?? null,
						last_name: p.last_name ?? null,
						email: p.email ?? null
					}
				])
			);
		}

		const normalizedBookings = (bookings ?? []).map((b) => ({
			...b,
			user_id: b.passenger_id,
			profiles: passengersById.get(b.passenger_id) ?? {
				first_name: null,
				last_name: null,
				email: null
			}
		}));

		return json({ bookings: normalizedBookings });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
