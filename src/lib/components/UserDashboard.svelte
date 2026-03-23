<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import type { User } from '@supabase/supabase-js';

	const allowedEmail = 'hizli-carpooling@gmail.com';

	type SectionLink = {
		id: string;
		label: string;
		caption: string;
	};

	type StatCard = {
		label: string;
		value: string;
		detail: string;
	};

	type RideItem = {
		route: string;
		time: string;
		status: string;
		description: string;
	};

	type BookingItem = {
		trip: string;
		seat: string;
		status: string;
		note: string;
	};

	let currentUser: User | null = null;
	let loading = true;

	const sections: SectionLink[] = [
		{ id: 'my-rides', label: 'My rides', caption: 'Published trips and activity' },
		{ id: 'my-bookings', label: 'My bookings', caption: 'Seats reserved and upcoming plans' },
		{ id: 'profile', label: 'Profile', caption: 'Verification and trust signals' }
	];

	const stats: StatCard[] = [
		{ label: 'Upcoming rides', value: '03', detail: 'Two scheduled this week, one draft pending.' },
		{ label: 'Booking requests', value: '11', detail: 'Recent demand across your most active routes.' },
		{ label: 'Profile strength', value: '82%', detail: 'Photo, bio and preferences already improve trust.' }
	];

	const rides: RideItem[] = [
		{
			route: 'Montreal to Ottawa',
			time: 'Friday, 18:30',
			status: 'Ready to publish',
			description: 'Seats, luggage rules and pickup spot look complete.'
		},
		{
			route: 'Laval to Downtown',
			time: 'Monday, 07:15',
			status: 'Recurring',
			description: 'Your regular commute route is attracting repeat passengers.'
		}
	];

	const bookings: BookingItem[] = [
		{
			trip: 'Quebec City weekend return',
			seat: '1 seat requested',
			status: 'Pending',
			note: 'Waiting for the driver to confirm your request.'
		},
		{
			trip: 'Airport pickup ride',
			seat: 'Awaiting reply',
			status: 'Pending',
			note: 'The driver should respond within a few hours.'
		}
	];

	onMount(async () => {
		const {
			data: { user }
		} = await supabase.auth.getUser();

		currentUser = user;
		loading = false;

		if (!user && browser) {
			goto(resolve('/auth/login'));
		}
	});

	async function signOut() {
		await supabase.auth.signOut();
		goto(resolve('/auth/login'));
	}

	function goToProfile() {
		goto(resolve('/profile'));
	}

	function goHome() {
		goto(resolve('/'));
	}
</script>

