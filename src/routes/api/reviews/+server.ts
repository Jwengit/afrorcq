import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

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

const body = await request.json();
const { reviewee_id, ride_id, rating, comment } = body;

if (!reviewee_id || !ride_id || !rating) {
return json({ error: 'Missing required fields' }, { status: 400 });
}
if (reviewee_id === user.id) {
return json({ error: 'You cannot review yourself' }, { status: 400 });
}
if (typeof rating !== 'number' || rating < 1 || rating > 5) {
return json({ error: 'Rating must be between 1 and 5' }, { status: 400 });
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
.select('id')
.eq('ride_id', ride_id)
.eq('reviewer_id', user.id)
.maybeSingle();

if (existingError && existingError.code !== 'PGRST116') {
return json({ error: existingError.message }, { status: 400 });
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
comment: (comment || '').trim() || null
})
.select('id,rating,comment,created_at,reviewer_id,reviewee_id,ride_id')
.single();

if (insertError) {
return json({ error: insertError.message }, { status: 400 });
}

return json(inserted);
};

export const GET: RequestHandler = async ({ url }) => {
if (!supabaseUrl || !supabaseKey) {
return json({ error: 'Server configuration error' }, { status: 500 });
}

const userId = url.searchParams.get('user_id');
if (!userId) {
return json({ error: 'Missing user_id parameter' }, { status: 400 });
}

const client = createClient(supabaseUrl, supabaseKey);
const { data: reviews, error } = await client
.from('reviews')
.select(
'id,rating,comment,created_at,reviewer_id,ride_id,reviewer:profiles!reviews_reviewer_id_fkey(id,first_name,last_name,profile_photo_url)'
)
.eq('reviewee_id', userId)
.order('created_at', { ascending: false });

if (error) {
return json({ error: error.message }, { status: 400 });
}

type ReviewRow = {
	id: string;
	rating: number;
	comment: string | null;
	created_at: string;
	reviewer_id: string;
	ride_id: string;
	reviewer:
		| {
		id: string;
		first_name: string | null;
		last_name: string | null;
		profile_photo_url: string | null;
	  }
		| Array<{
			id: string;
			first_name: string | null;
			last_name: string | null;
			profile_photo_url: string | null;
	  }>
		| null;
};

const mapped = ((reviews || []) as ReviewRow[]).map((item) => ({
id: item.id,
rating: item.rating,
comment: item.comment,
created_at: item.created_at,
reviewer_id: item.reviewer_id,
ride_id: item.ride_id,
	profiles: Array.isArray(item.reviewer) ? item.reviewer[0] ?? null : item.reviewer
}));

return json(mapped);
};
