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
		const { data: pendingTransaction, error: pendingTransactionError } = await adminClient
			.from('transactions')
			.select('id, booking_id, ride_id, seats_booked, amount, currency, status, paypal_order_id, paypal_capture_id')
			.eq('paypal_order_id', orderId)
			.eq('user_id', userId)
			.maybeSingle();

		if (pendingTransactionError) {
			return json({ error: pendingTransactionError.message }, { status: 500 });
		}

		if (!pendingTransaction) {
			return json({ error: 'Unknown payment order' }, { status: 404 });
		}

		if (pendingTransaction.status === 'succeeded') {
			return json({ success: true, bookingId: pendingTransaction.booking_id, idempotent: true });
		}

		if (pendingTransaction.status !== 'pending') {
			return json({ error: 'Payment order is not capturable' }, { status: 409 });
		}

		if (pendingTransaction.ride_id !== ride.id) {
			return json({ error: 'Order and ride mismatch' }, { status: 409 });
		}

		if (Number(pendingTransaction.seats_booked) !== seats) {
			return json({ error: 'Order and seats mismatch' }, { status: 409 });
		}

		const expectedAmount = Number(amount.toFixed(2));
		const storedAmount = Number(pendingTransaction.amount);
		if (!Number.isFinite(storedAmount) || Math.abs(storedAmount - expectedAmount) > 0.009) {
			return json({ error: 'Order and amount mismatch' }, { status: 409 });
		}

		if (pendingTransaction.currency !== 'USD') {
			return json({ error: 'Unsupported order currency' }, { status: 409 });
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

		const captureStatus = captureData?.status as string | undefined;
		const purchaseUnit = captureData?.purchase_units?.[0];
		const capture = purchaseUnit?.payments?.captures?.[0];
		const capturedAmount = Number(capture?.amount?.value);
		const capturedCurrency = capture?.amount?.currency_code as string | undefined;
		const captureId = capture?.id as string | undefined;

		if (captureStatus !== 'COMPLETED') {
			return json({ error: 'Capture is not completed' }, { status: 409 });
		}

		if (!captureId) {
			return json({ error: 'Missing PayPal capture id' }, { status: 500 });
		}

		if (!Number.isFinite(capturedAmount) || Math.abs(capturedAmount - expectedAmount) > 0.009) {
			return json({ error: 'Captured amount mismatch' }, { status: 409 });
		}

		if (capturedCurrency !== 'USD') {
			return json({ error: 'Captured currency mismatch' }, { status: 409 });
		}

		const customId = purchaseUnit?.custom_id as string | undefined;
		const expectedCustomId = `${ride.id}:${userId}:${seats}`;
		if (customId && customId !== expectedCustomId) {
			return json({ error: 'Capture metadata mismatch' }, { status: 409 });
		}

		const bookingPayload = {
			ride_id: ride.id,
			passenger_id: userId,
			seats_booked: seats,
			status: 'Pending'
		};

		const bookingInsert = await adminClient.from('bookings').insert(bookingPayload).select().maybeSingle();
		if (bookingInsert.error || !bookingInsert.data) {
			await adminClient
				.from('transactions')
				.update({
					status: 'failed',
					paypal_capture_id: captureId,
					raw_provider_payload: captureData,
					updated_at: new Date().toISOString()
				})
				.eq('id', pendingTransaction.id);

			return json({ error: 'Payment captured but booking creation failed. Please contact support.' }, { status: 500 });
		}

		const transactionUpdate = await adminClient
			.from('transactions')
			.update({
				booking_id: bookingInsert.data.id,
				status: 'succeeded',
				paypal_capture_id: captureId,
				raw_provider_payload: captureData,
				updated_at: new Date().toISOString()
			})
			.eq('id', pendingTransaction.id);

		if (transactionUpdate.error) {
			return json({ error: transactionUpdate.error.message }, { status: 500 });
		}

		return json({ success: true, booking: bookingInsert.data, capture: captureData });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
