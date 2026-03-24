<script lang="ts">
import { supabase } from '$lib/supabaseClient';
import type { User } from '@supabase/supabase-js';

export let rideId: string;
export let revieweeId: string;
export let revieweeName = '';
export let user: User | null = null;
export let onSuccess: (() => void) | undefined = undefined;

let rating = 5;
let comment = '';
let loading = false;
let error: string | null = null;
let success = false;
let hasExistingReview = false;

$: if (user && rideId && revieweeId) {
void checkExistingReview();
}

async function checkExistingReview() {
const response = await fetch(`/api/reviews?user_id=${revieweeId}`);
if (!response.ok) return;
const reviews = await response.json();
hasExistingReview = (reviews || []).some(
(r: { reviewer_id: string; ride_id: string }) => r.reviewer_id === user?.id && r.ride_id === rideId
);
}

async function submitReview() {
if (!user) {
error = 'You must be logged in to submit a review';
return;
}

loading = true;
error = null;
success = false;

try {
const {
data: { session }
} = await supabase.auth.getSession();
if (!session?.access_token) {
throw new Error('Unauthorized');
}

const response = await fetch('/api/reviews', {
method: 'POST',
headers: {
'Content-Type': 'application/json',
Authorization: `Bearer ${session.access_token}`
},
body: JSON.stringify({
reviewee_id: revieweeId,
ride_id: rideId,
rating,
comment
})
});

const payload = await response.json();
if (!response.ok) {
throw new Error(payload.error || 'Failed to submit review');
}

success = true;
hasExistingReview = true;
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

{#if hasExistingReview}
<p class="notice">You already reviewed this ride.</p>
{:else}
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
placeholder="Optional comment"
maxlength="500"
rows="4"
></textarea>

{#if error}
<p class="error">{error}</p>
{/if}
{#if success}
<p class="success">Review posted.</p>
{/if}

<button type="button" disabled={loading || !user} on:click={submitReview}>
{loading ? 'Submitting...' : 'Submit review'}
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
.success {
color: #166534;
}
</style>
