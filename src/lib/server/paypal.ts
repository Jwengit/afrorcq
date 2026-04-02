import { env } from '$env/dynamic/private';

type PaymentMethod = 'paypal' | 'venmo';

const PAYPAL_BASE_URL = env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

function getPaypalCredentials() {
	const clientId = env.PAYPAL_CLIENT_ID;
	const secret = env.PAYPAL_CLIENT_SECRET;

	if (!clientId || !secret) {
		throw new Error('Missing PayPal credentials. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.');
	}

	return { clientId, secret };
}

async function getAccessToken(): Promise<string> {
	const { clientId, secret } = getPaypalCredentials();
	const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');

	const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${auth}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: 'grant_type=client_credentials'
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Failed to get PayPal access token: ${errorText}`);
	}

	const data = (await response.json()) as { access_token?: string };
	if (!data.access_token) {
		throw new Error('PayPal access token missing in response.');
	}

	return data.access_token;
}

export async function createPaypalOrder(params: {
	amount: string;
	currency: string;
	rideId: string;
	passengerId: string;
	seatsBooked: number;
	paymentMethod: PaymentMethod;
	returnUrl: string;
	cancelUrl: string;
}) {
	const accessToken = await getAccessToken();

	const payload = {
		intent: 'CAPTURE',
		purchase_units: [
			{
				reference_id: params.rideId,
				custom_id: JSON.stringify({
					ride_id: params.rideId,
					passenger_id: params.passengerId,
					seats_booked: params.seatsBooked
				}),
				amount: {
					currency_code: params.currency,
					value: params.amount
				}
			}
		],
		application_context: {
			return_url: params.returnUrl,
			cancel_url: params.cancelUrl,
			user_action: 'PAY_NOW',
			shipping_preference: 'NO_SHIPPING'
		},
		payment_source:
			params.paymentMethod === 'venmo'
				? {
					venmo: {
						experience_context: {
							return_url: params.returnUrl,
							cancel_url: params.cancelUrl
						}
					}
				}
				: undefined
	};

	const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(payload)
	});

	const data = (await response.json()) as {
		id?: string;
		status?: string;
		links?: Array<{ href: string; rel: string; method: string }>;
	};

	if (!response.ok || !data.id) {
		throw new Error(`Failed to create PayPal order: ${JSON.stringify(data)}`);
	}

	return data;
}

export async function capturePaypalOrder(orderId: string) {
	const accessToken = await getAccessToken();

	const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		}
	});

	const data = (await response.json()) as {
		id?: string;
		status?: string;
		purchase_units?: Array<{
			payments?: {
				captures?: Array<{
					id: string;
					status: string;
				}>;
			};
		}>;
	};

	if (!response.ok) {
		throw new Error(`Failed to capture PayPal order: ${JSON.stringify(data)}`);
	}

	return data;
}