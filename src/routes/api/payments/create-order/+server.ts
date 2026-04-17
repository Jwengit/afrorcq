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

async function isAuthenticatedUser(request: Request): Promise<boolean> {
	if (!supabaseUrl || !supabaseAnonKey) {
		return false;
	}

	const token = getBearerToken(request);
	if (!token) {
		return false;
	}

	const client = createClient(supabaseUrl, supabaseAnonKey);
	const {
		data: { user },
		error
	} = await client.auth.getUser(token);

	return Boolean(user && !error);
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

		if (!(await isAuthenticatedUser(request))) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json();
		const rideId = body?.rideId as string | undefined;
		const seats = Number(body?.seats ?? 1);

		if (!rideId || !Number.isInteger(seats) || seats < 1) {
			return json({ error: 'rideId and seats are required' }, { status: 400 });
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

		const orderResponse = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				intent: 'CAPTURE',
				purchase_units: [
					{
						amount: {
							currency_code: 'USD',
							value: amount.toFixed(2)
						}
					}
				],
				application_context: {
					brand_name: 'AfroRCQ',
					user_action: 'PAY_NOW',
					shipping_preference: 'NO_SHIPPING'
				}
			})
		});

		const orderData = await orderResponse.json();
		if (!orderResponse.ok) {
			return json({ error: orderData?.message || 'Unable to create PayPal order' }, { status: 500 });
		}

		return json({ orderId: orderData.id });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
