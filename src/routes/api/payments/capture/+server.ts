import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { capturePaypalOrder } from '$lib/server/paypal';

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

export const POST: RequestHandler = async ({ request }) => {
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

		const body = (await request.json()) as { order_id?: string };
		const orderId = body.order_id || '';

		if (!orderId) {
			return json({ error: 'Missing order_id' }, { status: 400 });
		}

		const { data: payment, error: paymentError } = await supabase
			.from('payments')
			.select('id, ride_id, passenger_id, seats_booked, status, provider_order_id')
			.eq('provider_order_id', orderId)
			.eq('passenger_id', user.id)
			.maybeSingle();

		if (paymentError) {
			return json({ error: paymentError.message }, { status: 400 });
		}

		if (!payment) {
			return json({ error: 'Payment not found.' }, { status: 404 });
		}

		if (payment.status === 'captured' || payment.status === 'released') {
			return json({ success: true, message: 'Payment already captured.' });
		}

		if (payment.status !== 'created') {
			return json({ error: 'Payment is not in a capturable state.' }, { status: 409 });
		}

		const capture = await capturePaypalOrder(orderId);

		const captureRecord = capture.purchase_units?.[0]?.payments?.captures?.[0];
		if (!captureRecord || captureRecord.status !== 'COMPLETED') {
			await supabase
				.from('payments')
				.update({
					status: 'failed',
					raw_provider_response: capture
				})
				.eq('id', payment.id);

			return json({ error: 'Capture failed on PayPal.' }, { status: 400 });
		}

		const { data: booking, error: bookingError } = await supabase
			.from('bookings')
			.insert({
				ride_id: payment.ride_id,
				passenger_id: user.id,
				seats_booked: payment.seats_booked,
				status: 'Pending'
			})
			.select('id')
			.single();

		if (bookingError || !booking) {
			await supabase
				.from('payments')
				.update({
					status: 'captured_issue',
					provider_capture_id: captureRecord.id,
					raw_provider_response: capture
				})
				.eq('id', payment.id);

			return json(
				{
					error:
						bookingError?.message ||
						'Payment captured but booking could not be created. Please contact support.'
				},
				{ status: 409 }
			);
		}

		const { error: updateError } = await supabase
			.from('payments')
			.update({
				booking_id: booking.id,
				provider_capture_id: captureRecord.id,
				status: 'captured',
				release_requested_at: null,
				released_at: null,
				raw_provider_response: capture
			})
			.eq('id', payment.id);

		if (updateError) {
			return json({ error: updateError.message }, { status: 400 });
		}

		return json({
			success: true,
			booking_id: booking.id,
			payment_status: 'captured'
		});
	} catch (error) {
		console.error('Capture payment error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Payment capture failed.' },
			{ status: 500 }
		);
	}
};