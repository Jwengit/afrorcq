<script lang="ts">
import { supabase } from '$lib/supabaseClient';
import type { User } from '@supabase/supabase-js';

export let rideId: string;
export let revieweeId: string;
export let revieweeName = '';
export let user: User | null = null;
export let accessToken: string | null = null;
export let onSuccess: (() => void) | undefined = undefined;

let rating = 5;
let comment = '';
let transactionConfirmed = false;
let safeTripConfirmed = false;
let loading = false;
let error: string | null = null;
let existingReviewStatus: 'pending' | 'approved' | 'rejected' | null = null;
let rejectionNote = '';
let wasResubmitted = false;

$: if (user && rideId && revieweeId) {
void checkExistingReview();
}

async function checkExistingReview() {
const {
data: { session }
} = await supabase.auth.getSession();

const response = await fetch(`/api/reviews?ride_id=${encodeURIComponent(rideId)}`, {
headers: session?.access_token
? {
Authorization: `Bearer ${session.access_token}`
}
: undefined
});
if (!response.ok) {
error = 'Unable to check the status of your review. Please refresh the page.';
return;
}
const reviews = (await response.json()) as Array<{
rating: number;
comment: string | null;
transaction_confirmed: boolean;
safe_trip_confirmed: boolean;
status: 'pending' | 'approved' | 'rejected';
admin_note: string | null;
}>;
const existingReview = reviews[0];
existingReviewStatus = existingReview?.status ?? null;
rejectionNote = existingReview?.admin_note ?? '';
if (existingReview?.status === 'rejected') {
rating = existingReview.rating;
comment = existingReview.comment ?? '';
transactionConfirmed = existingReview.transaction_confirmed ?? false;
safeTripConfirmed = existingReview.safe_trip_confirmed ?? false;
}
}

async function submitReview() {
if (!user) {
error = 'You must be logged in to submit a review';
return;
}

const commentTrimmed = (comment || '').trim();
if (!commentTrimmed) {
error = 'Please provide feedback in your review';
return;
}

if (!accessToken) {
error = 'Session expired. Please refresh the page.';
return;
}

loading = true;
error = null;
wasResubmitted = false;

try {
const response = await fetch('/api/reviews', {
method: 'POST',
headers: {
'Content-Type': 'application/json',
Authorization: `Bearer ${accessToken}`
},
body: JSON.stringify({
reviewee_id: revieweeId,
ride_id: rideId,
rating,
comment,
transaction_confirmed: transactionConfirmed,
safe_trip_confirmed: safeTripConfirmed
})
});

const payload = await response.json();
if (!response.ok) {
throw new Error(payload.error || 'Failed to submit review');
}

existingReviewStatus = 'pending';
wasResubmitted = true;
if (onSuccess) onSuccess();
} catch (err) {
error = err instanceof Error ? err.message : 'Unexpected error';
} finally {
loading = false;
}
}
</script>

<div class="review-form">
<h4>Review {revieweeName}</h4>

{#if existingReviewStatus === 'pending'}
<p class="notice">
{wasResubmitted ? 'Your updated review has been submitted and is awaiting admin approval.' : 'Your review is awaiting admin approval.'}
</p>
{:else if existingReviewStatus === 'approved'}
<p class="notice">You already reviewed this ride.</p>
{:else}
{#if existingReviewStatus === 'rejected'}
<p class="error">Your review was rejected. Update it and submit it again.</p>
{#if rejectionNote}
<p class="notice">Admin note: {rejectionNote}</p>
{/if}
{/if}

<div class="rating-row" role="radiogroup" aria-label="Rating">
{#each [1, 2, 3, 4, 5] as star (star)}
<button
type="button"
class="star"
class:active={star <= rating}
on:click={() => (rating = star)}
				>
					{star <= rating ? '*' : '-'}
				</button>
{/each}
<span>{rating}/5</span>
</div>

<textarea
bind:value={comment}
placeholder="Please share your feedback"
maxlength="500"
rows="4"
required
></textarea>

<fieldset class="confirmation-options">
	<legend>Trip confirmations</legend>
	<label>
		<input type="checkbox" bind:checked={transactionConfirmed} />
		I confirm the agreed payment was completed.
	</label>
	<label>
		<input type="checkbox" bind:checked={safeTripConfirmed} />
		I confirm the trip took place safely.
	</label>
	<p>These are member confirmations, not payment verification by Hizli. Leave a box unchecked if you cannot confirm it.</p>
</fieldset>

{#if error}
<p class="error">{error}</p>
{/if}
<button type="button" disabled={loading || !user} on:click={submitReview}>
{loading ? 'Submitting...' : existingReviewStatus === 'rejected' ? 'Resubmit review' : 'Submit review'}
</button>
{/if}
</div>

<style>
.review-form {
margin-top: 1rem;
padding: 1rem;
border: 1px solid #e5e7eb;
border-radius: 0.75rem;
background: #f8fafc;
}
.rating-row {
display: flex;
align-items: center;
gap: 0.5rem;
margin-bottom: 0.75rem;
}
.star {
border: none;
background: transparent;
font-size: 1.4rem;
cursor: pointer;
color: #cbd5e1;
padding: 0;
}
.star.active {
color: #f59e0b;
}
textarea {
width: 100%;
padding: 0.65rem;
border: 1px solid #cbd5e1;
border-radius: 0.5rem;
margin-bottom: 0.75rem;
}
.confirmation-options {
	display: grid;
	gap: 0.6rem;
	margin: 0 0 0.75rem;
	padding: 0.75rem;
	border: 1px solid #cbd5e1;
	border-radius: 0.5rem;
}
.confirmation-options legend {
	padding: 0 0.25rem;
	font-weight: 600;
}
.confirmation-options label {
	display: flex;
	align-items: flex-start;
	gap: 0.5rem;
}
.confirmation-options input {
	margin-top: 0.25rem;
}
.confirmation-options p {
	margin: 0;
	color: #64748b;
	font-size: 0.8rem;
}
button[type='button'] {
padding: 0.55rem 0.9rem;
border: none;
border-radius: 0.5rem;
background: #0f766e;
color: #fff;
font-weight: 600;
}
button[disabled] {
opacity: 0.6;
}
.notice {
color: #334155;
}
.error {
color: #b91c1c;
}
</style>
