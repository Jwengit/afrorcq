import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

function getBearerToken(request: Request): string | null {
	const authHeader = request.headers.get('authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}
	return authHeader.slice(7);
}

function paypalBaseUrl() {
	return env.PAYPAL_MODE === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
}

async function getPayPalAccessToken(): Promise<string | null> {
	const clientId = env.PAYPAL_CLIENT_ID;
	const clientSecret = env.PAYPAL_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		return null;
	}

	const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: 'grant_type=client_credentials'
	});

	if (!response.ok) {
		return null;
	}

	const data = await response.json();
	return data.access_token ?? null;
}

async function getAuthenticatedUserId(request: Request): Promise<string | null> {
	if (!supabaseUrl || !supabaseAnonKey) {
		return null;
	}

	const token = getBearerToken(request);
	if (!token) {
		return null;
	}

	const client = createClient(supabaseUrl, supabaseAnonKey);
	const {
		data: { user },
		error
	} = await client.auth.getUser(token);

	if (error || !user) {
		return null;
	}

	return user.id;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		if (!supabaseUrl || !supabaseAnonKey) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const token = getBearerToken(request);
		if (!token) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const userId = await getAuthenticatedUserId(request);
		if (!userId) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json();
		const orderId = body?.orderId as string | undefined;
		const rideId = body?.rideId as string | undefined;
		const seats = Number(body?.seats ?? 1);

		if (!orderId || !rideId || !Number.isInteger(seats) || seats < 1) {
			return json({ error: 'orderId, rideId and seats are required' }, { status: 400 });
		}

		const anonClient = createClient(supabaseUrl, supabaseAnonKey);
		const { data: ride, error: rideError } = await anonClient.from('rides').select('id, seats, price').eq('id', rideId).maybeSingle();

		if (rideError || !ride) {
			return json({ error: 'Ride not found' }, { status: 404 });
		}

		if (seats > ride.seats) {
			return json({ error: 'Not enough seats available' }, { status: 400 });
		}

		const amount = Number(ride.price) * seats;
		if (Number.isNaN(amount) || amount <= 0) {
			return json({ error: 'Invalid amount' }, { status: 400 });
		}

		const accessToken = await getPayPalAccessToken();
		if (!accessToken) {
			return json({ error: 'Could not connect to PayPal' }, { status: 500 });
		}

		const captureResponse = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${orderId}/capture`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			}
		});

		const captureData = await captureResponse.json();
		if (!captureResponse.ok) {
			return json({ error: captureData?.message || 'Unable to capture PayPal order' }, { status: 500 });
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
		const bookingPayload = {
			ride_id: ride.id,
			passenger_id: userId,
			seats_booked: seats,
			status: 'Pending'
		};

		const bookingInsert = await adminClient.from('bookings').insert(bookingPayload).select().maybeSingle();
		if (bookingInsert.error || !bookingInsert.data) {
			return json({ error: bookingInsert.error?.message || 'Unable to create booking' }, { status: 500 });
		}

		const transactionPayload = {
			booking_id: bookingInsert.data.id,
			user_id: userId,
			amount,
			status: 'succeeded',
			currency: 'USD'
		};

		const transactionInsert = await adminClient.from('transactions').insert(transactionPayload);
		if (transactionInsert.error) {
			return json({ error: transactionInsert.error.message }, { status: 500 });
		}

		return json({ success: true, booking: bookingInsert.data, capture: captureData });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
