<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onDestroy, onMount } from 'svelte';
	import type { User } from '@supabase/supabase-js';
	import { user } from '$lib/authStore';
	import { supabase } from '$lib/supabaseClient';
	import {
		hasCompleteFreeMemberProfile,
		canUseVerifiedFeatures,
		resolveMemberStatus,
		hasPendingReviewBlock,
		type MemberStatus,
		VERIFIED_ONLY_MESSAGE
	} from '$lib/membershipAccess';

	type DriverProfile = {
		gender?: string | null;
		first_name?: string | null;
		last_name?: string | null;
		date_of_birth?: string | null;
		city_of_birth?: string | null;
		address?: string | null;
		zip_code?: string | null;
		bio?: string | null;
		languages?: string[] | null;
		ride_preferences?: string[] | null;
		profile_photo_url?: string | null;
		profile_photo_status?: string | null;
		car_make?: string | null;
		car_year?: string | number | null;
		color?: string | null;
		status?: string | null;
		is_verified?: boolean | null;
		membership_paid?: boolean | null;
		membership_expires_at?: string | null;
		review_pending?: boolean | null;
		review_pending_ride_id?: string | null;
		user_status?: string | null;
		suspended_until?: string | null;
	};

	type MissingRequirement =
		| 'car_info'
		| 'driver_license_front'
		| 'driver_license_back'
		| 'insurance'
		| 'vehicle_registration';

	let missingRequirements: MissingRequirement[] = [];

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
	let memberStatus: MemberStatus = 'free';
	let canPublishAsFreeMember = false;
	let freeProfileIncomplete = false;
	let needsDriverDocumentsOnly = false;
	let reviewPendingBlocked = false;
	let accountBlocked = false;
	let accountBlockedReason = '';
	let errorMessage = '';
	let successMessage = '';
	const PUBLISH_REQUEST_TIMEOUT_MS = 30_000;

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

	function refreshPublishingEligibilityOnFocus() {
		if (currentUser) {
			void loadPublishingEligibility(currentUser.id);
		}
	}

	onDestroy(() => {
		unsubscribe();
		if (browser) {
			window.removeEventListener('focus', refreshPublishingEligibilityOnFocus);
		}
	});

	onMount(async () => {
		applyPrefilledRouteFromUrl();

		await ensureAuthenticatedUser();

		if (!currentUser) {
			loading = false;
			if (browser) {
				goto(resolve('/auth/login'));
			}
			return;
		}

		if (browser) {
			window.addEventListener('focus', refreshPublishingEligibilityOnFocus);
		}
		await loadPublishingEligibility(currentUser.id);
		loading = false;
	});

	function applyPrefilledRouteFromUrl() {
		if (!browser) {
			return;
		}

		const params = new URLSearchParams(window.location.search);
		const departure = params.get('departure')?.trim() ?? '';
		const arrival = params.get('arrival')?.trim() ?? '';

		if (departure) {
			form.departure = departure;
		}

		if (arrival) {
			form.arrival = arrival;
		}
	}

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

	async function getSessionAccessToken(): Promise<string | null> {
		const {
			data: { session }
		} = await supabase.auth.getSession();
		return session?.access_token ?? null;
	}

	async function loadPublishingEligibility(userId: string) {
		errorMessage = '';
		missingRequirements = [];

		await supabase.rpc('refresh_review_pending_for_member', { p_user_id: userId });

		const { data, error } = await supabase
			.from('profiles')
			.select('first_name, last_name, gender, date_of_birth, city_of_birth, address, zip_code, bio, languages, ride_preferences, profile_photo_url, profile_photo_status, car_make, car_year, color, status, is_verified, membership_paid, membership_expires_at, review_pending, review_pending_ride_id, user_status, suspended_until')
			.eq('id', userId)
			.maybeSingle();

		if (error) {
			console.error('Profile fetch error:', error);
			allowedToPublish = false;
			return;
		}

		const profile = (data as DriverProfile | null) ?? null;
		memberStatus = resolveMemberStatus({
			status: profile?.status,
			isVerified: profile?.is_verified,
			membershipPaid: profile?.membership_paid,
			membershipExpiresAt: profile?.membership_expires_at
		});
		canPublishAsFreeMember =
			!profile?.is_verified &&
			!profile?.membership_paid &&
			(memberStatus === 'free' || memberStatus === 'pending');
		freeProfileIncomplete = false;
		if (canPublishAsFreeMember) {
			const token = await getSessionAccessToken();
			if (!token) {
				errorMessage = 'Session expired. Please sign in again.';
				allowedToPublish = false;
				return;
			}

			let phoneNumber: string | null = null;
			try {
				const contactResponse = await fetch('/api/profile', {
					headers: { Authorization: `Bearer ${token}` }
				});
				const contactPayload = await contactResponse.json();
				if (!contactResponse.ok) {
					console.error('Private profile contact load error:', contactPayload?.error);
					errorMessage = contactPayload?.error || 'Unable to load your profile details.';
					allowedToPublish = false;
					return;
				}
				phoneNumber = contactPayload?.contact?.phone_number ?? null;
			} catch (contactError) {
				console.error('Private profile contact load error:', contactError);
				errorMessage = 'Unable to load your profile details.';
				allowedToPublish = false;
				return;
			}

			freeProfileIncomplete = !hasCompleteFreeMemberProfile({
				firstName: profile?.first_name,
				lastName: profile?.last_name,
				gender: profile?.gender,
				profilePhotoApproved: profile?.profile_photo_status === 'approved',
				profilePhotoUrl: profile?.profile_photo_url,
				phoneNumber,
				dateOfBirth: profile?.date_of_birth,
				cityOfBirth: profile?.city_of_birth,
				address: profile?.address,
				zipCode: profile?.zip_code,
				bio: profile?.bio,
				languages: profile?.languages,
				ridePreferences: profile?.ride_preferences
			});
		}
		reviewPendingBlocked = hasPendingReviewBlock({
			status: profile?.status,
			isVerified: profile?.is_verified,
			membershipPaid: profile?.membership_paid,
			membershipExpiresAt: profile?.membership_expires_at,
			reviewPending: profile?.review_pending
		});
		accountBlocked = profile?.user_status === 'suspended' || profile?.user_status === 'banned';
		accountBlockedReason =
			profile?.user_status === 'banned'
				? 'Your account has been banned. You cannot publish rides.'
				: profile?.user_status === 'suspended'
					? `Your account is suspended${profile?.suspended_until ? ` until ${new Date(profile.suspended_until).toLocaleDateString()}` : ''}. You cannot publish rides during this period.`
					: '';
		isFemaleDriver = (profile?.gender ?? '').toLowerCase() === 'female';

		if (canUseVerifiedFeatures(memberStatus)) {
			const hasCarInfo =
				Boolean((profile?.car_make ?? '').toString().trim()) &&
				Boolean((profile?.car_year ?? '').toString().trim()) &&
				Boolean((profile?.color ?? '').toString().trim());

			if (!hasCarInfo) {
				missingRequirements.push('car_info');
			}

			const driverDocs: MissingRequirement[] = [
				'driver_license_front',
				'driver_license_back',
				'insurance',
				'vehicle_registration'
			];
			const { data: docs, error: docsError } = await supabase
				.from('verification_documents')
				.select('document_type, status')
				.eq('user_id', userId);

			if (!docsError && docs) {
				const approvedTypes = new Set(
					docs
						.filter((doc: { document_type?: string | null; status?: string | null }) =>
							(doc.status ?? '').toLowerCase() === 'approved'
						)
						.map((doc: { document_type?: string | null }) =>
							(doc.document_type ?? '').trim().toLowerCase()
						)
				);

				for (const docType of driverDocs) {
					if (!approvedTypes.has(docType)) missingRequirements.push(docType);
				}
			} else {
				console.error('Driver documents lookup error:', docsError);
				missingRequirements.push(...driverDocs);
			}
		}

		const missingDriverDocs = missingRequirements.filter((requirement) => requirement !== 'car_info');
		const missingCarInfo = missingRequirements.includes('car_info');
		needsDriverDocumentsOnly = canUseVerifiedFeatures(memberStatus) && !missingCarInfo && missingDriverDocs.length > 0;

		allowedToPublish =
			canPublishAsFreeMember
				? !freeProfileIncomplete && !accountBlocked && !reviewPendingBlocked
				: canUseVerifiedFeatures(memberStatus) &&
					!accountBlocked &&
					!reviewPendingBlocked &&
					!missingCarInfo &&
					missingDriverDocs.length === 0;

		if (!isFemaleDriver || !canUseVerifiedFeatures(memberStatus)) {
			form.girlsOnly = false;
		}
	}

	function swapCities() {
		const oldDeparture = form.departure;
		form.departure = form.arrival;
		form.arrival = oldDeparture;
	}

	async function submitRide() {
		if (!currentUser || !allowedToPublish) {
			if (accountBlocked) {
				errorMessage = accountBlockedReason;
			} else if (reviewPendingBlocked) {
				errorMessage = 'You have a pending review. Please rate your last trip before booking or posting a new ride.';
			} else if (canPublishAsFreeMember && freeProfileIncomplete) {
				errorMessage = 'Complete your profile and get your profile photo approved before publishing a ride.';
			} else if (!canUseVerifiedFeatures(memberStatus)) {
				errorMessage = VERIFIED_ONLY_MESSAGE;
			}
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

		if (!Number.isInteger(form.price)) {
			errorMessage = 'Price must be a whole number.';
			return;
		}

		const rideDateIso = new Date(form.rideDate).toISOString();
		if (Number.isNaN(new Date(rideDateIso).getTime())) {
			errorMessage = 'Invalid ride date.';
			return;
		}

		submitting = true;
		const publishController = new AbortController();
		const publishTimeout = window.setTimeout(
			() => publishController.abort(),
			PUBLISH_REQUEST_TIMEOUT_MS
		);

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
			}).abortSignal(publishController.signal);

			if (error) {
				if (publishController.signal.aborted) {
					errorMessage =
						'Publishing timed out. Check My rides before trying again, as your ride may already have been published.';
					return;
				}
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
			if (publishController.signal.aborted) {
				errorMessage =
					'Publishing timed out. Check My rides before trying again, as your ride may already have been published.';
				return;
			}
			console.error('Unexpected publish error:', error);
			errorMessage = 'An unexpected error occurred.';
		} finally {
			window.clearTimeout(publishTimeout);
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

			{#if !allowedToPublish}
				<div class="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
					{#if accountBlocked}
						<p class="text-sm font-semibold text-amber-800">
							{accountBlockedReason}
						</p>
					{:else if reviewPendingBlocked}
						<p class="text-sm font-semibold text-amber-800 mb-2">
							You have a pending review. Please rate your last trip before booking or posting a new ride.
						</p>
						<a
							href="/dashboard#archive"
							class="mt-3 inline-block rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
						>
							Leave a review
						</a>
					{:else if canPublishAsFreeMember && freeProfileIncomplete}
						<p class="text-sm font-semibold text-amber-800 mb-2">
							Complete your profile details and get your profile photo approved to publish rides with your free account. Driver documents are not verified for free accounts.
						</p>
						<a
							href={resolve('/profile')}
							class="mt-3 inline-block rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
						>
							Complete my profile
						</a>
					{:else if !canPublishAsFreeMember && !canUseVerifiedFeatures(memberStatus)}
						<p class="text-sm font-semibold text-amber-800 mb-2">
							{VERIFIED_ONLY_MESSAGE}
						</p>
						<a
							href={resolve('/pricing')}
							class="mt-3 inline-block rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
						>
							Become a verified member
						</a>
					{:else if canUseVerifiedFeatures(memberStatus) && needsDriverDocumentsOnly}
						<p class="text-sm font-semibold text-amber-800 mb-2">
							You need to upload your driver documents before publishing a ride.
						</p>
						<a
							href="/profile#verification-documents"
							class="mt-3 inline-block rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
						>
							Upload documents
						</a>
					{:else if canUseVerifiedFeatures(memberStatus)}
						<p class="text-sm font-semibold text-amber-800 mb-2">
							You need to complete your driver profile before publishing a ride.
						</p>
						<ul class="list-disc list-inside space-y-1 text-sm text-amber-700">
							{#if missingRequirements.includes('car_info')}
								<li>Car information (make, year, and plate number) — complete in your profile</li>
							{/if}
							{#if missingRequirements.includes('driver_license_front')}
								<li>Driver license (front) — upload and get it approved in your profile</li>
							{/if}
							{#if missingRequirements.includes('driver_license_back')}
								<li>Driver license (back) — upload and get it approved in your profile</li>
							{/if}
							{#if missingRequirements.includes('insurance')}
								<li>Insurance proof — upload and get it approved in your profile</li>
							{/if}
							{#if missingRequirements.includes('vehicle_registration')}
								<li>Vehicle registration — upload and get it approved in your profile</li>
							{/if}
						</ul>
						<a
							href="/profile"
							class="mt-3 inline-block rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
						>
							Go to my profile
						</a>
					{/if}
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
						<div class="sm:col-span-2 flex justify-center">
							<button
								type="button"
								on:click={swapCities}
								class="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
							>
								Swap cities
							</button>
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
							step="1"
							bind:value={form.price}
							required
							class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
						/>
					</div>

					{#if isFemaleDriver && canUseVerifiedFeatures(memberStatus)}
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
					{#if canPublishAsFreeMember}
						<p class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
							This ride is not safety-verified by Hizli. Members who choose to book it accept responsibility for assessing the risk.
						</p>
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