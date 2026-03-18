<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import type { User } from '@supabase/supabase-js';

	type Ride = {
		from: string;
		to: string;
		date: string;
		status: 'Published' | 'Draft' | 'Completed';
	};

	type Booking = {
		route: string;
		date: string;
		status: 'Confirmed' | 'Pending' | 'Cancelled';
	};

	let currentUser: User | null = null;
	let loading = true;

	const myRides: Ride[] = [
		{ from: 'Salt Lake City', to: 'Provo', date: '2026-03-22 08:00', status: 'Published' },
		{ from: 'Ogden', to: 'Salt Lake City', date: '2026-03-24 18:30', status: 'Draft' }
	];

	const myBookings: Booking[] = [
		{ route: 'Salt Lake City to Logan', date: '2026-03-23 09:15', status: 'Confirmed' },
		{ route: 'Provo to Ogden', date: '2026-03-25 17:00', status: 'Pending' }
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

	function goToProfile() {
		goto(resolve('/profile'));
	}

	async function signOut() {
		await supabase.auth.signOut();
		goto(resolve('/auth/login'));
	}
</script>

{#if loading}
	<div class="min-h-screen flex items-center justify-center bg-gray-50">
		<div class="text-center">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
			<p class="mt-3 text-gray-600">Loading dashboard...</p>
		</div>
	</div>
{:else if currentUser}
	<div class="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
		<div class="max-w-6xl mx-auto space-y-6">
			<section class="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
				<div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
					<div>
						<p class="text-sm text-gray-500">Connected as {currentUser.email}</p>
						<h1 class="text-3xl font-bold text-gray-900 mt-1">Dashboard</h1>
					</div>
					<div class="flex gap-3">
						<button
							type="button"
							on:click={goToProfile}
							class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
						>
							Go to profile
						</button>
						<button
							type="button"
							on:click={signOut}
							class="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-black"
						>
							Sign out
						</button>
					</div>
				</div>

				<nav class="mt-6 border-t border-gray-100 pt-4" aria-label="User dashboard navigation">
					<ul class="flex flex-wrap gap-2">
						<li>
							<a href="#my-rides" class="inline-flex items-center px-4 py-2 rounded-full bg-green-100 text-green-800 text-sm font-medium hover:bg-green-200">
								My rides
							</a>
						</li>
						<li>
							<a href="#my-bookings" class="inline-flex items-center px-4 py-2 rounded-full bg-blue-100 text-blue-800 text-sm font-medium hover:bg-blue-200">
								My bookings
							</a>
						</li>
					</ul>
				</nav>
			</section>

			<section id="my-rides" class="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
				<h2 class="text-xl font-semibold text-gray-900 mb-4">My rides</h2>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					{#each myRides as ride (`${ride.from}-${ride.to}-${ride.date}`)}
						<article class="rounded-lg border border-gray-200 p-4">
							<p class="text-sm text-gray-500">{ride.date}</p>
							<h3 class="text-base font-semibold text-gray-900 mt-1">{ride.from} to {ride.to}</h3>
							<p class="mt-2 text-sm">
								<span class="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
									{ride.status}
								</span>
							</p>
						</article>
					{/each}
				</div>
			</section>

			<section id="my-bookings" class="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
				<h2 class="text-xl font-semibold text-gray-900 mb-4">My bookings</h2>
				<div class="space-y-3">
					{#each myBookings as booking (`${booking.route}-${booking.date}`)}
						<article class="rounded-lg border border-gray-200 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
							<div>
								<h3 class="text-base font-semibold text-gray-900">{booking.route}</h3>
								<p class="text-sm text-gray-500">{booking.date}</p>
							</div>
							<span class="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-sm w-fit">
								{booking.status}
							</span>
						</article>
					{/each}
				</div>
			</section>

		</div>
	</div>
{/if}