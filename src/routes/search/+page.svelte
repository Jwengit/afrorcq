<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { resolve } from '$app/paths';
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
		driver_profile?: DriverProfile | null;
	};

	type DriverProfile = {
		id: string;
		first_name: string | null;
		last_name: string | null;
		profile_photo_url: string | null;
		is_verified: boolean;
	};

	let departure = '';
	let arrival = '';
	let dateFilter = '';
	let seatsFilter = 1;
	let results: Ride[] = [];
	let searched = false;
	let loading = false;
	let errorMessage = '';
	let isFemaleUser = false;

	function persistSearchState() {
		const params = new URLSearchParams();
		if (departure.trim()) params.set('departure', departure.trim());
		if (arrival.trim()) params.set('arrival', arrival.trim());
		if (dateFilter) params.set('date', dateFilter);
		if (seatsFilter > 1) params.set('seats', String(seatsFilter));

		const qs = params.toString();
		const searchUrl = resolve('/search') + (qs ? '?' + qs : '');

		history.replaceState({}, '', searchUrl);
		if (typeof sessionStorage !== 'undefined') {
			sessionStorage.setItem('lastSearchUrl', searchUrl);
			sessionStorage.setItem('lastSearchParams', qs);
		}
	}

	function driverPublicProfileHref(driverId: string): string {
		return `${resolve('/profile/public')}?id=${encodeURIComponent(driverId)}`;
	}

	function driverDisplayName(ride: Ride): string {
		const first = ride.driver_profile?.first_name?.trim() ?? '';
		const last = ride.driver_profile?.last_name?.trim() ?? '';
		const full = `${first} ${last}`.trim();
		return full || 'Conducteur';
	}

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

		const { data, error } = await supabase
			.from('rides')
			.select('id, departure, arrival, pickup, dropoff, ride_date, seats, price, girls_only, driver_id')
			.order('ride_date', { ascending: true });

		if (error) {
			console.error('Search error:', error);
			errorMessage = 'Search failed. Please try again.';
		} else {
			const allRides = (data as Ride[]) ?? [];
			const driverIds = Array.from(new Set(allRides.map((ride) => ride.driver_id).filter(Boolean)));
			let driversById = new Map<string, DriverProfile>();

			if (driverIds.length > 0) {
				let { data: driverProfiles, error: driverProfilesError } = await supabase
					.from('profiles')
					.select('id, first_name, last_name, profile_photo_url, is_verified')
					.in('id', driverIds);

				if (driverProfilesError?.message?.toLowerCase().includes('is_verified')) {
					const fallback = await supabase
						.from('profiles')
						.select('id, first_name, last_name, profile_photo_url')
						.in('id', driverIds);

					driverProfiles = (fallback.data ?? []).map((profile) => ({
						...profile,
						is_verified: false
					}));
					driverProfilesError = fallback.error;
				}

				if (driverProfilesError) {
					console.error('Driver profiles search error:', driverProfilesError);
				} else {
					driversById = new Map(
						(driverProfiles ?? []).map((profile) => [
							profile.id,
							{
								id: profile.id,
								first_name: profile.first_name ?? null,
								last_name: profile.last_name ?? null,
								profile_photo_url: profile.profile_photo_url ?? null,
								is_verified: Boolean(profile.is_verified)
							}
						])
					);
				}
			}

			const ridesWithDrivers = allRides.map((ride) => ({
				...ride,
				driver_profile: driversById.get(ride.driver_id) ?? null
			}));
			const depLower = dep.toLowerCase();
			const arrLower = arr.toLowerCase();

			results = ridesWithDrivers.filter((ride) => {
				const rideDeparture = ride.departure.toLowerCase();
				const rideArrival = ride.arrival.toLowerCase();

				let routeMatches = true;
				if (depLower && arrLower) {
					const directMatch =
						rideDeparture.includes(depLower) && rideArrival.includes(arrLower);
					const reverseMatch =
						rideDeparture.includes(arrLower) && rideArrival.includes(depLower);
					routeMatches = directMatch || reverseMatch;
				} else if (depLower) {
					routeMatches =
						rideDeparture.includes(depLower) || rideArrival.includes(depLower);
				} else if (arrLower) {
					routeMatches =
						rideDeparture.includes(arrLower) || rideArrival.includes(arrLower);
				}

				const dateMatches = !dateFilter
					? true
					: new Date(ride.ride_date).toLocaleDateString('en-CA') === dateFilter;

				const seatsMatch = ride.seats >= seatsFilter;

				const girlsOnlyMatch = ride.girls_only ? isFemaleUser : true;

				return routeMatches && dateMatches && seatsMatch && girlsOnlyMatch;
			});
		}

		loading = false;
		searched = true;
		persistSearchState();
	}

	onMount(async () => {
		const { data: { user } } = await supabase.auth.getUser();
		if (user) {
			const { data: profile } = await supabase
				.from('profiles')
				.select('gender')
				.eq('id', user.id)
				.maybeSingle();
			isFemaleUser = (profile?.gender ?? '').toLowerCase() === 'female';
		}

		const dep = $page.url.searchParams.get('departure') ?? '';
		const arr = $page.url.searchParams.get('arrival') ?? '';
		const date = $page.url.searchParams.get('date') ?? '';
		const seats = Number($page.url.searchParams.get('seats') ?? '1');
		const hasUrlFilters = dep || arr || date || seats > 1;

		departure = dep;
		arrival = arr;
		dateFilter = date;
		seatsFilter = Number.isFinite(seats) && seats > 0 ? seats : 1;

		if (!hasUrlFilters && typeof sessionStorage !== 'undefined') {
			const savedParams = sessionStorage.getItem('lastSearchParams');
			if (savedParams) {
				const savedSearchParams = new URLSearchParams(savedParams);
				departure = savedSearchParams.get('departure') ?? '';
				arrival = savedSearchParams.get('arrival') ?? '';
				dateFilter = savedSearchParams.get('date') ?? '';
				const savedSeats = Number(savedSearchParams.get('seats') ?? '1');
				seatsFilter = Number.isFinite(savedSeats) && savedSeats > 0 ? savedSeats : 1;
			}
		}

		if (departure || arrival || dateFilter || seatsFilter > 1) {
			await searchRides();
		}
	});
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
				{#each results as ride (ride.id)}
					<div class="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md hover:border-green-300 transition-all">
						<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
							<div>
								<div class="flex items-center gap-3 mb-2">
									<a
										href={driverPublicProfileHref(ride.driver_id)}
										on:click={persistSearchState}
										class="relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 ring-2 ring-white"
										aria-label="View driver profile"
									>
										{#if ride.driver_profile?.profile_photo_url}
											<img
												src={ride.driver_profile.profile_photo_url}
												alt={driverDisplayName(ride)}
												class="h-full w-full object-cover"
											/>
										{:else}
											<svg class="h-5 w-5 text-slate-500" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
												<path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z"/>
											</svg>
										{/if}
									</a>
									<div class="flex items-center gap-2 min-w-0">
										<a
											href={driverPublicProfileHref(ride.driver_id)}
											on:click={persistSearchState}
											class="text-sm font-semibold text-slate-800 hover:text-green-700 truncate"
										>
											{driverDisplayName(ride)}
										</a>
										{#if ride.driver_profile?.is_verified}
											<span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
												<svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
													<path fill-rule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.02 7.02a1 1 0 01-1.415 0L4.29 9.752a1 1 0 111.415-1.415l3.271 3.272 6.313-6.313a1 1 0 011.415-.006z" clip-rule="evenodd" />
												</svg>
												Verified
											</span>
										{/if}
									</div>
								</div>
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
								<span class="text-lg font-bold text-green-700">${ride.price}</span>
								<span class="text-sm text-gray-500">{ride.seats} seat{ride.seats !== 1 ? 's' : ''} left</span>
								{#if ride.girls_only}
									<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 text-xs font-medium">Girls Only</span>
								{/if}
							</div>
						</div>
						<div class="mt-4 flex flex-col sm:flex-row gap-2">
							<a
								href={resolve(`/ride/${ride.id}`)}
								on:click={persistSearchState}
								class="inline-flex items-center justify-center rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
							>
								View ride details
							</a>
							<a
								href={driverPublicProfileHref(ride.driver_id)}
								on:click={persistSearchState}
								class="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
							>
								View driver profile
							</a>
						</div>
					</div>
				{/each}
				{/if}
			</div>
		{/if}
	</div>
</div>
