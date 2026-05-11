import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const fallbackPublicClientId = import.meta.env.VITE_PUBLIC_PAYPAL_CLIENT_ID || '';

export const GET: RequestHandler = async () => {
	const mode = env.PAYPAL_MODE === 'sandbox' ? 'sandbox' : 'live';
	const clientId = env.PAYPAL_CLIENT_ID || fallbackPublicClientId;

	if (!clientId) {
		return json(
			{
				error:
					'PayPal is not configured. Set PAYPAL_CLIENT_ID (recommended) or VITE_PUBLIC_PAYPAL_CLIENT_ID.'
			},
			{ status: 500 }
		);
	}

	return json({
		mode,
		clientId
	});
};
