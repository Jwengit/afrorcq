<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import type { User } from '@supabase/supabase-js';

	type Ride = {
		id: string;
		driver_id: string;
		departure: string;
		arrival: string;
		pickup: string;
		dropoff: string;
		ride_date: string;
		seats: number;
		price: number;
		girls_only: boolean;
	};

	let currentUser: User | null = null;
	let ride: Ride | null = null;
	let loading = true;
	let bookingSeats = 1;
	let submitting = false;
	let errorMessage = '';
	let successMessage = '';

	onMount(async () => {
		const { data: { user } } = await supabase.auth.getUser();
		currentUser = user;

		if (!user && browser) {
			goto(resolve('/auth/login'));
			loading = false;
			return;
		}

		const rideId = $page.params.id;
		const { data, error } = await supabase
			.from('rides')
			.select('*')
			.eq('id', rideId)
			.maybeSingle();

		if (error || !data) {
			errorMessage = 'Ride not found.';
			loading = false;
			return;
		}

		ride = data as Ride;
		loading = false;
	});

	async function submitBooking() {
		if (!currentUser || !ride) {
			return;
		}

		errorMessage = '';
		successMessage = '';

		if (bookingSeats < 1 || bookingSeats > ride.seats) {
			errorMessage = `Please select between 1 and ${ride.seats} seats.`;
			return;
		}

		submitting = true;

		try {
			const { error } = await supabase.from('bookings').insert({
				ride_id: ride.id,
				passenger_id: currentUser.id,
				seats_booked: bookingSeats,
				status: 'Pending'
			});

			if (error) {
				console.error('Booking error:', error);
				errorMessage =
					error.message === 'Not enough seats available for this ride.'
						? 'There are no longer enough seats available for this ride.'
						: error.message || 'Failed to complete booking.';
				return;
			}

			ride = {
				...ride,
				seats: Math.max(0, ride.seats - bookingSeats)
			};

			successMessage = 'Booking request sent. Waiting for driver confirmation.';
			setTimeout(() => {
				goto(resolve('/dashboard'));
			}, 1500);
		} catch (error) {
			console.error('Unexpected error:', error);
			errorMessage = 'An unexpected error occurred.';
		} finally {
			submitting = false;
		}
	}
</script>

{#if loading}
	<div class="min-h-screen flex items-center justify-center bg-gray-50">
		<div class="text-center">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
			<p class="mt-3 text-gray-600">Loading ride details...</p>
		</div>
	</div>
{:else if !ride}
	<div class="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
		<div class="max-w-2xl mx-auto">
			<p class="text-center text-gray-600">{errorMessage}</p>
			<button
				on:click={() => goto(resolve('/search'))}
				class="mt-6 block mx-auto px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
			>
				Back to search
			</button>
		</div>
	</div>
{:else}
	<div class="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
		<div class="max-w-2xl mx-auto">
			<button
				on:click={() => goto(resolve('/search'))}
				class="mb-6 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
			>
				← Back to search
			</button>

			<div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8">
				<h1 class="text-3xl font-bold text-gray-900">{ride.departure} → {ride.arrival}</h1>
				<p class="mt-2 text-gray-600">{new Date(ride.ride_date).toLocaleString()}</p>

				<div class="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
					<div>
						<p class="text-sm text-gray-500">Pickup</p>
						<p class="text-base font-semibold text-gray-900">{ride.pickup}</p>
					</div>
					<div>
						<p class="text-sm text-gray-500">Drop-off</p>
						<p class="text-base font-semibold text-gray-900">{ride.dropoff}</p>
					</div>
					<div>
						<p class="text-sm text-gray-500">Seats available</p>
						<p class="text-base font-semibold text-gray-900">{ride.seats}</p>
					</div>
					<div>
						<p class="text-sm text-gray-500">Price per seat</p>
						<p class="text-base font-semibold text-gray-900">${ride.price}</p>
					</div>
				</div>

				{#if ride.girls_only}
					<div class="mt-6 rounded-md border border-pink-200 bg-pink-50 p-4">
						<p class="text-sm font-medium text-pink-800">⭐ This ride is for female passengers only.</p>
					</div>
				{/if}

				{#if errorMessage}
					<div class="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
						{errorMessage}
					</div>
				{/if}

				{#if successMessage}
					<div class="mt-6 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
						{successMessage}
					</div>
				{/if}

				{#if currentUser && currentUser.id !== ride.driver_id && ride.seats > 0}
					<form class="mt-8 space-y-4 border-t border-gray-200 pt-6" on:submit|preventDefault={submitBooking}>
						<div>
							<label for="seats" class="block text-sm font-medium text-gray-700 mb-2">Number of seats</label>
							<select
								id="seats"
								bind:value={bookingSeats}
								class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
							>
								{#each Array.from({ length: ride.seats }, (_, i) => i + 1) as num (num)}
									<option value={num}>{num} seat{num !== 1 ? 's' : ''}</option>
								{/each}
							</select>
						</div>

						<div class="rounded-md bg-gray-50 p-4">
							<p class="text-sm text-gray-600">Total price: <span class="text-lg font-bold text-gray-900">${bookingSeats * ride.price}</span></p>
						</div>

						<button
							type="submit"
							disabled={submitting}
							class="w-full rounded-md bg-green-600 text-white font-medium py-3 hover:bg-green-700 transition-colors disabled:opacity-60"
						>
							{submitting ? 'Booking...' : 'Book this ride'}
						</button>
					</form>
				{:else if currentUser?.id !== ride.driver_id && ride.seats === 0}
					<div class="mt-8 rounded-md border border-amber-200 bg-amber-50 p-4">
						<p class="text-sm text-amber-800">This ride is currently sold out.</p>
					</div>
				{:else if currentUser?.id === ride.driver_id}
					<div class="mt-8 rounded-md border border-blue-200 bg-blue-50 p-4">
						<p class="text-sm text-blue-800">This is your ride. You cannot book your own ride.</p>
					</div>
				{:else}
					<div class="mt-8 p-4 text-center">
						<p class="text-sm text-gray-600 mb-4">Please log in to book this ride.</p>
						<a href={resolve('/auth/login')} class="inline-block px-6 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700">
							Log in
						</a>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
