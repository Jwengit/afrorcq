<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';

	type Ride = {
		id: string;
		departure: string;
		arrival: string;
		pickup: string;
		dropoff: string;
		ride_date: string;
		seats: number;
		price: number;
		girls_only: boolean;
		driver_id: string;
	};

	let departure = '';
	let arrival = '';
	let results: Ride[] = [];
	let searched = false;
	let loading = false;
	let errorMessage = '';

	async function searchRides() {
		const dep = departure.trim();
		const arr = arrival.trim();

		if (!dep && !arr) {
			errorMessage = 'Please enter a departure or arrival city.';
			return;
		}

		errorMessage = '';
		loading = true;
		searched = false;

		let query = supabase
			.from('rides')
			.select('id, departure, arrival, pickup, dropoff, ride_date, seats, price, girls_only, driver_id')
			.order('ride_date', { ascending: true });

		if (dep) {
			query = query.ilike('departure', `%${dep}%`);
		}
		if (arr) {
			query = query.ilike('arrival', `%${arr}%`);
		}

		const { data, error } = await query;

		if (error) {
			console.error('Search error:', error);
			errorMessage = 'Search failed. Please try again.';
		} else {
			results = (data as Ride[]) ?? [];
		}

		loading = false;
		searched = true;
	}
</script>

<div class="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
	<div class="max-w-3xl mx-auto">
		<h1 class="text-2xl sm:text-3xl font-bold text-gray-900">Find a ride</h1>
		<p class="mt-2 text-gray-600">Search for available rides by city.</p>

		<form class="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4" on:submit|preventDefault={searchRides}>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="dep" class="block text-sm font-medium text-gray-700 mb-1">Departure city</label>
					<input
						id="dep"
						type="text"
						bind:value={departure}
						placeholder="e.g. Casablanca"
						class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
					/>
				</div>
				<div>
					<label for="arr" class="block text-sm font-medium text-gray-700 mb-1">Arrival city</label>
					<input
						id="arr"
						type="text"
						bind:value={arrival}
						placeholder="e.g. Marrakech"
						class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
					/>
				</div>
			</div>

			{#if errorMessage}
				<p class="text-sm text-red-600">{errorMessage}</p>
			{/if}

			<button
				type="submit"
				disabled={loading}
				class="w-full rounded-md bg-green-600 text-white font-medium py-2.5 hover:bg-green-700 transition-colors disabled:opacity-60"
			>
				{loading ? 'Searching...' : 'Search'}
			</button>
		</form>

		{#if searched}
			<div class="mt-8 space-y-4">
				{#if results.length === 0}
					<p class="text-center text-gray-500 py-10">No rides found for this route.</p>
				{:else}
					<p class="text-sm text-gray-500">{results.length} ride{results.length !== 1 ? 's' : ''} found</p>
					{#each results as ride (ride.id)}
						<article class="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
							<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
								<div>
									<h2 class="text-base font-semibold text-gray-900">
										{ride.departure} → {ride.arrival}
									</h2>
									<p class="text-sm text-gray-500 mt-0.5">
										{new Date(ride.ride_date).toLocaleString()}
									</p>
									<p class="text-sm text-gray-600 mt-1">
										Pickup: {ride.pickup} · Drop-off: {ride.dropoff}
									</p>
								</div>
								<div class="flex flex-col items-start sm:items-end gap-1">
									<span class="text-lg font-bold text-green-700">{ride.price} MAD</span>
									<span class="text-sm text-gray-500">{ride.seats} seat{ride.seats !== 1 ? 's' : ''} left</span>
									{#if ride.girls_only}
										<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 text-xs font-medium">Girls Only</span>
									{/if}
								</div>
							</div>
						</article>
					{/each}
				{/if}
			</div>
		{/if}
	</div>
</div>
