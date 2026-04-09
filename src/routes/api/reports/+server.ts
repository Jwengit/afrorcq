import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

function getBearerToken(request: Request): string | null {
	const authHeader = request.headers.get('authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}
	return authHeader.slice(7);
}

function getAuthedClient(token: string) {
	return createClient(supabaseUrl, supabaseKey, {
		global: {
			headers: {
				authorization: `Bearer ${token}`
			}
		}
	});
}

type ReportPayload = {
	targetType?: 'user' | 'ride';
	targetUserId?: string;
	targetRideId?: string;
	description?: string;
};

export const POST: RequestHandler = async ({ request }) => {
	if (!supabaseUrl || !supabaseKey) {
		return json({ error: 'Server configuration error' }, { status: 500 });
	}

	const token = getBearerToken(request);
	if (!token) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const supabase = getAuthedClient(token);
	const {
		data: { user },
		error: userError
	} = await supabase.auth.getUser();

	if (userError || !user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = (await request.json()) as ReportPayload;
	const description = (body?.description ?? '').trim();
	const targetType = body?.targetType;

	if (!targetType || (targetType !== 'user' && targetType !== 'ride')) {
		return json({ error: 'Invalid report target type' }, { status: 400 });
	}

	if (!description) {
		return json({ error: 'Description is required' }, { status: 400 });
	}

	if (description.length > 2000) {
		return json({ error: 'Description is too long (max 2000 characters)' }, { status: 400 });
	}

	let targetUserId: string | null = null;
	let targetRideId: string | null = null;

	if (targetType === 'user') {
		targetUserId = (body?.targetUserId ?? '').trim() || null;
		if (!targetUserId) {
			return json({ error: 'targetUserId is required for user reports' }, { status: 400 });
		}
		if (targetUserId === user.id) {
			return json({ error: 'You cannot report yourself' }, { status: 400 });
		}
	} else {
		targetRideId = (body?.targetRideId ?? '').trim() || null;
		if (!targetRideId) {
			return json({ error: 'targetRideId is required for ride reports' }, { status: 400 });
		}

		const { data: ride, error: rideError } = await supabase
			.from('rides')
			.select('id, driver_id')
			.eq('id', targetRideId)
			.maybeSingle();

		if (rideError || !ride) {
			return json({ error: 'Ride not found' }, { status: 404 });
		}

		if (ride.driver_id === user.id) {
			return json({ error: 'You cannot report your own ride' }, { status: 400 });
		}

		targetUserId = ride.driver_id ?? null;
	}

	const insertPayload = {
		reporter_id: user.id,
		user_id: targetUserId,
		ride_id: targetRideId,
		type: targetType,
		description,
		status: 'pending'
	};

	const { error: insertError } = await supabase.from('reports').insert(insertPayload);
	if (insertError) {
		return json({ error: insertError.message }, { status: 400 });
	}

	return json({ success: true });
};
