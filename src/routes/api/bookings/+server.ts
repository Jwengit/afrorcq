import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import {
	sendBookingAcceptedEmail,
	sendBookingRejectedEmail,
	sendBookingRequestReceivedEmail
} from '$lib/email';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

function getBookingRejectionReason(reason: unknown): string | null {
	if (typeof reason !== 'string') return null;
	const normalizedReason = reason.trim();
	return normalizedReason.length > 0 && normalizedReason.length <= 500 ? normalizedReason : null;
}

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
	return (publicSiteUrl || 'https://hizli-carpooling.com').replace(/\/+$/, '');
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

		const { data: passengerAccount } = await adminClient
			.from('profiles')
			.select('user_status, suspended_until')
			.eq('id', user.id)
			.maybeSingle();

		if (passengerAccount?.user_status === 'banned') {
			return json({ error: 'Your account has been banned. You cannot book rides.' }, { status: 403 });
		}

		if (passengerAccount?.user_status === 'suspended') {
			const until = passengerAccount?.suspended_until
				? ` until ${new Date(passengerAccount.suspended_until).toLocaleDateString()}`
				: '';
			return json({ error: `Your account is suspended${until}. You cannot book rides during this period.` }, { status: 403 });
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

export const PATCH: RequestHandler = async ({ request }) => {
	try {
		const token = getBearerToken(request);
		if (!token) return json({ error: 'Unauthorized' }, { status: 401 });

		const user = await getAuthenticatedUser(token);
		if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

		const body = await request.json().catch(() => ({}));
		const bookingId = typeof body?.bookingId === 'string' ? body.bookingId : '';
		const status = body?.status === 'Confirmed' || body?.status === 'Rejected' ? body.status : null;
		if (!bookingId || !status) {
			return json({ error: 'Invalid booking update.' }, { status: 400 });
		}
		const rejectionReason =
			status === 'Rejected' ? getBookingRejectionReason(body?.rejectionReason) : null;

		if (status === 'Rejected' && !rejectionReason) {
			return json({ error: 'Enter a reason before declining the booking (500 characters maximum).' }, { status: 400 });
		}

		const adminClient = getAdminClient();
		if (!adminClient) return json({ error: 'Server configuration error' }, { status: 500 });

		const { data: booking, error: bookingError } = await adminClient
			.from('bookings')
			.select('id, ride_id, passenger_id, status')
			.eq('id', bookingId)
			.maybeSingle();

		if (bookingError) {
			return json({ error: bookingError.message }, { status: 500 });
		}
		if (!booking) {
			return json({ error: 'Booking not found.' }, { status: 404 });
		}
		if (booking.status !== 'Pending') {
			return json({ error: 'This booking request has already been processed.' }, { status: 409 });
		}

		const { data: ride, error: rideError } = await adminClient
			.from('rides')
			.select('id, driver_id, departure, arrival, ride_date')
			.eq('id', booking.ride_id)
			.maybeSingle();

		if (rideError) {
			return json({ error: rideError.message }, { status: 500 });
		}
		if (!ride) {
			return json({ error: 'Ride not found.' }, { status: 404 });
		}
		if (ride.driver_id !== user.id) {
			return json({ error: 'Only the driver can update this booking.' }, { status: 403 });
		}

		const { data: updatedBooking, error: updateError } = await adminClient
			.from('bookings')
			.update({ status })
			.eq('id', bookingId)
			.eq('status', 'Pending')
			.select('id, status')
			.maybeSingle();

		if (updateError) {
			return json({ error: updateError.message }, { status: 500 });
		}
		if (!updatedBooking) {
			return json({ error: 'This booking request has already been processed.' }, { status: 409 });
		}

		try {
			const [{ data: passengerProfile }, { data: driverProfile }] = await Promise.all([
				adminClient
					.from('profiles')
					.select('email, first_name')
					.eq('id', booking.passenger_id)
					.maybeSingle(),
				adminClient
					.from('profiles')
					.select('first_name, last_name')
					.eq('id', ride.driver_id)
					.maybeSingle()
			]);
			const passengerEmail = (passengerProfile?.email ?? '').trim();
			const rideRoute = `${ride.departure} to ${ride.arrival}`;
			const rideDate = new Date(ride.ride_date).toLocaleString('en-US');

			if (passengerEmail && status === 'Confirmed') {
				const driverName =
					`${driverProfile?.first_name ?? ''} ${driverProfile?.last_name ?? ''}`.trim() || 'Your driver';
				await sendBookingAcceptedEmail({
					to: passengerEmail,
					firstName: passengerProfile?.first_name,
					rideRoute,
					rideDate,
					driverName,
					myBookingsUrl: `${getOrigin()}/dashboard`
				});
			} else if (passengerEmail && status === 'Rejected' && rejectionReason) {
				const searchRidesUrl = new URL('/search', getOrigin());
				searchRidesUrl.searchParams.set('departure', ride.departure);
				searchRidesUrl.searchParams.set('arrival', ride.arrival);

				await sendBookingRejectedEmail({
					to: passengerEmail,
					firstName: passengerProfile?.first_name,
					rideRoute,
					rideDate,
					rejectionReason,
					searchRidesUrl: searchRidesUrl.toString()
				});
			}
		} catch (notifyError) {
			console.error('Booking status email notification failed:', notifyError);
		}

		return json({ success: true, booking: updatedBooking });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};