<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import type { User } from '@supabase/supabase-js';

type PayPalWindow = Window & {
	paypal?: any;
};

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
let processingPayment = false;
let paypalLoaded = false;
let paymentError = '';
let errorMessage = '';
let successMessage = '';
let reportDescription = '';
let reportingRide = false;
let reportMessage = '';
let reportError = '';
const paypalClientId = import.meta.env.VITE_PUBLIC_PAYPAL_CLIENT_ID || '';

onMount(async () => {
	const {
		data: { user }
	} = await supabase.auth.getUser();
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

	if (browser && paypalClientId) {
		await loadPayPalScript();
	}

	loading = false;
});

	async function loadPayPalScript() {
		if (!browser || paypalLoaded || !paypalClientId) return;

		return new Promise<void>((resolvePromise, reject) => {
			const existingScript = document.querySelector(`script[src*="paypal.com/sdk/js"]`);
			if (existingScript) {
				paypalLoaded = Boolean((window as PayPalWindow).paypal);
				if (paypalLoaded) {
					renderPayPalButtons();
				}
				return resolvePromise();
			}

			const script = document.createElement('script');
			script.src = `https://www.paypal.com/sdk/js?client-id=${paypalClientId}&currency=USD&enable-funding=venmo`;
			script.async = true;
			script.onload = () => {
				paypalLoaded = true;
				renderPayPalButtons();
				resolvePromise();
			};
			script.onerror = () => {
				paymentError = 'Unable to load PayPal buttons.';
				reject(new Error(paymentError));
			};
			document.body.appendChild(script);
		});
	}

	function renderPayPalButtons() {
		if (!browser || !(window as PayPalWindow).paypal) return;
		const container = document.getElementById('paypal-button-container');
		if (!container) return;

		container.innerHTML = '';

		(window as PayPalWindow).paypal.Buttons({
			style: {
				layout: 'vertical',
				color: 'blue',
				shape: 'rect',
				label: 'paypal'
			},
			createOrder: async () => {
				return await createPayPalOrder();
			},
			onApprove: async (data: { orderID: string }) => {
				await capturePayPalOrder(data.orderID);
			},
			onError: (err: unknown) => {
				paymentError = err instanceof Error ? err.message : 'Payment error';
			}
		}).render(container);
	}

	async function createPayPalOrder(): Promise<string> {
		const token = await getSessionAccessToken();
		if (!token) {
			throw new Error('Session expired. Please sign in again.');
		}

		if (!ride) {
			throw new Error('Ride information unavailable.');
		}

		const response = await fetch('/api/payments/create-order', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			},
			body: JSON.stringify({ rideId: ride.id, seats: bookingSeats })
		});

		const payload = await response.json();
		if (!response.ok) {
			throw new Error(payload?.error || 'Unable to create payment order.');
		}

		return payload.orderId;
	}

	async function capturePayPalOrder(orderId: string) {
		if (!ride) {
			paymentError = 'Ride information unavailable.';
			return;
		}

		processingPayment = true;
		errorMessage = '';
		successMessage = '';
		paymentError = '';

		const token = await getSessionAccessToken();
		if (!token) {
			paymentError = 'Session expired. Please sign in again.';
			processingPayment = false;
			return;
		}

		const response = await fetch('/api/payments/capture', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			},
			body: JSON.stringify({ orderId, rideId: ride.id, seats: bookingSeats })
		});

		const payload = await response.json();
		if (!response.ok) {
			paymentError = payload?.error || 'Unable to capture payment.';
			processingPayment = false;
			return;
		}

		ride = { ...ride, seats: Math.max(0, ride.seats - bookingSeats) };
		successMessage = 'Payment captured. Booking created and awaiting driver confirmation.';
		processingPayment = false;
	}

	async function getSessionAccessToken(): Promise<string | null> {
		const {
			data: { session }
		} = await supabase.auth.getSession();

		return session?.access_token ?? null;
	}

	function goBackToSearchResults() {
		goto(resolve('/search'));
	}

	async function submitRideReport() {
		if (!ride) return;

		reportMessage = '';
		reportError = '';

		const description = reportDescription.trim();
		if (!description) {
			reportError = 'Please describe the issue.';
			return;
		}

		const token = await getSessionAccessToken();
		if (!token) {
			reportError = 'Session expired. Please sign in again.';
			goto(resolve('/auth/login'));
			return;
		}

		reportingRide = true;
		try {
			const response = await fetch('/api/reports', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					targetType: 'ride',
					targetRideId: ride.id,
					description
				})
			});

			const payload = await response.json();
			if (!response.ok) {
				reportError = payload?.error || 'Unable to send report right now.';
				return;
			}

			reportMessage = 'Report sent. Our admin team will review it.';
			reportDescription = '';
		} catch {
			reportError = 'Unexpected error while sending report.';
		} finally {
			reportingRide = false;
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

				{#if currentUser && currentUser.id !== ride.driver_id}
					<div class="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
						<p class="text-sm font-semibold text-red-900">Report this ride</p>
						<p class="text-xs text-red-700 mt-1">This text is only visible to admins.</p>
						<textarea
							bind:value={reportDescription}
							rows="3"
							maxlength="2000"
							placeholder="Describe what happened..."
							class="mt-3 w-full rounded-md border border-red-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
						></textarea>
						{#if reportError}
							<p class="mt-2 text-xs text-red-700">{reportError}</p>
						{/if}
						{#if reportMessage}
							<p class="mt-2 text-xs text-green-700">{reportMessage}</p>
						{/if}
						<button
							type="button"
							disabled={reportingRide}
							on:click={submitRideReport}
							class="mt-3 inline-flex items-center rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
						>
							{reportingRide ? 'Sending...' : 'Report ride'}
						</button>
					</div>
				{/if}

				<div class="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
					<div><p class="text-sm text-gray-500">Pickup</p><p class="text-base font-semibold text-gray-900">{ride.pickup}</p></div>
					<div><p class="text-sm text-gray-500">Drop-off</p><p class="text-base font-semibold text-gray-900">{ride.dropoff}</p></div>
					<div><p class="text-sm text-gray-500">Seats available</p><p class="text-base font-semibold text-gray-900">{ride.seats}</p></div>
					<div><p class="text-sm text-gray-500">Price per seat</p><p class="text-base font-semibold text-gray-900">${ride.price}</p></div>
				</div>

				{#if errorMessage}<div class="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMessage}</div>{/if}
				{#if successMessage}<div class="mt-6 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">{successMessage}</div>{/if}

				{#if currentUser && currentUser.id !== ride.driver_id && ride.seats > 0}
					<div class="mt-8 space-y-4 border-t border-gray-200 pt-6">
						<div>
							<label for="seats" class="block text-sm font-medium text-gray-700 mb-2">Number of seats</label>
							<select id="seats" bind:value={bookingSeats} class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500">
								{#each Array.from({ length: ride.seats }, (_, i) => i + 1) as num (num)}
									<option value={num}>{num} seat{num !== 1 ? 's' : ''}</option>
								{/each}
							</select>
						</div>
						{#if paypalClientId}
							<div class="text-sm text-gray-600">
								Total: <strong>${(ride.price * bookingSeats).toFixed(2)}</strong> USD
							</div>
							<div id="paypal-button-container" class="mt-4"></div>
							{#if paymentError}
								<p class="text-sm text-red-600 mt-2">{paymentError}</p>
							{/if}
							{#if processingPayment}
								<p class="text-sm text-gray-600 mt-2">Processing payment...</p>
							{/if}
						{:else}
							<p class="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
								Payment is currently unavailable for this ride. Please try again later.
							</p>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
