<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import type { User } from '@supabase/supabase-js';
	import ReviewForm from '$lib/components/ReviewForm.svelte';
	import ReviewsSection from '$lib/components/ReviewsSection.svelte';

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

	type PassengerTarget = { id: string; name: string };

	let currentUser: User | null = null;
	let ride: Ride | null = null;
	let loading = true;
	let bookingSeats = 1;
	let submitting = false;
	let errorMessage = '';
	let successMessage = '';
	let driverFirstName = '';
	let driverLastName = '';
	let userBooked = false;
	let rideInPast = false;
	let driverTargets: PassengerTarget[] = [];
	let selectedPassengerId = '';

	onMount(async () => {
		const { data: { user } } = await supabase.auth.getUser();
		currentUser = user;

		if (!user && browser) {
			goto(resolve('/auth/login'));
			loading = false;
			return;
		}

		const rideId = $page.params.id;
		const { data, error } = await supabase.from('rides').select('*').eq('id', rideId).maybeSingle();

		if (error || !data) {
			errorMessage = 'Ride not found.';
			loading = false;
			return;
		}

		ride = data as Ride;
		rideInPast = new Date(ride.ride_date).getTime() < Date.now();

		const { data: driverData } = await supabase
			.from('profiles')
			.select('first_name,last_name')
			.eq('id', ride.driver_id)
			.maybeSingle();
		driverFirstName = driverData?.first_name ?? '';
		driverLastName = driverData?.last_name ?? '';

		if (currentUser) {
			const { data: myBooking } = await supabase
				.from('bookings')
				.select('id,status')
				.eq('ride_id', ride.id)
				.eq('passenger_id', currentUser.id)
				.eq('status', 'Confirmed')
				.maybeSingle();
			userBooked = !!myBooking;

			if (currentUser.id === ride.driver_id) {
				const { data: rows } = await supabase
					.from('bookings')
					.select('passenger_id,status')
					.eq('ride_id', ride.id)
					.eq('status', 'Confirmed');

				const ids = Array.from(new Set((rows || []).map((r) => r.passenger_id)));
				if (ids.length > 0) {
					const { data: profiles } = await supabase
						.from('profiles')
						.select('id,first_name,last_name')
						.in('id', ids);

					driverTargets = (profiles || []).map((p) => ({
						id: p.id,
						name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Passenger'
					}));
					selectedPassengerId = driverTargets[0]?.id || '';
				}
			}
		}

		loading = false;
	});

	async function submitBooking() {
		if (!currentUser || !ride) return;

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
				errorMessage =
					error.message === 'Not enough seats available for this ride.'
						? 'There are no longer enough seats available for this ride.'
						: error.message || 'Failed to complete booking.';
				return;
			}

			ride = { ...ride, seats: Math.max(0, ride.seats - bookingSeats) };
			successMessage = 'Booking request sent. Waiting for driver confirmation.';
		} catch {
			errorMessage = 'An unexpected error occurred.';
		} finally {
			submitting = false;
		}
	}

	function selectedPassengerName() {
		return driverTargets.find((p) => p.id === selectedPassengerId)?.name || 'Passenger';
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
			<button on:click={() => goto(resolve('/search'))} class="mt-6 block mx-auto px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700">Back to search</button>
		</div>
	</div>
{:else}
	<div class="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
		<div class="max-w-2xl mx-auto">
			<button on:click={() => goto(resolve('/search'))} class="mb-6 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">Back to search</button>

			<div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8">
				<h1 class="text-3xl font-bold text-gray-900">{ride.departure} to {ride.arrival}</h1>
				<p class="mt-2 text-gray-600">{new Date(ride.ride_date).toLocaleString()}</p>

				<div class="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
					<div><p class="text-sm text-gray-500">Pickup</p><p class="text-base font-semibold text-gray-900">{ride.pickup}</p></div>
					<div><p class="text-sm text-gray-500">Drop-off</p><p class="text-base font-semibold text-gray-900">{ride.dropoff}</p></div>
					<div><p class="text-sm text-gray-500">Seats available</p><p class="text-base font-semibold text-gray-900">{ride.seats}</p></div>
					<div><p class="text-sm text-gray-500">Price per seat</p><p class="text-base font-semibold text-gray-900">${ride.price}</p></div>
				</div>

				{#if errorMessage}<div class="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMessage}</div>{/if}
				{#if successMessage}<div class="mt-6 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">{successMessage}</div>{/if}

				{#if currentUser && currentUser.id !== ride.driver_id && ride.seats > 0}
					<form class="mt-8 space-y-4 border-t border-gray-200 pt-6" on:submit|preventDefault={submitBooking}>
						<div>
							<label for="seats" class="block text-sm font-medium text-gray-700 mb-2">Number of seats</label>
							<select id="seats" bind:value={bookingSeats} class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500">
								{#each Array.from({ length: ride.seats }, (_, i) => i + 1) as num (num)}
									<option value={num}>{num} seat{num !== 1 ? 's' : ''}</option>
								{/each}
							</select>
						</div>
						<button type="submit" disabled={submitting} class="w-full rounded-md bg-green-600 text-white font-medium py-3 hover:bg-green-700 transition-colors disabled:opacity-60">{submitting ? 'Booking...' : 'Book this ride'}</button>
					</form>
				{/if}

				{#if currentUser && rideInPast && userBooked && currentUser.id !== ride.driver_id}
					<ReviewForm rideId={ride.id} revieweeId={ride.driver_id} revieweeName={`${driverFirstName} ${driverLastName}`.trim() || 'Driver'} user={currentUser} onSuccess={undefined} />
				{/if}

				{#if currentUser && rideInPast && currentUser.id === ride.driver_id && driverTargets.length > 0}
					<div class="mt-6 border-t border-gray-200 pt-6">
						<label for="review-target" class="block text-sm font-medium text-gray-700 mb-2">Review a passenger</label>
						<select id="review-target" bind:value={selectedPassengerId} class="w-full rounded-md border border-gray-300 px-3 py-2">
							{#each driverTargets as p (p.id)}
								<option value={p.id}>{p.name}</option>
							{/each}
						</select>
						{#if selectedPassengerId}
							<ReviewForm rideId={ride.id} revieweeId={selectedPassengerId} revieweeName={selectedPassengerName()} user={currentUser} onSuccess={undefined} />
						{/if}
					</div>
				{/if}
			</div>

			<ReviewsSection userId={ride.driver_id} userName={`${driverFirstName} ${driverLastName}`.trim()} />
		</div>
	</div>
{/if}
