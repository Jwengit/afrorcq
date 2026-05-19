import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

function getBearerToken(request: Request): string | null {
	const authHeader = request.headers.get('authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}
	return authHeader.slice(7);
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

	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!serviceRoleKey) {
		return json({ error: 'Server configuration error' }, { status: 500 });
	}

	const token = getBearerToken(request);
	if (!token) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Use service role client to verify the JWT — avoids anon-key permission issues
	const adminClient = createClient(supabaseUrl, serviceRoleKey);
	const {
		data: { user },
		error: userError
	} = await adminClient.auth.getUser(token);

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

		const { data: ride, error: rideError } = await adminClient
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

	const profileIdsToCheck = Array.from(
		new Set([user.id, targetUserId].filter((id): id is string => Boolean(id)))
	);

	let existingProfileIds = new Set<string>();
	if (profileIdsToCheck.length > 0) {
		const { data: profileRows } = await adminClient
			.from('profiles')
			.select('id')
			.in('id', profileIdsToCheck);

		existingProfileIds = new Set((profileRows ?? []).map((row) => row.id));
	}

	const insertPayload = {
		reporter_id: existingProfileIds.has(user.id) ? user.id : null,
		user_id: targetUserId && existingProfileIds.has(targetUserId) ? targetUserId : null,
		ride_id: targetRideId,
		type: targetType,
		description
	};

	const { data: insertedRows, error: insertError } = await adminClient
		.from('reports')
		.insert(insertPayload)
		.select('id')
		.limit(1);
	if (insertError) {
		console.error('[REPORTS_POST] Insert error:', insertError);
		const isConstraintViolation =
			insertError.code === '23514' ||
			insertError.code === '23502' ||
			insertError.code === '22P02' ||
			/constraint/i.test(insertError.message ?? '');

		if (isConstraintViolation) {
			return json(
				{ error: 'Reports table configuration error. Please contact support.' },
				{ status: 500 }
			);
		}

		return json({ error: insertError.message }, { status: 400 });
	}

	const reportId = insertedRows?.[0]?.id ?? null;
	if (!reportId) {
		console.error('[REPORTS_POST] Insert returned no id:', { insertPayload, insertedRows });
		return json(
			{ error: 'Report creation returned no id. Please try again.' },
			{ status: 500 }
		);
	}

	const { data: persistedRow, error: verifyError } = await adminClient
		.from('reports')
		.select('id')
		.eq('id', reportId)
		.maybeSingle();

	if (verifyError || !persistedRow) {
		console.error('[REPORTS_POST] Insert verification failed:', { verifyError, reportId, insertPayload });
		return json(
			{ error: 'Report was not persisted. Please try again.' },
			{ status: 500 }
		);
	}

	console.log('[REPORTS_POST] Report created successfully:', { reportId, insertPayload });

	return json({ success: true, reportId });
};
