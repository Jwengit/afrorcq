import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const fallbackPublicClientId = import.meta.env.VITE_PUBLIC_PAYPAL_CLIENT_ID || '';

export const GET: RequestHandler = async () => {
	const mode = env.PAYPAL_MODE === 'sandbox' ? 'sandbox' : 'live';
	const clientId = env.PAYPAL_CLIENT_ID || fallbackPublicClientId;
	const clientSecret = env.PAYPAL_CLIENT_SECRET || '';

	if (!clientId || !clientSecret) {
		return json(
			{
				error:
					'PayPal is not fully configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET for live payments.'
			},
			{ status: 500 }
		);
	}

	return json({
		mode,
		clientId
	});
};
