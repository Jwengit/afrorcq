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

async function isRequesterAdmin(token: string): Promise<boolean> {
	if (!supabaseUrl || !supabaseAnonKey) {
		return false;
	}

	const anonClient = createClient(supabaseUrl, supabaseAnonKey);
	const {
		data: { user },
		error: userError
	} = await anonClient.auth.getUser(token);

	if (userError || !user) {
		return false;
	}

	const isHizliAccount = (user.email ?? '').toLowerCase() === 'hizli.carpooling@gmail.com';
	if (isHizliAccount) {
		return true;
	}

	const { data: profile } = await anonClient
		.from('profiles')
		.select('is_admin')
		.eq('id', user.id)
		.maybeSingle();

	return Boolean(profile?.is_admin);
}

type ReviewStatus = 'pending' | 'approved' | 'rejected';

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		if (!supabaseUrl || !supabaseAnonKey) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const token = getBearerToken(request);
		if (!token) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const adminAllowed = await isRequesterAdmin(token);
		if (!adminAllowed) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey) {
			return json(
				{
					error:
						'SUPABASE_SERVICE_ROLE_KEY is missing. Add it to .env.local then restart the dev server.'
				},
				{ status: 500 }
			);
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);
		const status = (url.searchParams.get('status') ?? '').toLowerCase();

		let query = adminClient
			.from('reviews')
			.select(
				'id, reviewer_id, reviewee_id, ride_id, rating, comment, status, admin_note, reviewed_by, reviewed_at, created_at, updated_at'
			)
			.order('created_at', { ascending: false });

		if (status === 'pending' || status === 'approved' || status === 'rejected') {
			query = query.eq('status', status);
		}

		const { data: reviews, error: reviewsError } = await query;
		if (reviewsError) {
			return json({ error: reviewsError.message }, { status: 500 });
		}

		const reviewerIds = Array.from(
			new Set((reviews ?? []).map((review) => review.reviewer_id).filter(Boolean))
		);
		const revieweeIds = Array.from(
			new Set((reviews ?? []).map((review) => review.reviewee_id).filter(Boolean))
		);
		const rideIds = Array.from(new Set((reviews ?? []).map((review) => review.ride_id).filter(Boolean)));

		const allProfileIds = Array.from(new Set([...reviewerIds, ...revieweeIds]));
		const profileMap: Record<string, { first_name: string | null; last_name: string | null; email: string | null }> = {};
		const rideMap: Record<string, { departure: string | null; arrival: string | null; ride_date: string | null }> = {};

		if (allProfileIds.length > 0) {
			const { data: profilesData, error: profilesError } = await adminClient
				.from('profiles')
				.select('id, first_name, last_name, email')
				.in('id', allProfileIds);

			if (!profilesError && profilesData) {
				for (const profile of profilesData) {
					profileMap[profile.id] = {
						first_name: profile.first_name,
						last_name: profile.last_name,
						email: profile.email
					};
				}
			}
		}

		if (rideIds.length > 0) {
			const { data: ridesData, error: ridesError } = await adminClient
				.from('rides')
				.select('id, departure, arrival, ride_date')
				.in('id', rideIds);

			if (!ridesError && ridesData) {
				for (const ride of ridesData) {
					rideMap[ride.id] = {
						departure: ride.departure,
						arrival: ride.arrival,
						ride_date: ride.ride_date
					};
				}
			}
		}

		const normalizedReviews = (reviews ?? []).map((review) => ({
			...review,
			reviewer_profile: profileMap[review.reviewer_id] ?? null,
			reviewee_profile: profileMap[review.reviewee_id] ?? null,
			ride: rideMap[review.ride_id] ?? null
		}));

		return json({ reviews: normalizedReviews });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async ({ request }) => {
	try {
		if (!supabaseUrl || !supabaseAnonKey) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const token = getBearerToken(request);
		if (!token) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const adminAllowed = await isRequesterAdmin(token);
		if (!adminAllowed) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey) {
			return json(
				{
					error:
						'SUPABASE_SERVICE_ROLE_KEY is missing. Add it to .env.local then restart the dev server.'
				},
				{ status: 500 }
			);
		}

		const body = await request.json();
		const reviewId = body?.reviewId as string | undefined;
		const status = body?.status as ReviewStatus | undefined;
		const note = ((body?.note as string | undefined) ?? '').trim() || null;

		if (!reviewId || !status) {
			return json({ error: 'reviewId and status are required' }, { status: 400 });
		}

		if (!['approved', 'rejected'].includes(status)) {
			return json({ error: 'Invalid moderation status' }, { status: 400 });
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);
		const requesterClient = createClient(supabaseUrl, supabaseAnonKey, {
			global: {
				headers: {
					authorization: `Bearer ${token}`
				}
			}
		});

		const {
			data: { user: requesterUser }
		} = await requesterClient.auth.getUser();

		const { error: updateError } = await adminClient
			.from('reviews')
			.update({
				status,
				admin_note: note,
				reviewed_by: requesterUser?.id ?? null,
				reviewed_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', reviewId);

		if (updateError) {
			return json({ error: updateError.message }, { status: 500 });
		}

		return json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
