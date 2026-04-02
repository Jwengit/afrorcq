import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';

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

		const { error } = await supabase
			.from('payments')
			.update({ status: 'cancelled' })
			.eq('provider_order_id', orderId)
			.eq('passenger_id', user.id)
			.eq('status', 'created');

		if (error) {
			return json({ error: error.message }, { status: 400 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('Cancel payment error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Payment cancel failed.' },
			{ status: 500 }
		);
	}
};