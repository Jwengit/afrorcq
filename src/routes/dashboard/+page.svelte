<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
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
		status: 'Confirmed' | 'Pending' | 'Cancelled' | 'Rejected';
		ride: {
			departure: string;
			arrival: string;
			ride_date: string;
			price: number;
		};
	};

	type DriverBookingRequest = {
		id: string;
		passenger_id: string;
		seats_booked: number;
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

	async function loadMyRides(userId: string) {
		ridesLoading = true;
		const { data, error } = await supabase
			.from('rides')
			.select('id, departure, arrival, ride_date, seats, price, girls_only')
			.eq('driver_id', userId)
			.order('ride_date', { ascending: true });

		if (!error && data) {
			myRides = data as Ride[];
		}
		ridesLoading = false;
	}

	async function loadMyBookings(userId: string) {
		bookingsLoading = true;
		const { data, error } = await supabase
			.from('bookings')
			.select('id, ride_id, seats_booked, status, ride:rides!bookings_ride_id_fkey(departure, arrival, ride_date, price)')
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
				ride:
					| {
							departure: string;
							arrival: string;
							ride_date: string;
							price: number;
					  }
					| Array<{
						departure: string;
						arrival: string;
						ride_date: string;
						price: number;
				  }>
					| null;
				}>;

				myBookings = rows.map((b) => {
				const rideInfo = Array.isArray(b.ride) ? b.ride[0] : b.ride;

					return {
						id: b.id,
						ride_id: b.ride_id,
						seat_booked: b.seats_booked,
						status: b.status,
						ride: {
						departure: rideInfo?.departure || 'Ride unavailable',
						arrival: rideInfo?.arrival || '',
							ride_date: rideInfo?.ride_date || '',
							price: rideInfo?.price || 0
						}
					};
				});
		}
		bookingsLoading = false;
	}

	async function loadIncomingBookingRequests(userId: string) {
		incomingRequestsLoading = true;
		const { data, error } = await supabase
			.from('bookings')
			.select(
				'id, passenger_id, seats_booked, status, ride:rides!bookings_ride_id_fkey!inner(id, driver_id, departure, arrival, ride_date, price)'
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

			incomingRequests = rows.map((row) => {
				const rideInfo = Array.isArray(row.ride) ? row.ride[0] : row.ride;
				const passengerProfile = passengerProfiles[row.passenger_id];

				return {
					id: row.id,
					passenger_id: row.passenger_id,
					seats_booked: row.seats_booked,
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

	async function signOut() {
		await supabase.auth.signOut();
		goto(resolve('/auth/login'));
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
	<div class="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
		<div class="max-w-6xl mx-auto space-y-6">
			<section class="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
				<div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
					<div>
						<p class="text-sm text-gray-500">Connected as {currentUser.email}</p>
						<h1 class="text-3xl font-bold text-gray-900 mt-1">Dashboard</h1>
					</div>
					<div class="flex gap-3">
						<button
							type="button"
							on:click={signOut}
							class="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-black"
						>
							Sign out
						</button>
					</div>
				</div>

				<nav class="mt-6 border-t border-gray-100 pt-4" aria-label="User dashboard navigation">
					<ul class="flex flex-wrap gap-2">
						<li>
							<a href="#my-rides" class="inline-flex items-center px-4 py-2 rounded-full bg-green-100 text-green-800 text-sm font-medium hover:bg-green-200">
								My rides
							</a>
						</li>
						<li>
							<a href="#ride-requests" class="inline-flex items-center px-4 py-2 rounded-full bg-amber-100 text-amber-800 text-sm font-medium hover:bg-amber-200">
								Booking requests
							</a>
						</li>
						<li>
							<a href="#my-bookings" class="inline-flex items-center px-4 py-2 rounded-full bg-blue-100 text-blue-800 text-sm font-medium hover:bg-blue-200">
								My bookings
							</a>
						</li>
					</ul>
				</nav>
			</section>

			<section id="my-rides" class="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
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
							<article class="rounded-lg border border-gray-200 p-4">
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

			<section id="ride-requests" class="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
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
							<article class="rounded-lg border border-gray-200 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
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
									<span class="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-sm w-fit">
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
								</div>
							</article>
						{/each}
					</div>
				{/if}
			</section>

			<section id="my-bookings" class="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
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
							<article class="rounded-lg border border-gray-200 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
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
								<span class="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-sm w-fit">
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
							</div>
						</article>
					{/each}
				</div>
				{/if}
			</section>

		</div>
	</div>
{/if}