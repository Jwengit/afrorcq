<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import {
		resolveMemberStatus,
		canUseVerifiedFeatures,
		canAccessGirlsOnlyRides,
		type MemberStatus,
		VERIFIED_ONLY_MESSAGE
	} from '$lib/membershipAccess';
	import type { User } from '@supabase/supabase-js';

type Ride = {
	id: string;
	public_id: number | null;
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

type DriverPublicProfile = {
	public_id: number | null;
	first_name: string | null;
	last_name: string | null;
	profile_photo_url: string | null;
	status?: string | null;
	is_verified?: boolean | null;
	membership_paid?: boolean | null;
	membership_expires_at?: string | null;
};

let currentUser: User | null = null;
let ride: Ride | null = null;
let loading = true;
let bookingSeats = 1;
let processingBooking = false;
let errorMessage = '';
let successMessage = '';
let reportDescription = '';
let reportingRide = false;
let reportMessage = '';
let reportError = '';
let driverPublicProfileId: number | null = null;
let driverName = 'Driver';
let driverIsVerifiedMember = false;
let currentMemberStatus: MemberStatus = 'free';
let currentUserGender = '';

$: bookingTotalAmount = ride ? ride.price * bookingSeats : 0;

function parsePositiveInt(value: string): number | null {
	if (!/^\d+$/.test(value)) {
		return null;
	}

	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return null;
	}

	return parsed;
}

async function getSessionAccessToken(): Promise<string | null> {
	const {
		data: { session }
	} = await supabase.auth.getSession();
	return session?.access_token ?? null;
}

