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
first_name: string | null;
last_name: string | null;
profile_photo_url: string | null;
is_verified: boolean | null;
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
const payload = (await response.json()) as Review[];
reviews = payload.sort(
	(a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
);
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

function fullName(review: Review): string {
const first = review.profiles?.first_name?.trim() ?? '';
const last = review.profiles?.last_name?.trim() ?? '';
const name = `${first} ${last}`.trim();
return name || 'Verified member';
}

function initials(review: Review): string {
const first = (review.profiles?.first_name ?? '').trim();
const last = (review.profiles?.last_name ?? '').trim();
const chars = `${first.charAt(0)}${last.charAt(0)}`.trim();
return chars ? chars.toUpperCase() : 'U';
}
</script>

<section class="reviews-section">
<div class="header-row">
<h3>Reviews{userName ? ` for ${userName}` : ''}</h3>
</div>

{#if loading}
<p>Loading reviews...</p>
{:else if error}
<p class="error">{error}</p>
{:else if reviews.length === 0}
<p>No review yet.</p>
{:else}
<div class="summary-card">
<div class="summary-score">
<strong>{averageRating.toFixed(1)}</strong>
<span>/5</span>
</div>
</div>

<div class="list">
{#each reviews as review (review.id)}
<article class="card">
<div class="top-row">
<div class="identity-row">
{#if review.profiles?.profile_photo_url}
<img class="avatar" src={review.profiles.profile_photo_url} alt={`Profile photo of ${fullName(review)}`} loading="lazy" />
{:else}
<div class="avatar-fallback" aria-hidden="true">{initials(review)}</div>
{/if}

<div>
<p class="name-row">
<span class="name">{fullName(review)}</span>
{#if review.profiles?.is_verified}
<span class="verified-badge" title="Verified member" aria-label="Verified member">
<svg class="verified-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
<path fill-rule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.02 7.02a1 1 0 01-1.415 0L4.29 9.752a1 1 0 111.415-1.415l3.271 3.272 6.313-6.313a1 1 0 011.415-.006z" clip-rule="evenodd" />
</svg>
Verified
</span>
{/if}
</p>
<p class="date">{new Date(review.created_at).toLocaleDateString('fr-FR')}</p>
</div>
</div>

<div class="rating-box" aria-label={`Rating ${review.rating} out of 5`}>
<div class="rating-dots">
{#each [1, 2, 3, 4, 5] as dot}
<span class="dot" class:filled={dot <= review.rating}></span>
{/each}
</div>
<span class="rating-value">{review.rating}/5</span>
</div>
</div>
{#if review.comment}
<p class="comment">{review.comment}</p>
{/if}
</article>
{/each}
</div>
{/if}
</section>

<style>
.reviews-section {
margin-top: 1.25rem;
padding: 1.15rem;
border: 1px solid #e2e8f0;
border-radius: 0.9rem;
background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}
.header-row {
display: flex;
align-items: center;
justify-content: space-between;
}
.summary-card {
margin-top: 0.8rem;
display: flex;
align-items: center;
justify-content: space-between;
gap: 0.9rem;
padding: 0.75rem 0.9rem;
border: 1px solid #dbeafe;
background: #eff6ff;
border-radius: 0.7rem;
}
.summary-score {
display: flex;
align-items: center;
}
.summary-score strong {
font-size: 1.15rem;
line-height: 1;
}
.summary-score span {
color: #475569;
font-weight: 600;
}
.summary-text {
margin: 0;
color: #334155;
font-size: 0.92rem;
}
.list {
display: grid;
gap: 0.85rem;
margin-top: 0.9rem;
}
.card {
padding: 0.9rem;
border: 1px solid #e2e8f0;
border-radius: 0.75rem;
background: #ffffff;
box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.top-row {
display: flex;
justify-content: space-between;
gap: 0.8rem;
align-items: center;
}
.identity-row {
display: flex;
align-items: center;
gap: 0.65rem;
min-width: 0;
}
.avatar {
width: 42px;
height: 42px;
border-radius: 999px;
object-fit: cover;
border: 1px solid #cbd5e1;
}
.avatar-fallback {
width: 42px;
height: 42px;
border-radius: 999px;
display: inline-flex;
align-items: center;
justify-content: center;
font-weight: 700;
font-size: 0.82rem;
color: #0f172a;
background: #e2e8f0;
border: 1px solid #cbd5e1;
}
.name-row {
margin: 0;
display: flex;
align-items: center;
gap: 0.45rem;
}
.name {
margin: 0;
font-weight: 700;
color: #111827;
}
.verified-badge {
display: inline-flex;
align-items: center;
gap: 0.2rem;
padding: 0.12rem 0.35rem;
border-radius: 999px;
font-size: 0.68rem;
font-weight: 700;
color: #065f46;
background: #d1fae5;
border: 1px solid #a7f3d0;
}
.verified-icon {
width: 11px;
height: 11px;
}
.date {
margin: 0.1rem 0 0;
font-size: 0.82rem;
color: #64748b;
}
.rating-box {
display: flex;
flex-direction: column;
align-items: flex-end;
gap: 0.2rem;
}
.rating-dots {
display: flex;
gap: 0.25rem;
}
.dot {
width: 8px;
height: 8px;
border-radius: 999px;
background: #cbd5e1;
}
.dot.filled {
background: #f59e0b;
}
.rating-value {
font-size: 0.78rem;
font-weight: 700;
color: #334155;
}
.comment {
margin: 0.7rem 0 0;
line-height: 1.45;
color: #1f2937;
}
.error {
color: #b91c1c;
}

@media (max-width: 640px) {
.top-row {
flex-direction: column;
align-items: flex-start;
}

.rating-box {
align-items: flex-start;
}
}
</style>
