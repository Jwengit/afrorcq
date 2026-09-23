import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { sendBookingRequestReceivedEmail } from '$lib/email';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

function getBearerToken(request: Request): string | null {
	const authHeader = request.headers.get('authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
	return authHeader.slice(7);
}

async function getAuthenticatedUser(token: string) {
	if (!supabaseUrl || !supabaseAnonKey) return null;

	const anonClient = createClient(supabaseUrl, supabaseAnonKey);
	const {
		data: { user },
		error
	} = await anonClient.auth.getUser(token);

	return error || !user ? null : user;
}

function getAdminClient() {
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
	return serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;
}

function getOrigin(): string {
	const publicSiteUrl = process.env.PUBLIC_SITE_URL?.trim();
	return publicSiteUrl || 'https://hizli-carpooling.com';
}

// Creates a booking on behalf of the signed-in passenger, then notifies the
// driver by email that someone requested a seat on their ride. Replaces the
// previous client-side-only insert, which never triggered any email.
export const POST: RequestHandler = async ({ request }) => {
	try {
		const token = getBearerToken(request);
		if (!token) return json({ error: 'Unauthorized' }, { status: 401 });

		const user = await getAuthenticatedUser(token);
		if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

		const body = await request.json().catch(() => ({}));
		const rideId = typeof body?.rideId === 'string' ? body.rideId : '';
		const seats = Number.isFinite(body?.seats) ? Number(body.seats) : Number.parseInt(body?.seats, 10);

		if (!rideId || !Number.isFinite(seats) || seats <= 0) {
			return json({ error: 'Invalid booking request.' }, { status: 400 });
		}

		const adminClient = getAdminClient();
		if (!adminClient) return json({ error: 'Server configuration error' }, { status: 500 });

		const { data: ride, error: rideError } = await adminClient
			.from('rides')
			.select('id, driver_id, departure, arrival, ride_date, seats, price')
			.eq('id', rideId)
			.maybeSingle();

		if (rideError || !ride) {
			return json({ error: 'Ride not found.' }, { status: 404 });
		}

		if (ride.driver_id === user.id) {
			return json({ error: 'You cannot book your own ride.' }, { status: 400 });
		}

		if (seats > ride.seats) {
			return json({ error: 'Not enough seats available.' }, { status: 400 });
		}

		const { data: booking, error: bookingError } = await adminClient
			.from('bookings')
			.insert({
				ride_id: ride.id,
				passenger_id: user.id,
				seats_booked: seats,
				status: 'Pending'
			})
			.select('id, status, seats_booked')
			.single();

		if (bookingError || !booking) {
			return json({ error: bookingError?.message || 'Unable to submit booking.' }, { status: 500 });
		}

		// Best-effort notification — a failure here must never roll back the booking.
		try {
			const [{ data: driverProfile }, { data: passengerProfile }] = await Promise.all([
				adminClient.from('profiles').select('email, first_name').eq('id', ride.driver_id).maybeSingle(),
				adminClient.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle()
			]);

			const driverEmail = (driverProfile?.email ?? '').trim();
			if (driverEmail) {
				const passengerName =
					`${passengerProfile?.first_name ?? ''} ${passengerProfile?.last_name ?? ''}`.trim() || 'A passenger';

				await sendBookingRequestReceivedEmail({
					to: driverEmail,
					firstName: driverProfile?.first_name,
					passengerName,
					rideRoute: `${ride.departure} to ${ride.arrival}`,
					rideDate: new Date(ride.ride_date).toLocaleString('en-US'),
					seatsRequested: seats,
					rideRequestsUrl: `${getOrigin()}/dashboard`
				});
			}
		} catch (notifyError) {
			console.error('Booking email notification failed:', notifyError);
		}

		return json({ success: true, booking });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};