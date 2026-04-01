<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ReviewForm from '$lib/components/ReviewForm.svelte';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import type { User } from '@supabase/supabase-js';

	type Ride = {
		id: string;
		departure: string;
		arrival: string;
		ride_date: string;
		seats: number;
		price: number;
		girls_only: boolean;
	};

	type Booking = {
		id: string;
		ride_id: string;
		seat_booked: number;
		updated_at: string;
		status: 'Confirmed' | 'Pending' | 'Cancelled' | 'Rejected';
		ride: {
			departure: string;
			arrival: string;
			ride_date: string;
			price: number;
			driver_id: string;
		};
		driver: {
			id: string;
			first_name: string;
			last_name: string;
		} | null;
	};

	type DriverBookingRequest = {
		id: string;
		passenger_id: string;
		seats_booked: number;
		updated_at: string;
		status: 'Confirmed' | 'Pending' | 'Cancelled' | 'Rejected';
		passenger: {
			first_name: string;
			last_name: string;
		};
		ride: {
			id: string;
			departure: string;
			arrival: string;
			ride_date: string;
			price: number;
		};
	};
	let currentUser: User | null = null;
	let loading = true;
	let myRides: Ride[] = [];
	let ridesLoading = false;
	let myBookings: Booking[] = [];
	let bookingsLoading = false;
	let incomingRequests: DriverBookingRequest[] = [];
	let incomingRequestsLoading = false;
	let editingRideId: string | null = null;
	let savingRide = false;
	let deletingRideId: string | null = null;
	let rideActionError = '';
	let rideActionSuccess = '';
	let bookingToCancelId: string | null = null;
	let cancellingBookingId: string | null = null;
	let bookingActionMessage = '';
	let requestActionMessage = '';
	let requestActionBookingId: string | null = null;

	let myArchivedRides: Ride[] = [];
	let myArchivedBookings: Booking[] = [];
	let archivedRequests: DriverBookingRequest[] = [];
	let showArchive = false;
	let openReviewFormId: string | null = null;

	let editRideForm = {
		departure: '',
		arrival: '',
		rideDate: '',
		seats: 1,
		price: 0,
		girlsOnly: false
	};

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

		await loadMyRides(user!.id);
		await loadMyBookings(user!.id);
		await loadIncomingBookingRequests(user!.id);
		loading = false;
	});

	function openArchive() {
		showArchive = true;
	}

	function closeArchive() {
		showArchive = false;
	}

	async function loadMyRides(userId: string) {
		ridesLoading = true;
		const { data, error } = await supabase
			.from('rides')
			.select('id, departure, arrival, ride_date, seats, price, girls_only')
			.eq('driver_id', userId)
			.order('ride_date', { ascending: true });

		if (!error && data) {
			const all = data as Ride[];
			myRides = all.filter((r) => !shouldArchiveRide(r.ride_date));
			myArchivedRides = all.filter((r) => shouldArchiveRide(r.ride_date));
		}
		ridesLoading = false;
	}

	async function loadMyBookings(userId: string) {
		bookingsLoading = true;
		const { data, error } = await supabase
			.from('bookings')
			.select('id, ride_id, seats_booked, status, updated_at, ride:rides!bookings_ride_id_fkey(departure, arrival, ride_date, price, driver_id)')
			.eq('passenger_id', userId)
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Bookings load error:', error);
			bookingActionMessage = 'Could not load ride details for your bookings.';
			bookingsLoading = false;
			return;
		}

		if (data) {
				const rows = data as unknown as Array<{
					id: string;
					ride_id: string;
					seats_booked: number;
					status: Booking['status'];
					updated_at: string;
				ride:
					| {
							departure: string;
							arrival: string;
							ride_date: string;
							price: number;
							driver_id: string;
					  }
					| Array<{
						departure: string;
						arrival: string;
						ride_date: string;
						price: number;
						driver_id: string;
				  }>
					| null;
				}>;

				const driverIds = Array.from(
					new Set(
						rows
							.map((booking) => {
								const rideInfo = Array.isArray(booking.ride) ? booking.ride[0] : booking.ride;
								return rideInfo?.driver_id || '';
							})
							.filter(Boolean)
					)
				);
				const driverProfiles: Record<string, { id: string; first_name: string; last_name: string }> = {};

				if (driverIds.length > 0) {
					const { data: driverRows, error: driverError } = await supabase
						.from('profiles')
						.select('id, first_name, last_name')
						.in('id', driverIds);

					if (driverError) {
						console.error('Driver profiles load error:', driverError);
					} else if (driverRows) {
						for (const driver of driverRows) {
							driverProfiles[driver.id] = {
								id: driver.id,
								first_name: driver.first_name ?? '',
								last_name: driver.last_name ?? ''
							};
						}
					}
				}

				const allBookings = rows.map((b) => {
					const rideInfo = Array.isArray(b.ride) ? b.ride[0] : b.ride;
					const driver = rideInfo?.driver_id ? driverProfiles[rideInfo.driver_id] ?? null : null;
					return {
						id: b.id,
						ride_id: b.ride_id,
						seat_booked: b.seats_booked,
						updated_at: b.updated_at,
						status: b.status,
						ride: {
							departure: rideInfo?.departure || 'Ride unavailable',
							arrival: rideInfo?.arrival || '',
							ride_date: rideInfo?.ride_date || '',
							price: rideInfo?.price || 0,
							driver_id: rideInfo?.driver_id || ''
						},
						driver
					};
				});
				myBookings = allBookings.filter((b) => {
					if (shouldArchiveRide(b.ride.ride_date)) return false;
					if (['Cancelled', 'Rejected'].includes(b.status) && isOlderThan3Days(b.updated_at)) return false;
					return true;
				});
				myArchivedBookings = allBookings.filter((b) => {
					if (shouldArchiveRide(b.ride.ride_date)) return true;
					if (['Cancelled', 'Rejected'].includes(b.status) && isOlderThan3Days(b.updated_at)) return true;
					return false;
				});
		}
		bookingsLoading = false;
	}

	async function loadIncomingBookingRequests(userId: string) {
		incomingRequestsLoading = true;
		const { data, error } = await supabase
			.from('bookings')
			.select(
				'id, passenger_id, seats_booked, status, updated_at, ride:rides!bookings_ride_id_fkey!inner(id, driver_id, departure, arrival, ride_date, price)'
			)
			.eq('ride.driver_id', userId)
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Incoming requests load error:', error);
			requestActionMessage = 'Could not load requests for your rides.';
			incomingRequestsLoading = false;
			return;
		}

		if (data) {
			const rows = data as unknown as Array<{
				id: string;
				passenger_id: string;
				seats_booked: number;
				status: DriverBookingRequest['status'];
				updated_at: string;
				ride:
					| {
							id: string;
							driver_id: string;
							departure: string;
							arrival: string;
							ride_date: string;
							price: number;
					  }
					| Array<{
							id: string;
							driver_id: string;
							departure: string;
							arrival: string;
							ride_date: string;
							price: number;
					  }>
					| null;
			}>;

			const passengerIds = Array.from(new Set(rows.map((row) => row.passenger_id)));
			const passengerProfiles: Record<string, { first_name: string; last_name: string }> = {};

			if (passengerIds.length > 0) {
				const { data: profileRows, error: profileError } = await supabase
					.from('profiles')
					.select('id, first_name, last_name')
					.in('id', passengerIds);

				if (profileError) {
					console.error('Passenger profiles load error:', profileError);
				} else if (profileRows) {
					for (const profile of profileRows) {
						passengerProfiles[profile.id] = {
							first_name: profile.first_name ?? '',
							last_name: profile.last_name ?? ''
						};
					}
				}
			}

			const allRequests = rows.map((row) => {
				const rideInfo = Array.isArray(row.ride) ? row.ride[0] : row.ride;
				const passengerProfile = passengerProfiles[row.passenger_id];
				return {
					id: row.id,
					passenger_id: row.passenger_id,
					seats_booked: row.seats_booked,
					updated_at: row.updated_at,
					status: row.status,
					passenger: {
						first_name: passengerProfile?.first_name || '',
						last_name: passengerProfile?.last_name || ''
					},
					ride: {
						id: rideInfo?.id || '',
						departure: rideInfo?.departure || 'Ride unavailable',
						arrival: rideInfo?.arrival || '',
						ride_date: rideInfo?.ride_date || '',
						price: rideInfo?.price || 0
					}
				};
			});
			incomingRequests = allRequests.filter((r) => {
				if (shouldArchiveRide(r.ride.ride_date)) return false;
				if (['Cancelled', 'Rejected'].includes(r.status) && isOlderThan3Days(r.updated_at)) return false;
				return true;
			});
			archivedRequests = allRequests.filter((r) => {
				if (shouldArchiveRide(r.ride.ride_date)) return true;
				if (['Cancelled', 'Rejected'].includes(r.status) && isOlderThan3Days(r.updated_at)) return true;
				return false;
			});
		}

		incomingRequestsLoading = false;
	}

	async function updateIncomingRequestStatus(
		bookingId: string,
		status: 'Confirmed' | 'Rejected'
	) {
		requestActionBookingId = bookingId;
		requestActionMessage = '';

		const { error } = await supabase
			.from('bookings')
			.update({ status })
			.eq('id', bookingId);

		if (error) {
			console.error('Incoming request update error:', error);
			requestActionMessage = 'Could not update this booking request. Please try again.';
			requestActionBookingId = null;
			return;
		}

		incomingRequests = incomingRequests.map((request) =>
			request.id === bookingId ? { ...request, status } : request
		);
		requestActionBookingId = null;
		requestActionMessage =
			status === 'Confirmed'
				? 'Booking request confirmed.'
				: 'Booking request rejected.';
	}

	function isOlderThan3Days(dateStr: string): boolean {
		if (!dateStr) return false;
		const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
		return Date.now() - Date.parse(dateStr) > THREE_DAYS_MS;
	}

	// Ride is considered ended 10h after start
	function hasRideEnded(dateStr: string): boolean {
		if (!dateStr) return false;
		const timestamp = Date.parse(dateStr);
		if (Number.isNaN(timestamp)) return false;
		return timestamp + 10 * 60 * 60 * 1000 < Date.now();
	}

	// Ride archives 24h after end (= 34h after start)
	function shouldArchiveRide(dateStr: string): boolean {
		if (!dateStr) return false;
		const timestamp = Date.parse(dateStr);
		if (Number.isNaN(timestamp)) return false;
		return timestamp + 34 * 60 * 60 * 1000 < Date.now();
	}

	function formatRideDate(dateValue: string) {
		if (!dateValue) {
			return 'Date unavailable';
		}

		const parsed = new Date(dateValue);
		if (Number.isNaN(parsed.getTime())) {
			return 'Date unavailable';
		}

		return parsed.toLocaleString();
	}

	function toggleReviewForm(formId: string) {
		openReviewFormId = openReviewFormId === formId ? null : formId;
	}

	function fullName(firstName: string, lastName: string, fallback: string) {
		const combined = `${firstName} ${lastName}`.trim();
		return combined || fallback;
	}

	function startEditingRide(ride: Ride) {
		editingRideId = ride.id;
		rideActionError = '';
		rideActionSuccess = '';
		editRideForm = {
			departure: ride.departure,
			arrival: ride.arrival,
			rideDate: new Date(ride.ride_date).toISOString().slice(0, 16),
			seats: ride.seats,
			price: ride.price,
			girlsOnly: ride.girls_only
		};
	}

	function cancelEditingRide() {
		editingRideId = null;
		rideActionError = '';
	}

	async function saveRideChanges(rideId: string) {
		if (!currentUser) {
			return;
		}

		const departure = editRideForm.departure.trim();
		const arrival = editRideForm.arrival.trim();
		if (!departure || !arrival || !editRideForm.rideDate) {
			rideActionError = 'Departure, arrival, and date are required.';
			return;
		}

		if (editRideForm.seats < 0) {
			rideActionError = 'Seats cannot be negative.';
			return;
		}

		if (editRideForm.price < 0) {
			rideActionError = 'Price must be zero or positive.';
			return;
		}

		savingRide = true;
		rideActionError = '';
		rideActionSuccess = '';

		const { error } = await supabase
			.from('rides')
			.update({
				departure,
				arrival,
				ride_date: new Date(editRideForm.rideDate).toISOString(),
				seats: editRideForm.seats,
				price: editRideForm.price,
				girls_only: editRideForm.girlsOnly
			})
			.eq('id', rideId)
			.eq('driver_id', currentUser.id);

		if (error) {
			console.error('Ride update error:', error);
			rideActionError = 'Could not update this ride. Please try again.';
			savingRide = false;
			return;
		}

		myRides = myRides.map((ride) =>
			ride.id === rideId
				? {
					...ride,
					departure,
					arrival,
					ride_date: new Date(editRideForm.rideDate).toISOString(),
					seats: editRideForm.seats,
					price: editRideForm.price,
					girls_only: editRideForm.girlsOnly
				}
				: ride
		);

		rideActionSuccess = 'Ride updated successfully.';
		editingRideId = null;
		savingRide = false;
	}

	function askDeleteRide(rideId: string) {
		deletingRideId = rideId;
		rideActionError = '';
		rideActionSuccess = '';
	}

	function cancelDeleteRide() {
		deletingRideId = null;
	}

	async function confirmDeleteRide(rideId: string) {
		if (!currentUser) {
			return;
		}

		savingRide = true;
		rideActionError = '';
		rideActionSuccess = '';

		const { error } = await supabase
			.from('rides')
			.delete()
			.eq('id', rideId)
			.eq('driver_id', currentUser.id);

		if (error) {
			console.error('Ride delete error:', error);
			rideActionError = 'Could not delete this ride. Please try again.';
			savingRide = false;
			return;
		}

		myRides = myRides.filter((ride) => ride.id !== rideId);
		if (editingRideId === rideId) {
			editingRideId = null;
		}
		deletingRideId = null;
		rideActionSuccess = 'Ride deleted successfully.';
		savingRide = false;
	}

	function askCancelBooking(bookingId: string) {
		bookingToCancelId = bookingId;
		bookingActionMessage = '';
	}

	function keepBooking() {
		bookingToCancelId = null;
	}

	async function confirmCancelBooking(bookingId: string) {
		if (!currentUser) {
			return;
		}

		cancellingBookingId = bookingId;
		bookingActionMessage = '';

		const { error } = await supabase
			.from('bookings')
			.update({ status: 'Cancelled' })
			.eq('id', bookingId)
			.eq('passenger_id', currentUser.id);

		if (error) {
			console.error('Booking cancellation error:', error);
			bookingActionMessage = 'Could not cancel this booking. Please try again.';
			cancellingBookingId = null;
			return;
		}

		myBookings = myBookings.map((booking) =>
			booking.id === bookingId ? { ...booking, status: 'Cancelled' } : booking
		);

		bookingToCancelId = null;
		cancellingBookingId = null;
		bookingActionMessage = 'Booking cancelled successfully.';
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
	<div class="min-h-screen dashboard-bg py-10 px-4 sm:px-6 lg:px-8 relative">
		<div class="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.2),transparent_58%)]"></div>
		<div class="max-w-6xl mx-auto space-y-6 relative z-10">
			<section class="rounded-2xl bg-linear-to-r from-emerald-600 via-emerald-500 to-teal-500 p-6 shadow-xl border border-emerald-300/30 text-white">
				<div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
					<div>
						<p class="text-sm text-emerald-50/90">Connected as {currentUser.email}</p>
						<h1 class="text-3xl font-bold mt-1 tracking-tight">Dashboard</h1>
					</div>
				</div>

				<nav class="mt-6 border-t border-white/30 pt-4" aria-label="User dashboard navigation">
					<ul class="flex flex-wrap gap-2">
						<li>
							<a href="#my-rides" class="inline-flex items-center px-4 py-2 rounded-full bg-white/90 text-emerald-700 text-sm font-semibold hover:bg-white transition-colors">
								My rides
							</a>
						</li>
						<li>
							<a href="#ride-requests" class="inline-flex items-center px-4 py-2 rounded-full bg-white/90 text-amber-700 text-sm font-semibold hover:bg-white transition-colors">
								Booking requests
							</a>
						</li>
						<li>
							<a href="#my-bookings" class="inline-flex items-center px-4 py-2 rounded-full bg-white/90 text-sky-700 text-sm font-semibold hover:bg-white transition-colors">
								My bookings
							</a>
						</li>
					</ul>
					<button type="button" on:click={showArchive ? closeArchive : openArchive} class="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-50/90 hover:text-white">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
						{showArchive
							? 'Back to dashboard'
							: `View archive (${myArchivedRides.length + myArchivedBookings.length + archivedRequests.length})`}
					</button>
				</nav>
			</section>

			{#if !showArchive}
			<section id="my-rides" class="dashboard-card p-6 scroll-mt-28">
				<h2 class="text-xl font-semibold text-gray-900 mb-4">My rides</h2>
				{#if rideActionError}
					<p class="mb-3 text-sm text-red-600">{rideActionError}</p>
				{/if}
				{#if rideActionSuccess}
					<p class="mb-3 text-sm text-green-700">{rideActionSuccess}</p>
				{/if}
				{#if ridesLoading}
					<p class="text-sm text-gray-500">Loading rides...</p>
				{:else if myRides.length === 0}
					<p class="text-sm text-gray-500">You haven't published any rides yet.</p>
				{:else}
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						{#each myRides as ride (ride.id)}
							<article class="surface-card p-4">
								{#if editingRideId === ride.id}
									<div class="space-y-3">
										<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
											<input
												type="text"
												bind:value={editRideForm.departure}
												placeholder="Departure"
												class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
											/>
											<input
												type="text"
												bind:value={editRideForm.arrival}
												placeholder="Arrival"
												class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
											/>
										</div>
										<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
											<input
												type="datetime-local"
												bind:value={editRideForm.rideDate}
												class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
											/>
											<input
												type="number"
												min="0"
												step="1"
												bind:value={editRideForm.seats}
												class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
											/>
											<input
												type="number"
												min="0"
												step="0.01"
												bind:value={editRideForm.price}
												class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
											/>
										</div>
										<label class="inline-flex items-center gap-2 text-sm text-gray-700">
											<input
												type="checkbox"
												bind:checked={editRideForm.girlsOnly}
												class="rounded border-gray-300 text-green-600 focus:ring-green-500"
											/>
											Girls Only
										</label>
										<div class="flex gap-2">
											<button
												type="button"
												on:click={() => saveRideChanges(ride.id)}
												disabled={savingRide}
												class="px-3 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-60"
											>
												{savingRide ? 'Saving...' : 'Save'}
											</button>
											<button
												type="button"
												on:click={cancelEditingRide}
												class="px-3 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
											>
												Cancel
											</button>
										</div>
									</div>
								{:else}
									<p class="text-xs text-gray-400">{new Date(ride.ride_date).toLocaleString()}</p>
									<h3 class="text-base font-semibold text-gray-900 mt-1">{ride.departure} → {ride.arrival}</h3>
									<p class="mt-2 text-sm text-gray-600">
										{ride.seats} seat{ride.seats !== 1 ? 's' : ''} · ${ride.price}
										{#if ride.girls_only}
											<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 text-xs">Girls Only</span>
										{/if}
									</p>
									<div class="mt-3 flex flex-wrap gap-2">
										<button
											type="button"
											on:click={() => startEditingRide(ride)}
											class="px-3 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
										>
											Edit
										</button>
										{#if deletingRideId === ride.id}
											<button
												type="button"
												on:click={() => confirmDeleteRide(ride.id)}
												disabled={savingRide}
												class="px-3 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60"
											>
												{savingRide ? 'Deleting...' : 'Confirm delete'}
											</button>
											<button
												type="button"
												on:click={cancelDeleteRide}
												class="px-3 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
											>
												Cancel
											</button>
										{:else}
											<button
												type="button"
												on:click={() => askDeleteRide(ride.id)}
												class="px-3 py-2 rounded-md border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50"
											>
												Delete
											</button>
										{/if}
									</div>
								{/if}
							</article>
						{/each}
					</div>
				{/if}
			</section>

			<section id="ride-requests" class="dashboard-card p-6 scroll-mt-28">
				<h2 class="text-xl font-semibold text-gray-900 mb-4">Booking requests</h2>
				{#if requestActionMessage}
					<p class="mb-3 text-sm text-green-700">{requestActionMessage}</p>
				{/if}
				{#if incomingRequestsLoading}
					<p class="text-sm text-gray-500">Loading booking requests...</p>
				{:else if incomingRequests.length === 0}
					<p class="text-sm text-gray-500">No booking requests yet for your rides.</p>
				{:else}
					<div class="space-y-3">
						{#each incomingRequests as request (request.id)}
							<article class="surface-card p-4 flex flex-wrap flex-col md:flex-row md:items-center md:justify-between gap-3">
								<div>
									<h3 class="text-base font-semibold text-gray-900">
										{request.ride.arrival
											? `${request.ride.departure} → ${request.ride.arrival}`
											: request.ride.departure}
									</h3>
									<p class="text-sm text-gray-500 mt-1">{formatRideDate(request.ride.ride_date)}</p>
									<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
										<span>Passenger:</span>
										<a
											href={resolve(`/profile/public?id=${request.passenger_id}`)}
											class="inline-flex items-center font-medium text-green-700 hover:text-green-800"
										>
											View public profile
										</a>
									</div>
									<p class="text-sm text-gray-600 mt-1">
										{request.seats_booked} seat{request.seats_booked !== 1 ? 's' : ''}
										· {request.ride.price > 0 ? `$${request.ride.price}` : 'Price unavailable'}
									</p>
								</div>
								<div class="flex flex-wrap items-center gap-2">
									<span class="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-sm w-fit border border-slate-200">
										{request.status}
									</span>
									{#if request.status === 'Pending'}
										<button
											type="button"
											on:click={() => updateIncomingRequestStatus(request.id, 'Confirmed')}
											disabled={requestActionBookingId === request.id}
											class="px-3 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-60"
										>
											{requestActionBookingId === request.id ? 'Updating...' : 'Confirm'}
										</button>
										<button
											type="button"
											on:click={() => updateIncomingRequestStatus(request.id, 'Rejected')}
											disabled={requestActionBookingId === request.id}
											class="px-3 py-2 rounded-md border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-60"
										>
											{requestActionBookingId === request.id ? 'Updating...' : 'Reject'}
										</button>
									{/if}
									{#if request.status === 'Confirmed' && hasRideEnded(request.ride.ride_date)}
										<button
											type="button"
											on:click={() => toggleReviewForm(`active-request:${request.id}`)}
											class="rounded-md border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
										>
											{openReviewFormId === `active-request:${request.id}` ? 'Hide review form' : 'Leave a review'}
										</button>
									{/if}
								</div>
								{#if request.status === 'Confirmed' && hasRideEnded(request.ride.ride_date) && openReviewFormId === `active-request:${request.id}`}
									<div class="w-full">
										<ReviewForm
											rideId={request.ride.id}
											revieweeId={request.passenger_id}
											revieweeName={fullName(request.passenger.first_name, request.passenger.last_name, 'Passenger')}
											user={currentUser}
										/>
									</div>
								{/if}
							</article>
						{/each}
					</div>
				{/if}
			</section>

			<section id="my-bookings" class="dashboard-card p-6 scroll-mt-28">
				<h2 class="text-xl font-semibold text-gray-900 mb-4">My bookings</h2>
				{#if bookingActionMessage}
					<p class="mb-3 text-sm text-green-700">{bookingActionMessage}</p>
				{/if}
				{#if bookingsLoading}
					<p class="text-sm text-gray-500">Loading bookings...</p>
				{:else if myBookings.length === 0}
					<p class="text-sm text-gray-500">You haven't booked any rides yet.</p>
				{:else}
					<div class="space-y-3">
						{#each myBookings as booking (booking.id)}
							<article class="surface-card p-4 flex flex-wrap flex-col md:flex-row md:items-center md:justify-between gap-3">
								<div>
									<h3 class="text-base font-semibold text-gray-900">
										{booking.ride.arrival
											? `${booking.ride.departure} → ${booking.ride.arrival}`
											: booking.ride.departure}
									</h3>
									<p class="text-sm text-gray-500 mt-1">{formatRideDate(booking.ride.ride_date)}</p>
									<p class="text-sm text-gray-600 mt-1">
										{booking.seat_booked} seat{booking.seat_booked !== 1 ? 's' : ''}
										· {booking.ride.price > 0 ? `$${booking.ride.price}` : 'Price unavailable'}
									</p>
								</div>
								<div class="flex flex-wrap items-center gap-2">
									<span class="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-sm w-fit border border-slate-200">
									{booking.status}
								</span>
								{#if booking.status === 'Pending' || booking.status === 'Confirmed'}
									{#if bookingToCancelId === booking.id}
										<button
											type="button"
											on:click={() => confirmCancelBooking(booking.id)}
											disabled={cancellingBookingId === booking.id}
											class="px-3 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60"
										>
											{cancellingBookingId === booking.id ? 'Cancelling...' : 'Confirm cancel'}
										</button>
										<button
											type="button"
											on:click={keepBooking}
											class="px-3 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
										>
											Keep booking
										</button>
									{:else}
										<button
											type="button"
											on:click={() => askCancelBooking(booking.id)}
											class="px-3 py-2 rounded-md border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50"
										>
											Cancel booking
										</button>
									{/if}
								{/if}
								{#if booking.status === 'Confirmed' && hasRideEnded(booking.ride.ride_date) && booking.ride.driver_id}
									<button
										type="button"
										on:click={() => toggleReviewForm(`active-booking:${booking.id}`)}
										class="rounded-md border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
									>
										{openReviewFormId === `active-booking:${booking.id}` ? 'Hide review form' : 'Leave a review'}
									</button>
								{/if}
							</div>
							{#if booking.status === 'Confirmed' && hasRideEnded(booking.ride.ride_date) && booking.ride.driver_id && openReviewFormId === `active-booking:${booking.id}`}
								<div class="w-full">
									<ReviewForm
										rideId={booking.ride_id}
										revieweeId={booking.ride.driver_id}
										revieweeName={booking.driver ? fullName(booking.driver.first_name, booking.driver.last_name, 'Driver') : 'Driver'}
										user={currentUser}
									/>
								</div>
							{/if}
						</article>
					{/each}
				</div>
				{/if}
			</section>
			{/if}

		{#if showArchive}
		<section id="archive" class="dashboard-card p-6">
			<div class="flex items-center justify-between">
				<h2 class="text-xl font-semibold text-gray-900 flex items-center gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
					Archive
					<span class="text-sm font-normal text-gray-400">({myArchivedRides.length + myArchivedBookings.length + archivedRequests.length})</span>
				</h2>
			</div>

			{#if myArchivedRides.length === 0 && myArchivedBookings.length === 0 && archivedRequests.length === 0}
				<p class="mt-4 text-sm text-gray-500">
					No archived items yet. Rides appear here 24 hours after they end.
				</p>
			{/if}

			{#if myArchivedRides.length > 0}
					<div class="mt-5">
						<h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Rides</h3>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							{#each myArchivedRides as ride (ride.id)}
								<article class="subtle-card p-4 opacity-75">
									<p class="text-xs text-gray-400">{new Date(ride.ride_date).toLocaleString()}</p>
									<h4 class="text-base font-semibold text-gray-700 mt-1">{ride.departure} → {ride.arrival}</h4>
										<p class="mt-1 text-sm text-gray-500">{ride.seats} seat{ride.seats !== 1 ? 's' : ''} · ${ride.price}</p>
										<span class="mt-2 inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">Archived</span>
								</article>
							{/each}
						</div>
					</div>
			{/if}

			{#if archivedRequests.length > 0}
					<div class="mt-5">
						<h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Booking requests</h3>
						<div class="space-y-3">
							{#each archivedRequests as request (request.id)}
								<article class="subtle-card p-4 opacity-75">
									<p class="text-xs text-gray-400">{formatRideDate(request.ride.ride_date)}</p>
									<h4 class="text-base font-semibold text-gray-700 mt-1">
										{request.ride.departure} → {request.ride.arrival}
									</h4>
										<p class="text-sm text-gray-500 mt-1">
											Passenger: {fullName(request.passenger.first_name, request.passenger.last_name, 'Passenger')}
										</p>
									<p class="text-sm text-gray-500 mt-1">
										{request.seats_booked} seat{request.seats_booked !== 1 ? 's' : ''}
										· {request.ride.price > 0 ? `$${request.ride.price}` : 'Price unavailable'}
									</p>
										<div class="mt-2 flex flex-wrap items-center gap-2">
											<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 text-xs">{request.status}</span>
											<a
												href={resolve(`/profile/public?id=${request.passenger_id}`)}
												class="text-sm font-medium text-green-700 hover:text-green-800"
											>
												View passenger profile
											</a>
											{#if request.status === 'Confirmed'}
												<button
													type="button"
													on:click={() => toggleReviewForm(`request:${request.id}`)}
													class="rounded-md border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
												>
													{openReviewFormId === `request:${request.id}` ? 'Hide review form' : 'Leave a review'}
												</button>
											{/if}
										</div>
										{#if request.status === 'Confirmed' && openReviewFormId === `request:${request.id}`}
											<ReviewForm
												rideId={request.ride.id}
												revieweeId={request.passenger_id}
												revieweeName={fullName(request.passenger.first_name, request.passenger.last_name, 'Passenger')}
												user={currentUser}
											/>
										{/if}
								</article>
							{/each}
						</div>
					</div>
			{/if}

			{#if myArchivedBookings.length > 0}
					<div class="mt-5">
						<h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">My bookings</h3>
						<div class="space-y-3">
							{#each myArchivedBookings as booking (booking.id)}
								<article class="subtle-card p-4 opacity-75">
									<p class="text-xs text-gray-400">{formatRideDate(booking.ride.ride_date)}</p>
									<h4 class="text-base font-semibold text-gray-700 mt-1">
										{booking.ride.departure} → {booking.ride.arrival}
									</h4>
										{#if booking.driver}
											<p class="text-sm text-gray-500 mt-1">
												Driver: {fullName(booking.driver.first_name, booking.driver.last_name, 'Driver')}
											</p>
										{/if}
									<p class="text-sm text-gray-500 mt-1">
										{booking.seat_booked} seat{booking.seat_booked !== 1 ? 's' : ''}
										· {booking.ride.price > 0 ? `$${booking.ride.price}` : 'Price unavailable'}
									</p>
										<div class="mt-2 flex flex-wrap items-center gap-2">
											<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 text-xs">{booking.status}</span>
											{#if booking.ride.driver_id}
												<a
													href={resolve(`/profile/public?id=${booking.ride.driver_id}`)}
													class="text-sm font-medium text-green-700 hover:text-green-800"
												>
													View driver profile
												</a>
											{/if}
											{#if booking.status === 'Confirmed' && booking.ride.driver_id}
												<button
													type="button"
													on:click={() => toggleReviewForm(`booking:${booking.id}`)}
													class="rounded-md border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
												>
													{openReviewFormId === `booking:${booking.id}` ? 'Hide review form' : 'Leave a review'}
												</button>
											{/if}
										</div>
										{#if booking.status === 'Confirmed' && booking.ride.driver_id && openReviewFormId === `booking:${booking.id}`}
											<ReviewForm
												rideId={booking.ride_id}
												revieweeId={booking.ride.driver_id}
												revieweeName={booking.driver ? fullName(booking.driver.first_name, booking.driver.last_name, 'Driver') : 'Driver'}
												user={currentUser}
											/>
										{/if}
								</article>
							{/each}
						</div>
					</div>
			{/if}
		</section>
		{/if}

		</div>
	</div>
{/if}

<style>
	.dashboard-bg {
		background:
			radial-gradient(circle at 12% 10%, rgba(16, 185, 129, 0.08), transparent 28%),
			radial-gradient(circle at 92% 18%, rgba(14, 165, 233, 0.08), transparent 32%),
			linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
	}

	.dashboard-card {
		background: rgba(255, 255, 255, 0.94);
		border: 1px solid rgba(148, 163, 184, 0.24);
		border-radius: 1rem;
		box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
		backdrop-filter: blur(2px);
	}

	.surface-card {
		border-radius: 0.85rem;
		border: 1px solid #e2e8f0;
		background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
		box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
	}

	.subtle-card {
		border-radius: 0.85rem;
		border: 1px solid #e2e8f0;
		background: #f8fafc;
	}
</style>