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
	let processingPaymentReturn = false;
	let errorMessage = '';
	let successMessage = '';
	let paymentMethod: 'paypal' | 'venmo' = 'paypal';
	let processedOrderId: string | null = null;

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

		const paymentState = $page.url.searchParams.get('payment');
		const orderId = $page.url.searchParams.get('token');

		if (paymentState === 'cancelled') {
			errorMessage = 'Payment was cancelled. No booking was created.';
			if (orderId) {
				await markPaymentAsCancelled(orderId);
			}
			await goto(resolve(`/ride/${ride.id}`), { replaceState: true, noScroll: true, keepFocus: true });
		}

		if (paymentState === 'success' && orderId && processedOrderId !== orderId) {
			processedOrderId = orderId;
			await captureReturnedPayment(orderId, ride.id);
		}

		loading = false;
	});

	async function getAccessToken() {
		const {
			data: { session }
		} = await supabase.auth.getSession();
		return session?.access_token || null;
	}

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
			const token = await getAccessToken();
			if (!token) {
				errorMessage = 'Your session has expired. Please sign in again.';
				return;
			}

			const response = await fetch('/api/payments/create-order', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					ride_id: ride.id,
					seats_booked: bookingSeats,
					payment_method: paymentMethod
				})
			});

			const payload = (await response.json()) as { error?: string; approval_url?: string };

			if (!response.ok || !payload.approval_url) {
				errorMessage = payload.error || 'Failed to initialize payment.';
				return;
			}

			window.location.href = payload.approval_url;
		} catch {
			errorMessage = 'An unexpected error occurred.';
		} finally {
			submitting = false;
		}
	}

	async function captureReturnedPayment(orderId: string, rideId: string) {
		processingPaymentReturn = true;
		errorMessage = '';
		successMessage = '';

		try {
			const token = await getAccessToken();
			if (!token) {
				errorMessage = 'Your session has expired. Please sign in again.';
				return;
			}

			const response = await fetch('/api/payments/capture', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ order_id: orderId })
			});

			const payload = (await response.json()) as { error?: string; success?: boolean };

			if (!response.ok || !payload.success) {
				errorMessage = payload.error || 'Payment capture failed.';
				return;
			}

			successMessage =
				'Payment captured successfully. Funds are held on the platform and will be released manually for this MVP.';

			const { data, error } = await supabase.from('rides').select('*').eq('id', rideId).maybeSingle();
			if (!error && data) {
				ride = data as Ride;
			}

			await goto(resolve(`/ride/${rideId}`), { replaceState: true, noScroll: true, keepFocus: true });
		} catch {
			errorMessage = 'An unexpected error occurred while finalizing payment.';
		} finally {
			processingPaymentReturn = false;
		}
	}

	async function markPaymentAsCancelled(orderId: string) {
		try {
			const token = await getAccessToken();
			if (!token) {
				return;
			}

			await fetch('/api/payments/cancel', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ order_id: orderId })
			});
		} catch (error) {
			console.error('Failed to mark payment cancelled:', error);
		}
	}

	function goBackToSearchResults() {
		goto(resolve('/search'));
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
			<button
				on:click={goBackToSearchResults}
				class="mb-6 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
			>
				← Back to search results
			</button>

			<div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8">
				<h1 class="text-3xl font-bold text-gray-900">{ride.departure} to {ride.arrival}</h1>
				<p class="mt-2 text-gray-600">{new Date(ride.ride_date).toLocaleString()}</p>
				<div class="mt-4">
					<button
						type="button"
						on:click={() => ride && goto(resolve(`/profile/public?id=${encodeURIComponent(ride.driver_id)}`))}
						class="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
					>
						View driver public profile
					</button>
				</div>

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
						<div>
							<p class="block text-sm font-medium text-gray-700 mb-2">Payment method</p>
							<div class="grid grid-cols-2 gap-3">
								<label class="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm">
									<input type="radio" bind:group={paymentMethod} value="paypal" />
									<span>PayPal</span>
								</label>
								<label class="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm">
									<input type="radio" bind:group={paymentMethod} value="venmo" />
									<span>Venmo</span>
								</label>
							</div>
						</div>
						<div class="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
							Total now: ${(Number(ride.price) * bookingSeats).toFixed(2)}. Payment is captured immediately and held on platform until manual release.
						</div>
						<button type="submit" disabled={submitting || processingPaymentReturn} class="w-full rounded-md bg-green-600 text-white font-medium py-3 hover:bg-green-700 transition-colors disabled:opacity-60">{submitting ? 'Redirecting to payment...' : processingPaymentReturn ? 'Finalizing payment...' : 'Pay and book this ride'}</button>
					</form>
				{/if}
			</div>
		</div>
	</div>
{/if}