onMount(async () => {
	const {
		data: { user }
	} = await supabase.auth.getUser();
	currentUser = user;

	if (user) {
		const { data: profile } = await supabase
			.from('profiles')
			.select('gender, status, is_verified, membership_paid, membership_expires_at')
			.eq('id', user.id)
			.maybeSingle();

		currentUserGender = (profile?.gender ?? '').toLowerCase();
		currentMemberStatus = resolveMemberStatus({
			status: profile?.status,
			isVerified: profile?.is_verified,
			membershipPaid: profile?.membership_paid,
			membershipExpiresAt: profile?.membership_expires_at
		});
	}

	if (!user && browser) {
		goto(resolve('/auth/login'));
		loading = false;
		return;
	}

	const routeRideId = $page.params.id ?? '';
	const ridePublicId = parsePositiveInt(routeRideId);
	let rideQuery = supabase.from('rides').select('*');

	if (ridePublicId) {
		rideQuery = rideQuery.eq('public_id', ridePublicId);
	} else {
		rideQuery = rideQuery.eq('id', routeRideId);
	}

	const { data, error } = await rideQuery.maybeSingle();

	if (error || !data) {
		errorMessage = 'Ride not found.';
		loading = false;
		return;
	}

	ride = data as Ride;

	const { data: driverProfile } = await supabase
		.from('profiles')
		.select('public_id, first_name, last_name, profile_photo_url, status, is_verified, membership_paid, membership_expires_at')
		.eq('id', ride.driver_id)
		.maybeSingle();

	const typedDriver = (driverProfile as DriverPublicProfile | null) ?? null;
	driverPublicProfileId = typedDriver?.public_id ?? null;
	driverName = `${typedDriver?.first_name ?? ''} ${typedDriver?.last_name ?? ''}`.trim() || 'Driver';
	driverIsVerifiedMember =
		resolveMemberStatus({
			status: typedDriver?.status,
			isVerified: typedDriver?.is_verified,
			membershipPaid: typedDriver?.membership_paid,
			membershipExpiresAt: typedDriver?.membership_expires_at
		}) === 'verified' &&
		Boolean(typedDriver?.profile_photo_url?.trim());

	loading = false;
});
	async function createBooking() {
		if (!ride) {
			errorMessage = 'Ride information unavailable.';
			return;
		}

		if (!currentUser) {
			errorMessage = 'Session expired. Please sign in again.';
			goto(resolve('/auth/login'));
			return;
		}

		if (bookingSeats > ride.seats) {
			errorMessage = 'Not enough seats available.';
			return;
		}

		processingBooking = true;
		errorMessage = '';
		successMessage = '';

		const { error } = await supabase.from('bookings').insert({
			ride_id: ride.id,
			passenger_id: currentUser.id,
			seats_booked: bookingSeats,
			status: 'Pending'
		});

		if (error) {
			errorMessage = error.message || 'Unable to submit booking.';
			processingBooking = false;
			return;
		}

		ride = { ...ride, seats: Math.max(0, ride.seats - bookingSeats) };
		successMessage = 'Booking request sent successfully. It is now awaiting driver confirmation.';
		processingBooking = false;
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

			const reportId = payload?.reportId;
			reportMessage = reportId
				? `Report sent (ID: ${reportId}). Our admin team will review it.`
				: 'Report sent. Our admin team will review it.';
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
				<div class="mt-4 flex flex-wrap items-center gap-2">
					<p class="text-sm font-semibold text-slate-800">{driverName}</p>
					{#if driverIsVerifiedMember}
						<span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
							<svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
								<path fill-rule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.02 7.02a1 1 0 01-1.415 0L4.29 9.752a1 1 0 111.415-1.415l3.271 3.272 6.313-6.313a1 1 0 011.415-.006z" clip-rule="evenodd" />
							</svg>
							Verified member
						</span>
					{/if}
				</div>
				<div class="mt-3">
					{#if canUseVerifiedFeatures(currentMemberStatus)}
						<button
							type="button"
							on:click={() =>
								driverPublicProfileId && goto(resolve(`/profile/public?pid=${driverPublicProfileId}`))}
							disabled={!driverPublicProfileId}
							class="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
						>
							View driver public profile
						</button>
					{/if}
				</div>

				<div class="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
					<div><p class="text-sm text-gray-500">Pickup</p><p class="text-base font-semibold text-gray-900">{ride.pickup}</p></div>
					<div><p class="text-sm text-gray-500">Drop-off</p><p class="text-base font-semibold text-gray-900">{ride.dropoff}</p></div>
					<div><p class="text-sm text-gray-500">Seats available</p><p class="text-base font-semibold text-gray-900">{ride.seats}</p></div>
					<div><p class="text-sm text-gray-500">Price per seat</p><p class="text-base font-semibold text-gray-900">${ride.price}</p></div>
				</div>

				{#if errorMessage}<div class="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMessage}</div>{/if}
				{#if successMessage}<div class="mt-6 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">{successMessage}</div>{/if}

				{#if currentUser && currentUser.id !== ride.driver_id && ride.girls_only && !canAccessGirlsOnlyRides(currentMemberStatus, currentUserGender)}
					<div class="mt-8 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
						<p>{VERIFIED_ONLY_MESSAGE}</p>
						<a href="/pricing" class="mt-2 inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">Upgrade now</a>
					</div>
				{:else if currentUser && currentUser.id !== ride.driver_id && ride.seats > 0}
					<div class="mt-8 space-y-4 border-t border-gray-200 pt-6">
						<h2 class="text-lg font-semibold text-gray-900">Book this ride</h2>
						<div>
							<label for="seats" class="block text-sm font-medium text-gray-700 mb-2">Number of seats</label>
							<select id="seats" bind:value={bookingSeats} class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500">
								{#each Array.from({ length: ride.seats }, (_, i) => i + 1) as num (num)}
									<option value={num}>{num} seat{num !== 1 ? 's' : ''}</option>
								{/each}
							</select>
						</div>
						<div class="space-y-1 text-sm text-gray-600">
							<p>Total for this booking: <strong>${bookingTotalAmount.toFixed(2)}</strong> USD</p>
							<p class="text-emerald-700">No online payment is required. Members arrange payment directly between each other.</p>
						</div>
						<button
							type="button"
							on:click={createBooking}
							disabled={processingBooking}
							class="mt-3 inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
						>
							{processingBooking ? 'Submitting...' : 'Confirm booking'}
						</button>
					</div>
				{:else if currentUser && currentUser.id !== ride.driver_id && ride.seats <= 0}
					<div class="mt-8 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
						No seats are available for this ride.
					</div>
				{/if}

				{#if currentUser && currentUser.id !== ride.driver_id}
					<details class="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
						<summary class="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-900">
							Want to report this ride?
						</summary>
						<p class="mt-3 text-xs text-gray-500">Your report is confidential and only visible to admins.</p>
						<textarea
							bind:value={reportDescription}
							rows="3"
							maxlength="2000"
							placeholder="Describe the issue with this ride..."
							class="mt-3 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
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
							class="mt-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60"
						>
							{reportingRide ? 'Sending...' : 'Send report'}
						</button>
					</details>
				{/if}
			</div>
		</div>
	</div>
{/if}
