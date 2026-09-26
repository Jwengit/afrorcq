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

export const GET: RequestHandler = async ({ request }) => {
	try {
		if (!supabaseUrl || !supabaseAnonKey) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const token = getBearerToken(request);
		if (!token) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const anonClient = createClient(supabaseUrl, supabaseAnonKey);
		const {
			data: { user },
			error: userError
		} = await anonClient.auth.getUser(token);

		if (userError || !user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey) {
			return json(
				{
					error:
						'SUPABASE_SERVICE_ROLE_KEY is missing. Set it in your environment (.env.local for local dev, or Vercel Project Settings > Environment Variables for deployment) and redeploy/restart.'
				},
				{ status: 500 }
			);
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);

		// On ne prend que les reviews où CET utilisateur est le receveur (reviewee_id)
		// et seulement celles déjà approuvées par l'admin
		const { data: reviews, error: reviewsError } = await adminClient
			.from('reviews')
			.select('id, reviewer_id, rating, comment, status, created_at, ride_id')
			.eq('reviewee_id', user.id)
			.eq('status', 'approved')
			.order('created_at', { ascending: false });

		if (reviewsError) {
			return json({ error: reviewsError.message }, { status: 500 });
		}

		const reviewerIds = Array.from(
			new Set((reviews ?? []).map((review) => review.reviewer_id).filter(Boolean))
		);
		const rideIds = Array.from(
			new Set((reviews ?? []).map((review) => review.ride_id).filter(Boolean))
		);

		const profileMap: Record<string, { first_name: string | null; last_name: string | null }> = {};
		const rideMap: Record<string, { departure: string | null; arrival: string | null; ride_date: string | null }> = {};

		if (reviewerIds.length > 0) {
			const { data: profilesData } = await adminClient
				.from('profiles')
				.select('id, first_name, last_name')
				.in('id', reviewerIds);

			for (const profile of profilesData ?? []) {
				profileMap[profile.id] = {
					first_name: profile.first_name,
					last_name: profile.last_name
				};
			}
		}

		if (rideIds.length > 0) {
			const { data: ridesData } = await adminClient
				.from('rides')
				.select('id, departure, arrival, ride_date')
				.in('id', rideIds);

			for (const ride of ridesData ?? []) {
				rideMap[ride.id] = {
					departure: ride.departure,
					arrival: ride.arrival,
					ride_date: ride.ride_date
				};
			}
		}

		const normalizedReviews = (reviews ?? []).map((review) => ({
			id: review.id,
			rating: review.rating,
			comment: review.comment,
			created_at: review.created_at,
			reviewer_profile: profileMap[review.reviewer_id] ?? null,
			ride: rideMap[review.ride_id] ?? null
		}));

		return json({ reviews: normalizedReviews });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};