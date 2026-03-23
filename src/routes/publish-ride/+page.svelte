<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onDestroy, onMount } from 'svelte';
	import type { User } from '@supabase/supabase-js';
	import { user } from '$lib/authStore';
	import { supabase } from '$lib/supabaseClient';

	type DriverProfile = {
		gender?: string | null;
	};

	type RideForm = {
		departure: string;
		arrival: string;
		pickup: string;
		dropoff: string;
		rideDate: string;
		seats: number;
		price: number;
		girlsOnly: boolean;
	};

	let currentUser: User | null = null;
	let loading = true;
	let submitting = false;
	let allowedToPublish = false;
	let isFemaleDriver = false;
	let errorMessage = '';
	let successMessage = '';

	let form: RideForm = {
		departure: '',
		arrival: '',
		pickup: '',
		dropoff: '',
		rideDate: '',
		seats: 1,
		price: 0,
		girlsOnly: false
	};

	const unsubscribe = user.subscribe((u) => {
		currentUser = u;
	});

	onDestroy(() => {
		unsubscribe();
	});

	onMount(async () => {
		await ensureAuthenticatedUser();

		if (!currentUser) {
			loading = false;
			if (browser) {
				goto(resolve('/auth/login'));
			}
			return;
		}

		await loadPublishingEligibility(currentUser.id);
		loading = false;
	});

	async function ensureAuthenticatedUser() {
		if (currentUser) {
			return;
		}

		const { data, error } = await supabase.auth.getUser();
		if (error) {
			console.error('Auth check error:', error);
			return;
		}

		currentUser = data.user;
	}

	async function loadPublishingEligibility(userId: string) {
		errorMessage = '';

		const { data, error } = await supabase
			.from('profiles')
			.select('*')
			.eq('id', userId)
			.maybeSingle();

		if (error) {
			console.error('Profile fetch error:', error);
			errorMessage = 'Could not load your profile. Please try again.';
			allowedToPublish = false;
			return;
		}

		const profile = (data as DriverProfile | null) ?? null;
		isFemaleDriver = (profile?.gender ?? '').toLowerCase() === 'female';
		allowedToPublish = true;

		if (!isFemaleDriver) {
			form.girlsOnly = false;
		}
	}

	async function submitRide() {
		if (!currentUser || !allowedToPublish) {
			return;
		}

		errorMessage = '';
		successMessage = '';

		const departure = form.departure.trim();
		const arrival = form.arrival.trim();
		const pickup = form.pickup.trim();
		const dropoff = form.dropoff.trim();

		if (!departure || !arrival || !pickup || !dropoff || !form.rideDate) {
			errorMessage = 'All fields are required.';
			return;
		}

		if (form.seats < 1) {
			errorMessage = 'Seats must be at least 1.';
			return;
		}

		if (form.price < 0) {
			errorMessage = 'Price must be zero or positive.';
			return;
		}

		const rideDateIso = new Date(form.rideDate).toISOString();
		if (Number.isNaN(new Date(rideDateIso).getTime())) {
			errorMessage = 'Invalid ride date.';
			return;
		}

		submitting = true;

		try {
			const { error } = await supabase.from('rides').insert({
				driver_id: currentUser.id,
				departure,
				arrival,
				pickup,
				dropoff,
				ride_date: rideDateIso,
				seats: form.seats,
				price: form.price,
				girls_only: isFemaleDriver ? form.girlsOnly : false
			});

			if (error) {
				console.error('Ride insert error:', error);
				errorMessage = error.message || 'Failed to publish the ride.';
				return;
			}

			successMessage = 'Ride published successfully.';
			form = {
				departure: '',
				arrival: '',
				pickup: '',
				dropoff: '',
				rideDate: '',
				seats: 1,
				price: 0,
				girlsOnly: false
			};
		} catch (error) {
			console.error('Unexpected publish error:', error);
			errorMessage = 'An unexpected error occurred.';
		} finally {
			submitting = false;
		}
	}
</script>

{#if loading}
	<div class="min-h-screen flex items-center justify-center">
		<div class="text-center">
			<div class="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600 mx-auto"></div>
			<p class="mt-4 text-gray-600">Loading...</p>
		</div>
	</div>
{:else}
	<div class="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
		<div class="max-w-2xl mx-auto bg-white rounded-xl shadow-md p-6 sm:p-8">
			<h1 class="text-2xl sm:text-3xl font-bold text-gray-900">Publish a ride</h1>
			<p class="mt-2 text-gray-600">Post your trip in seconds.</p>

			{#if errorMessage}
				<div class="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
					{errorMessage}
				</div>
			{/if}

			{#if successMessage}
				<div class="mt-5 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
					{successMessage}
				</div>
			{/if}

			{#if allowedToPublish}
				<form class="mt-6 space-y-5" on:submit|preventDefault={submitRide}>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label for="departure" class="block text-sm font-medium text-gray-700 mb-1">Departure</label>
							<input
								id="departure"
								type="text"
								bind:value={form.departure}
								required
								class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
							/>
						</div>
						<div>
							<label for="arrival" class="block text-sm font-medium text-gray-700 mb-1">Arrival</label>
							<input
								id="arrival"
								type="text"
								bind:value={form.arrival}
								required
								class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
							/>
						</div>
						<div>
							<label for="pickup" class="block text-sm font-medium text-gray-700 mb-1">Pickup Point</label>
							<input
								id="pickup"
								type="text"
								bind:value={form.pickup}
								required
								class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
							/>
						</div>
						<div>
							<label for="dropoff" class="block text-sm font-medium text-gray-700 mb-1">Drop-off Point</label>
							<input
								id="dropoff"
								type="text"
								bind:value={form.dropoff}
								required
								class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
							/>
						</div>
						<div>
							<label for="rideDate" class="block text-sm font-medium text-gray-700 mb-1">Date</label>
							<input
								id="rideDate"
								type="datetime-local"
								bind:value={form.rideDate}
								required
								class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
							/>
						</div>
						<div>
							<label for="seats" class="block text-sm font-medium text-gray-700 mb-1">Seats available</label>
							<input
								id="seats"
								type="number"
								min="1"
								step="1"
								bind:value={form.seats}
								required
								class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
							/>
						</div>
					</div>

					<div>
						<label for="price" class="block text-sm font-medium text-gray-700 mb-1">Price</label>
						<input
							id="price"
							type="number"
							min="0"
							step="0.01"
							bind:value={form.price}
							required
							class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
						/>
					</div>

					{#if isFemaleDriver}
					<div class="rounded-md border border-gray-200 p-3">
						<label class="inline-flex items-center gap-2 text-sm text-gray-700">
							<input
								type="checkbox"
								bind:checked={form.girlsOnly}
								class="rounded border-gray-300 text-green-600 focus:ring-green-500"
							/>
							Girls Only
						</label>
					</div>
				{/if}

					<button
						type="submit"
						disabled={submitting}
						class="w-full rounded-md bg-green-600 text-white font-medium py-2.5 hover:bg-green-700 transition-colors disabled:opacity-60"
					>
						{submitting ? 'Publishing...' : 'Publish ride'}
					</button>
				</form>
			{/if}
		</div>
	</div>
{/if}
