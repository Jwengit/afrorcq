import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { resolveMemberStatus, canUseVerifiedFeatures } from '$lib/membershipAccess';
import { sendAdminTaskAlertEmail } from '$lib/email';

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

function getTokenFromRequest(request: Request): string | null {
const authHeader = request.headers.get('authorization');
if (!authHeader || !authHeader.startsWith('Bearer ')) {
return null;
}
return authHeader.slice(7).trim();
}

async function getUserMemberStatus(client: any, userId: string) {
const { data: profile } = await client
.from('profiles')
.select('status, is_verified, membership_paid, membership_expires_at')
.eq('id', userId)
.maybeSingle();

const typedProfile = (profile as
	| {
			status?: string | null;
			is_verified?: boolean | null;
			membership_paid?: boolean | null;
			membership_expires_at?: string | null;
	  }
	| null) ?? null;

return resolveMemberStatus({
status: typedProfile?.status,
isVerified: typedProfile?.is_verified,
membershipPaid: typedProfile?.membership_paid,
membershipExpiresAt: typedProfile?.membership_expires_at
});
}

export const POST: RequestHandler = async ({ request }) => {
if (!supabaseUrl || !supabaseKey) {
return json({ error: 'Server configuration error' }, { status: 500 });
}

const token = getTokenFromRequest(request);
if (!token) {
return json({ error: 'Unauthorized' }, { status: 401 });
}

const authClient = createClient(supabaseUrl, supabaseKey);
const {
data: { user },
error: userError
} = await authClient.auth.getUser(token);

if (userError || !user) {
return json({ error: 'Unauthorized' }, { status: 401 });
}

const supabase = getAuthedClient(token);

const requesterStatus = await getUserMemberStatus(supabase, user.id);
if (!canUseVerifiedFeatures(requesterStatus)) {
return json(
{ error: 'This feature is available for verified members only. Upgrade your plan to unlock full access.' },
{ status: 403 }
);
}

const body = await request.json();
const { reviewee_id, ride_id, rating, comment, transaction_confirmed, safe_trip_confirmed } = body;
const normalizedComment = typeof comment === 'string' ? comment.trim() : '';

if (!reviewee_id || !ride_id || !rating) {
return json({ error: 'Missing required fields' }, { status: 400 });
}
if (reviewee_id === user.id) {
return json({ error: 'You cannot review yourself' }, { status: 400 });
}
if (typeof rating !== 'number' || rating < 1 || rating > 5) {
return json({ error: 'Rating must be between 1 and 5' }, { status: 400 });
}
if (!normalizedComment) {
return json({ error: 'Comment is required' }, { status: 400 });
}
if (typeof transaction_confirmed !== 'boolean' || typeof safe_trip_confirmed !== 'boolean') {
return json({ error: 'Trip confirmations must be provided' }, { status: 400 });
}

const { data: ride, error: rideError } = await supabase
.from('rides')
.select('id,driver_id,ride_date')
.eq('id', ride_id)
.maybeSingle();

if (rideError || !ride) {
return json({ error: 'Ride not found' }, { status: 404 });
}

if (new Date(ride.ride_date).getTime() > Date.now()) {
return json({ error: 'Reviews can only be posted after the ride' }, { status: 400 });
}

let allowedRevieweeIds: string[] = [];
if (user.id === ride.driver_id) {
const { data: rows, error } = await supabase
.from('bookings')
.select('passenger_id,status')
.eq('ride_id', ride.id)
.eq('status', 'Confirmed');
if (error) {
return json({ error: error.message }, { status: 400 });
}
allowedRevieweeIds = (rows || []).map((r) => r.passenger_id);
} else {
const { data: booking, error } = await supabase
.from('bookings')
.select('id,status')
.eq('ride_id', ride.id)
.eq('passenger_id', user.id)
.eq('status', 'Confirmed')
.maybeSingle();
if (error) {
return json({ error: error.message }, { status: 400 });
}
if (!booking) {
return json({ error: 'You were not a confirmed participant of this ride' }, { status: 403 });
}
allowedRevieweeIds = [ride.driver_id];
}

if (!allowedRevieweeIds.includes(reviewee_id)) {
return json({ error: 'Invalid review target for this ride' }, { status: 403 });
}

const { data: existingReview, error: existingError } = await supabase
.from('reviews')
.select('id,reviewee_id,status')
.eq('ride_id', ride_id)
.eq('reviewer_id', user.id)
.maybeSingle();

if (existingError && existingError.code !== 'PGRST116') {
return json({ error: existingError.message }, { status: 400 });
}
if (existingReview?.status === 'rejected') {
if (existingReview.reviewee_id !== reviewee_id) {
return json({ error: 'The rejected review target does not match this ride participant' }, { status: 403 });
}

const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
return json({ error: 'Server configuration error' }, { status: 500 });
}

const adminClient = createClient(supabaseUrl, serviceRoleKey);
const { data: updated, error: updateError } = await adminClient
.from('reviews')
.update({
rating,
comment: normalizedComment,
transaction_confirmed,
safe_trip_confirmed,
status: 'pending',
admin_note: null,
reviewed_by: null,
reviewed_at: null,
updated_at: new Date().toISOString()
})
.eq('id', existingReview.id)
.eq('reviewer_id', user.id)
.eq('status', 'rejected')
.select('id,rating,comment,transaction_confirmed,safe_trip_confirmed,status,created_at,reviewer_id,reviewee_id,ride_id')
.maybeSingle();

if (updateError) {
return json({ error: updateError.message }, { status: 400 });
}
if (!updated) {
return json({ error: 'This review is no longer available to resubmit' }, { status: 409 });
}

await sendAdminTaskAlertEmail();
return json(updated);
}
if (existingReview) {
return json({ error: 'You already reviewed this ride' }, { status: 409 });
}