{#if loading}
	<div class="dashboard-shell loading-shell">
		<div class="loading-card">
			<div class="loading-ring"></div>
			<p>Loading dashboard...</p>
		</div>
	</div>
{:else if currentUser?.email !== allowedEmail}
	<div class="dashboard-shell locked-shell">
		<div class="locked-card">
			<p class="eyebrow">Restricted access</p>
			<h1>This dashboard is reserved for the internal company account.</h1>
			<p>
				Only <strong>{allowedEmail}</strong> can open this space. You can still manage your personal
				account from the profile page.
			</p>
			<div class="locked-actions">
				<button type="button" class="secondary-action" on:click={goHome}>Back to home</button>
				<button type="button" class="primary-action" on:click={goToProfile}>Open my profile</button>
			</div>
		</div>
	</div>
{:else}
	<div class="dashboard-shell">
		<div class="dashboard-backdrop"></div>
		<div class="dashboard-layout">
			<aside class="side-panel">
				<div>
					<p class="eyebrow">Hizli workspace</p>
					<h1>Dashboard</h1>
					<p class="panel-copy">
						A focused overview for rides, bookings and profile trust indicators.
					</p>
				</div>

				<nav class="section-nav" aria-label="Dashboard sections">
					{#each sections as section}
						<a href={`#${section.id}`} class="section-link">
							<span>{section.label}</span>
							<small>{section.caption}</small>
						</a>
					{/each}
				</nav>

				<div class="panel-footer">
					<div>
						<p class="footer-label">Authorized account</p>
						<p class="footer-value">{currentUser.email}</p>
					</div>
					<button type="button" class="signout-button" on:click={signOut}>Sign out</button>
				</div>
			</aside>

			<main class="content-panel">
				<header class="hero-card">
					<div>
						<p class="eyebrow">User navigation</p>
						<h2>My rides, My bookings, Profile</h2>
						<p>
							This page is intentionally styled like a premium control room while staying simple to
							navigate on desktop and mobile.
						</p>
					</div>
					<div class="hero-actions">
						<button type="button" class="ghost-action" on:click={goToProfile}>Edit profile</button>
						<button type="button" class="primary-action" on:click={goHome}>View public site</button>
					</div>
				</header>

				<section class="stats-grid" aria-label="Key indicators">
					{#each stats as stat}
						<article class="stat-card">
							<p>{stat.label}</p>
							<strong>{stat.value}</strong>
							<span>{stat.detail}</span>
						</article>
					{/each}
				</section>

				<section id="my-rides" class="content-card feature-card">
					<div class="section-heading">
						<div>
							<p class="eyebrow">My rides</p>
							<h3>Published routes and upcoming departures</h3>
						</div>
						<button type="button" class="inline-action">Create a ride</button>
					</div>
					<div class="list-grid">
						{#each rides as ride}
							<article class="list-card accent-green">
								<div class="pill">{ride.status}</div>
								<h4>{ride.route}</h4>
								<p class="meta">{ride.time}</p>
								<p>{ride.description}</p>
							</article>
						{/each}
					</div>
				</section>

				<section id="my-bookings" class="content-card feature-card">
					<div class="section-heading">
						<div>
							<p class="eyebrow">My bookings</p>
							<h3>Seats reserved and confirmations in progress</h3>
						</div>
						<button type="button" class="inline-action warm-action">Browse rides</button>
					</div>
					<div class="list-grid two-column">
						{#each bookings as booking}
							<article class="list-card accent-sand">
								<div class="pill warm-pill">{booking.status}</div>
								<h4>{booking.trip}</h4>
								<p class="meta">{booking.seat}</p>
								<p>{booking.note}</p>
							</article>
						{/each}
					</div>
				</section>

				<section id="profile" class="content-card profile-card">
					<div class="section-heading compact-gap">
						<div>
							<p class="eyebrow">Profile</p>
							<h3>Verification signals that build trust</h3>
						</div>
						<button type="button" class="inline-action" on:click={goToProfile}>Complete profile</button>
					</div>
					<div class="profile-grid">
						<div class="profile-highlight">
							<p class="footer-label">Recommended next step</p>
							<h4>Add every personal and car detail before your next ride.</h4>
							<p>
								A complete profile makes verification easier and increases confidence for future users.
							</p>
						</div>
						<ul class="trust-list">
							<li>Profile photo uploaded</li>
							<li>Bio and languages completed</li>
							<li>Ride preferences clearly listed</li>
							<li>Vehicle details ready for review</li>
						</ul>
					</div>
				</section>
			</main>
		</div>
	</div>
{/if}

<style>
	:global(html) {
		scroll-behavior: smooth;
	}

	.dashboard-shell {
		position: relative;
		min-height: calc(100vh - 5rem);
		padding: 2rem;
		background:
			radial-gradient(circle at top left, rgba(28, 169, 123, 0.2), transparent 28%),
			linear-gradient(135deg, #fff8ed 0%, #f7fbf8 48%, #edf7ff 100%);
	}

	.dashboard-backdrop {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(circle at 80% 10%, rgba(255, 179, 71, 0.18), transparent 22%),
			radial-gradient(circle at 20% 100%, rgba(47, 129, 247, 0.14), transparent 28%);
		pointer-events: none;
	}

	.dashboard-layout {
		position: relative;
		z-index: 1;
		display: grid;
		grid-template-columns: 320px minmax(0, 1fr);
		gap: 1.5rem;
		max-width: 1400px;
		margin: 0 auto;
	}

	.side-panel,
	.content-card,
	.hero-card,
	.stat-card,
	.locked-card,
	.loading-card {
		backdrop-filter: blur(18px);
		background: rgba(255, 255, 255, 0.78);
		border: 1px solid rgba(15, 23, 42, 0.08);
		box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
	}

	.side-panel {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		border-radius: 28px;
		padding: 2rem;
		min-height: 760px;
	}

	.content-panel {
		display: grid;
		gap: 1.25rem;
	}

	.hero-card,
	.content-card {
		border-radius: 28px;
		padding: 1.5rem;
	}

	.hero-card {
		display: flex;
		justify-content: space-between;
		gap: 1.5rem;
		align-items: end;
	}

	.hero-card h2,
	.side-panel h1,
	.locked-card h1 {
		font-size: clamp(2rem, 3vw, 3.2rem);
		line-height: 1;
		letter-spacing: -0.04em;
		color: #102a1f;
		margin: 0.25rem 0 0.75rem;
	}

	.hero-card p,
	.panel-copy,
	.locked-card p,
	.list-card p,
	.profile-highlight p,
	.stat-card span {
		color: #4b6358;
		line-height: 1.6;
	}

	.eyebrow {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #d97706;
	}

	.section-nav {
		display: grid;
		gap: 0.85rem;
		margin: 2rem 0;
	}

	.section-link {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 1rem 1.05rem;
		border-radius: 18px;
		text-decoration: none;
		color: #17352a;
		background: rgba(16, 42, 31, 0.04);
		transition: transform 160ms ease, background 160ms ease, color 160ms ease;
	}

	.section-link:hover {
		transform: translateX(4px);
		background: linear-gradient(135deg, #1ca97b, #1976d2);
		color: #ffffff;
	}

	.section-link small {
		font-size: 0.82rem;
		opacity: 0.8;
	}

	.panel-footer {
		display: grid;
		gap: 1rem;
		padding-top: 1.25rem;
		border-top: 1px solid rgba(15, 23, 42, 0.08);
	}

	.footer-label {
		margin: 0;
		font-size: 0.82rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: #648271;
	}

	.footer-value {
		margin: 0.35rem 0 0;
		font-weight: 700;
		color: #102a1f;
		word-break: break-word;
	}

	.hero-actions,
	.locked-actions {
		display: flex;
		gap: 0.85rem;
		flex-wrap: wrap;
	}

	.primary-action,
	.secondary-action,
	.ghost-action,
	.inline-action,
	.signout-button {
		border: none;
		border-radius: 999px;
		padding: 0.95rem 1.35rem;
		font-weight: 700;
		cursor: pointer;
		transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
	}

	.primary-action,
	.inline-action {
		background: linear-gradient(135deg, #1ca97b, #1976d2);
		color: #ffffff;
		box-shadow: 0 14px 28px rgba(25, 118, 210, 0.22);
	}

	.secondary-action,
	.ghost-action,
	.signout-button,
	.warm-action {
		background: rgba(255, 255, 255, 0.78);
		color: #17352a;
		border: 1px solid rgba(15, 23, 42, 0.08);
	}

	.primary-action:hover,
	.secondary-action:hover,
	.ghost-action:hover,
	.inline-action:hover,
	.signout-button:hover {
		transform: translateY(-1px);
		box-shadow: 0 14px 26px rgba(15, 23, 42, 0.12);
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
	}

	.stat-card {
		border-radius: 24px;
		padding: 1.25rem;
		display: grid;
		gap: 0.65rem;
	}

	.stat-card p,
	.meta {
		margin: 0;
		color: #648271;
	}

	.stat-card strong {
		font-size: 2.4rem;
		line-height: 1;
		color: #102a1f;
	}

	.section-heading {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: center;
		margin-bottom: 1.25rem;
	}

	.section-heading h3,
	.list-card h4,
	.profile-highlight h4 {
		margin: 0.25rem 0 0;
		color: #102a1f;
	}

	.list-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}

	.two-column {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.list-card {
		padding: 1.25rem;
		border-radius: 24px;
		border: 1px solid rgba(15, 23, 42, 0.06);
	}

	.accent-green {
		background: linear-gradient(180deg, rgba(28, 169, 123, 0.12), rgba(255, 255, 255, 0.8));
	}

	.accent-sand {
		background: linear-gradient(180deg, rgba(245, 158, 11, 0.12), rgba(255, 255, 255, 0.85));
	}

	.pill {
		display: inline-flex;
		width: fit-content;
		padding: 0.38rem 0.7rem;
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 700;
		background: rgba(28, 169, 123, 0.14);
		color: #0f7a59;
	}

	.warm-pill {
		background: rgba(245, 158, 11, 0.16);
		color: #b45309;
	}

	.profile-grid {
		display: grid;
		grid-template-columns: 1.3fr 1fr;
		gap: 1rem;
	}

	.profile-highlight {
		padding: 1.35rem;
		border-radius: 24px;
		background: linear-gradient(135deg, rgba(25, 118, 210, 0.1), rgba(28, 169, 123, 0.12));
	}

	.trust-list {
		margin: 0;
		padding: 1.15rem 1.15rem 1.15rem 2.1rem;
		border-radius: 24px;
		background: rgba(16, 42, 31, 0.04);
		color: #17352a;
		display: grid;
		gap: 0.85rem;
	}

	.locked-shell,
	.loading-shell {
		display: grid;
		place-items: center;
	}

	.locked-card,
	.loading-card {
		max-width: 720px;
		padding: 2rem;
		border-radius: 28px;
	}

	.loading-card {
		display: grid;
		gap: 1rem;
		justify-items: center;
	}

	.loading-ring {
		width: 64px;
		height: 64px;
		border-radius: 999px;
		border: 6px solid rgba(28, 169, 123, 0.18);
		border-top-color: #1ca97b;
		animation: spin 0.9s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 1024px) {
		.dashboard-layout,
		profile-grid {
			grid-template-columns: 1fr;
		}

		.side-panel {
			min-height: unset;
		}

		.stats-grid,
		.list-grid,
		.two-column,
		.profile-grid {
			grid-template-columns: 1fr;
		}

		.hero-card,
		.section-heading {
			align-items: start;
			flex-direction: column;
		}
	}

	@media (max-width: 640px) {
		.dashboard-shell {
			padding: 1rem;
		}

		.side-panel,
		.hero-card,
		.content-card,
		.locked-card,
		.loading-card {
			border-radius: 22px;
			padding: 1.1rem;
		}

		.hero-actions,
		.locked-actions {
			width: 100%;
		}

		.primary-action,
		.secondary-action,
		.ghost-action,
		.inline-action,
		.signout-button {
			width: 100%;
		}
	}
</style>