<script lang="ts">
export let userId: string;
export let userName = '';

type Review = {
id: string;
rating: number;
comment: string | null;
created_at: string;
profiles: {
id: string;
first_name: string;
last_name: string;
profile_photo_url: string | null;
};
};

let reviews: Review[] = [];
let loading = false;
let error: string | null = null;
let averageRating = 0;

$: if (userId) {
void fetchReviews();
}

async function fetchReviews() {
loading = true;
error = null;
try {
const response = await fetch(`/api/reviews?user_id=${userId}`);
if (!response.ok) throw new Error('Failed to fetch reviews');
reviews = await response.json();
if (reviews.length > 0) {
const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
averageRating = Math.round((sum / reviews.length) * 10) / 10;
}
} catch (err) {
error = err instanceof Error ? err.message : 'Unknown error';
} finally {
loading = false;
}
}

function stars(rating: number) {
return Array.from({ length: 5 }, (_, i) => (i < rating ? '?' : '?')).join('');
}
</script>

<section class="reviews-section">
<h3>Reviews{userName ? ` for ${userName}` : ''}</h3>

{#if loading}
<p>Loading reviews...</p>
{:else if error}
<p class="error">{error}</p>
{:else if reviews.length === 0}
<p>No review yet.</p>
{:else}
<p class="summary">
<span class="stars">{stars(Math.round(averageRating))}</span>
<strong>{averageRating.toFixed(1)}/5</strong>
<span>({reviews.length} review{reviews.length > 1 ? 's' : ''})</span>
</p>

<div class="list">
{#each reviews as review (review.id)}
<article class="card">
<div class="top">
<p>
<strong>{review.profiles?.first_name} {review.profiles?.last_name}</strong>
<span> • {new Date(review.created_at).toLocaleDateString('fr-FR')}</span>
</p>
<p class="stars">{stars(review.rating)} {review.rating}/5</p>
</div>
{#if review.comment}
<p>{review.comment}</p>
{/if}
</article>
{/each}
</div>
{/if}
</section>

<style>
.reviews-section {
margin-top: 1.25rem;
padding: 1rem;
border: 1px solid #e5e7eb;
border-radius: 0.75rem;
background: #fff;
}
.summary {
display: flex;
gap: 0.6rem;
align-items: center;
}
.stars {
color: #f59e0b;
}
.list {
display: grid;
gap: 0.7rem;
margin-top: 0.8rem;
}
.card {
padding: 0.8rem;
border: 1px solid #e5e7eb;
border-radius: 0.6rem;
background: #f8fafc;
}
.top {
display: flex;
justify-content: space-between;
gap: 0.6rem;
align-items: baseline;
}
.error {
color: #b91c1c;
}
</style>