const { data: inserted, error: insertError } = await supabase
.from('reviews')
.insert({
reviewer_id: user.id,
reviewee_id,
ride_id,
rating,
comment: normalizedComment,
transaction_confirmed,
safe_trip_confirmed,
status: 'pending'
})
.select('id,rating,comment,transaction_confirmed,safe_trip_confirmed,status,created_at,reviewer_id,reviewee_id,ride_id')
.single();

if (insertError) {
return json({ error: insertError.message }, { status: 400 });
}

await sendAdminTaskAlertEmail();
return json(inserted);
};

export const GET: RequestHandler = async ({ request, url }) => {
if (!supabaseUrl || !supabaseKey) {
return json({ error: 'Server configuration error' }, { status: 500 });
}

const rideId = url.searchParams.get('ride_id');
if (rideId) {
const token = getTokenFromRequest(request);
if (!token) {
return json({ error: 'Unauthorized' }, { status: 401 });
}

const authClient = createClient(supabaseUrl, supabaseKey);
const {
data: { user },
error: userError
} = await authClient.auth.getUser(token);
if (userError || !user) {
return json({ error: 'Unauthorized' }, { status: 401 });
}

const { data: ownReviews, error: ownReviewsError } = await getAuthedClient(token)
.from('reviews')
.select('id,rating,comment,transaction_confirmed,safe_trip_confirmed,status,admin_note,reviewer_id,ride_id')
.eq('reviewer_id', user.id)
.eq('ride_id', rideId);

if (ownReviewsError) {
return json({ error: ownReviewsError.message }, { status: 400 });
}
return json(ownReviews ?? []);
}

const userId = url.searchParams.get('user_id');
if (!userId) {
return json({ error: 'Missing user_id parameter' }, { status: 400 });
}

const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
return json({ error: 'Review service is not configured.' }, { status: 500 });
}
const client = createClient(supabaseUrl, serviceRoleKey);

const { data: reviews, error } = await client
.from('reviews')
.select(
'id,rating,comment,transaction_confirmed,safe_trip_confirmed,status,created_at,reviewer_id,ride_id'
)
.eq('reviewee_id', userId)
.eq('status', 'approved')
.order('created_at', { ascending: false });

if (error) {
return json({ error: error.message }, { status: 400 });
}

type ReviewRow = {
	id: string;
	rating: number;
	comment: string | null;
	transaction_confirmed: boolean;
	safe_trip_confirmed: boolean;
	status: 'pending' | 'approved' | 'rejected';
	created_at: string;
	reviewer_id: string;
	ride_id: string;
};

type ReviewerProfile = {
	id: string;
	first_name: string | null;
	last_name: string | null;
	profile_photo_url: string | null;
	is_verified: boolean | null;
};

const reviewerIds = Array.from(
	new Set(((reviews || []) as ReviewRow[]).map((item) => item.reviewer_id).filter(Boolean))
);

const profileMap: Record<string, ReviewerProfile> = {};
if (reviewerIds.length > 0) {
	const { data: profileRows, error: profileError } = await client
		.from('profiles')
		.select('id,first_name,last_name,profile_photo_url,is_verified')
		.in('id', reviewerIds);

	if (profileError) {
		return json({ error: profileError.message }, { status: 500 });
	}

	for (const profile of (profileRows || []) as ReviewerProfile[]) {
		profileMap[profile.id] = profile;
	}
}

const mapped = ((reviews || []) as ReviewRow[]).map((item) => ({
id: item.id,
rating: item.rating,
comment: item.comment,
transaction_confirmed: item.transaction_confirmed,
safe_trip_confirmed: item.safe_trip_confirmed,
status: item.status,
created_at: item.created_at,
reviewer_id: item.reviewer_id,
ride_id: item.ride_id,
	profiles: profileMap[item.reviewer_id] ?? null
}));

return json(mapped);
};
