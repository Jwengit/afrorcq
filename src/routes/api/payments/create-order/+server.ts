import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { createPaypalOrder } from '$lib/server/paypal';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

function getAuthedClient(token: string) {
	return createClient(supabaseUrl, supabaseKey, {
		global: {
			headers: {
				authorization: `Bearer ${token}`
			}
		}
	});
}

export const POST: RequestHandler = async ({ request, url }) => {
	try {
		if (!supabaseUrl || !supabaseKey) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const authHeader = request.headers.get('authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const token = authHeader.slice(7);
		const supabase = getAuthedClient(token);

		const {
			data: { user },
			error: userError
		} = await supabase.auth.getUser();

		if (userError || !user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = (await request.json()) as {
			ride_id?: string;
			seats_booked?: number;
			payment_method?: 'paypal' | 'venmo';
		};

		const rideId = body.ride_id || '';
		const seatsBooked = Number(body.seats_booked || 0);
		const paymentMethod = body.payment_method === 'venmo' ? 'venmo' : 'paypal';

		if (!rideId || !Number.isInteger(seatsBooked) || seatsBooked <= 0) {
			return json({ error: 'Invalid payment request.' }, { status: 400 });
		}

		const { data: ride, error: rideError } = await supabase
			.from('rides')
			.select('id, seats, price, driver_id')
			.eq('id', rideId)
			.maybeSingle();

		if (rideError || !ride) {
			return json({ error: 'Ride not found.' }, { status: 404 });
		}

		if (ride.driver_id === user.id) {
			return json({ error: 'You cannot book your own ride.' }, { status: 400 });
		}

		if (seatsBooked > ride.seats) {
			return json({ error: 'Not enough seats available.' }, { status: 409 });
		}

		const amountValue = Number(ride.price) * seatsBooked;
		const amount = amountValue.toFixed(2);

		const returnUrl = `${url.origin}/ride/${encodeURIComponent(rideId)}?payment=success`;
		const cancelUrl = `${url.origin}/ride/${encodeURIComponent(rideId)}?payment=cancelled`;

		const order = await createPaypalOrder({
			amount,
			currency: 'USD',
			rideId,
			passengerId: user.id,
			seatsBooked,
			paymentMethod,
			returnUrl,
			cancelUrl
		});

		const approvalUrl = order.links?.find((link) => link.rel === 'approve')?.href;
		if (!approvalUrl) {
			return json({ error: 'Missing PayPal approval URL.' }, { status: 500 });
		}

		const { error: paymentInsertError } = await supabase.from('payments').insert({
			ride_id: rideId,
			passenger_id: user.id,
			provider: 'paypal',
			payment_method: paymentMethod,
			provider_order_id: order.id,
			currency: 'USD',
			amount,
			seats_booked: seatsBooked,
			status: 'created',
			raw_provider_response: order
		});

		if (paymentInsertError) {
			return json({ error: paymentInsertError.message }, { status: 400 });
		}

		return json({
			order_id: order.id,
			approval_url: approvalUrl
		});
	} catch (error) {
		console.error('Create payment order error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Payment initialization failed.' },
			{ status: 500 }
		);
	}
};