<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ReviewForm from '$lib/components/ReviewForm.svelte';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import type { User } from '@supabase/supabase-js';

	// Support form state
	let showSupportModal = false;
	let supportSubject = '';
	let supportMessage = '';
	let supportSending = false;
	let supportSendError = '';
	let supportSendSuccess = '';

	type DriverProfile = {
		gender?: string | null;
	};

	type Ride = {
		id: string;
		public_id: number | null;
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
		ride_public_id: number | null;
		seat_booked: number;
		updated_at: string;
		status: 'Confirmed' | 'Pending' | 'Cancelled' | 'Rejected';
		ride: {
			public_id: number | null;
			departure: string;
			arrival: string;
			ride_date: string;
			price: number;
			driver_id: string;
			driver_public_id: number | null;
		};
		driver: {
			id: string;
			public_id: number | null;
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
			public_id: number | null;
			first_name: string;
			last_name: string;
		};
		ride: {
			id: string;
			public_id: number | null;
			departure: string;
			arrival: string;
			ride_date: string;
			price: number;
		};
	};

	type SupportTicket = {
		id: string;
		subject: string;
		status: 'open' | 'in_progress' | 'resolved' | 'closed';
		priority: 'low' | 'normal' | 'high' | 'urgent';
		created_at: string;
		updated_at: string;
	};

	type SupportMessage = {
		id: string;
		ticket_id: string;
		sender_role: 'user' | 'admin';
		message: string;
		created_at: string;
	};

	type AdminInboxMessage = {
		id: string;
		ticketId: string;
		subject: string;
		status: string;
		senderRole: 'user' | 'admin';
		message: string;
		createdAt: string;
	};

	let currentUser: User | null = null;
	let isFemaleDriver = false;
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
	let reportActionMessage = '';
	let reportActionError = '';
	let reportingTargetId: string | null = null;

	// Report modal state
	let showReportModal = false;
	let reportModalTargetType: 'user' | 'ride' = 'user';
	let reportModalTargetId = '';
	let reportModalDescription = '';
	let reportModalSubmitting = false;

	let myArchivedRides: Ride[] = [];
	let myArchivedBookings: Booking[] = [];
	let archivedRequests: DriverBookingRequest[] = [];
	let showArchive = false;
	let openReviewFormId: string | null = null;
	let pendingArchiveReviewsCount = 0;
	let adminInboxLoading = false;
	let adminInboxError = '';
	let adminInboxMessages: AdminInboxMessage[] = [];
	let deletingAdminMessageId: string | null = null;
	let supportReplyDrafts: Record<string, string> = {};
	let supportReplySendingTicketId: string | null = null;
	let supportReplyError = '';
	let supportReplySuccess = '';

	let editRideForm = {
		departure: '',
		arrival: '',
		rideDate: '',
		seats: 1,
		price: 0,
		girlsOnly: false
	};

	let currentAccessToken: string | null = null;

	onMount(async () => {
		const {
			data: { user }
		} = await supabase.auth.getUser();

		currentUser = user;

		// Get and store access token for child components
		currentAccessToken = await getSessionAccessToken();

		if (!user && browser) {
			goto(resolve('/auth/login'));
			loading = false;
			return;
		}

		await loadDriverEligibility(user!.id);

		await loadMyRides(user!.id);
		await loadMyBookings(user!.id);
		await loadIncomingBookingRequests(user!.id);
		await refreshPendingArchiveReviewsCount();
		await loadAdminInboxMessages();
		loading = false;
	});

	async function loadAdminInboxMessages() {
		if (!currentUser) {
			adminInboxMessages = [];
			return;
		}

		adminInboxLoading = true;
		adminInboxError = '';

		try {
			const token = await getSessionAccessToken();
			if (!token) {
				adminInboxMessages = [];
				return;
			}

			const ticketsResponse = await fetch('/api/support/tickets', {
				headers: {
					Authorization: `Bearer ${token}`
				}
			});

			const ticketsPayload = await ticketsResponse.json();
			if (!ticketsResponse.ok) {
				adminInboxError = ticketsPayload?.error || 'Unable to load admin messages.';
				adminInboxMessages = [];
				return;
			}

			const tickets = ((ticketsPayload?.tickets ?? []) as SupportTicket[]).slice(0, 10);
			if (tickets.length === 0) {
				adminInboxMessages = [];
				return;
			}

			const ticketConversations = await Promise.all(
				tickets.map(async (ticket) => {
					const response = await fetch(`/api/support/tickets?ticketId=${ticket.id}`, {
						headers: {
							Authorization: `Bearer ${token}`
						}
					});

					if (!response.ok) {
						return { ticket, messages: [] as SupportMessage[] };
					}

					const payload = await response.json();
					return {
						ticket,
						messages: (payload?.messages ?? []) as SupportMessage[]
					};
				})
			);

			adminInboxMessages = ticketConversations
				.flatMap(({ ticket, messages }) =>
					messages
						.filter((msg) => (msg.message ?? '').trim().length > 0)
						.map((msg) => ({
							id: msg.id,
							ticketId: ticket.id,
							subject: ticket.subject,
							status: ticket.status,
							senderRole: msg.sender_role,
							message: msg.message,
							createdAt: msg.created_at
						}))
				)
				.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
				.slice(0, 20);
		} catch (error) {
			adminInboxError = error instanceof Error ? error.message : 'Unable to load admin messages.';
			adminInboxMessages = [];
		} finally {
			adminInboxLoading = false;
		}
	}

	async function deleteAdminInboxMessage(messageId: string) {
		if (!messageId) return;

		deletingAdminMessageId = messageId;
		adminInboxError = '';

		try {
			const token = await getSessionAccessToken();
			if (!token) {
				adminInboxError = 'Session expired. Please sign in again.';
				return;
			}

			const response = await fetch(`/api/support/tickets?messageId=${encodeURIComponent(messageId)}`, {
				method: 'DELETE',
				headers: {
					Authorization: `Bearer ${token}`
				}
			});

			const payload = await response.json();
			if (!response.ok) {
				adminInboxError = payload?.error || 'Unable to delete this message.';
				return;
			}

			adminInboxMessages = adminInboxMessages.filter((msg) => msg.id !== messageId);
		} catch (error) {
			adminInboxError = error instanceof Error ? error.message : 'Unable to delete this message.';
		} finally {
			deletingAdminMessageId = null;
		}
	}

	async function sendSupportTicket() {
		supportSendError = '';
		supportSendSuccess = '';
		supportSending = true;

		try {
			const token = await getSessionAccessToken();
			if (!token) {
				supportSendError = 'Session expired. Please sign in again.';
				return;
			}

			const res = await fetch('/api/support/tickets', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ subject: supportSubject.trim(), message: supportMessage.trim() })
			});

			const data = await res.json();
			if (!res.ok) {
				supportSendError = data?.error || 'Unable to send support ticket.';
				return;
			}

			supportSendSuccess = 'Your message has been sent to support.';
			supportSubject = '';
			supportMessage = '';
			void loadAdminInboxMessages();
			setTimeout(() => {
				showSupportModal = false;
				supportSendSuccess = '';
			}, 1200);
		} catch (error) {
			supportSendError = error instanceof Error ? error.message : 'Network error.';
		} finally {
			supportSending = false;
		}
	}

	function isReplyBlocked(status: string) {
		return status === 'resolved' || status === 'closed';
	}

	async function sendSupportReply(ticketId: string, ticketStatus: string) {
		supportReplyError = '';
		supportReplySuccess = '';

		if (isReplyBlocked(ticketStatus)) {
			supportReplyError = 'This ticket is closed. You cannot reply to resolved or closed tickets.';
			return;
		}

		const message = (supportReplyDrafts[ticketId] ?? '').trim();
		if (!message) {
			supportReplyError = 'Please enter a message before sending.';
			return;
		}

		supportReplySendingTicketId = ticketId;
		try {
			const token = await getSessionAccessToken();
			if (!token) {
				supportReplyError = 'Session expired. Please sign in again.';
				return;
			}

			const response = await fetch('/api/support/tickets', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ ticketId, message })
			});

			const payload = await response.json();
			if (!response.ok) {
				supportReplyError = payload?.error || 'Unable to send your reply.';
				return;
			}

			supportReplyDrafts = { ...supportReplyDrafts, [ticketId]: '' };
			supportReplySuccess = 'Your reply has been sent.';
			await loadAdminInboxMessages();
		} catch (error) {
			supportReplyError = error instanceof Error ? error.message : 'Network error.';
		} finally {
			supportReplySendingTicketId = null;
		}
	}

	function getArchiveReviewTargets() {
		if (!currentUser) return [] as Array<{ rideId: string; revieweeId: string }>;

		const targets: Array<{ rideId: string; revieweeId: string }> = [];

		for (const request of archivedRequests) {
			if (request.status !== 'Confirmed') continue;
			if (!request.ride.id || !request.passenger_id) continue;
			if (request.passenger_id === currentUser.id) continue;
			targets.push({ rideId: request.ride.id, revieweeId: request.passenger_id });
		}

		for (const booking of myArchivedBookings) {
			if (booking.status !== 'Confirmed') continue;
			if (!booking.ride_id || !booking.ride.driver_id) continue;
			if (booking.ride.driver_id === currentUser.id) continue;
			targets.push({ rideId: booking.ride_id, revieweeId: booking.ride.driver_id });
		}

		const seen = new Set<string>();
		return targets.filter((target) => {
			const key = `${target.rideId}:${target.revieweeId}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}

	async function refreshPendingArchiveReviewsCount() {
		if (!currentUser) {
			pendingArchiveReviewsCount = 0;
			return;
		}

		const targets = getArchiveReviewTargets();
		if (targets.length === 0) {
			pendingArchiveReviewsCount = 0;
			return;
		}

		const { data, error } = await supabase
			.from('reviews')
			.select('ride_id,reviewee_id')
			.eq('reviewer_id', currentUser.id);

		if (error) {
			console.error('Pending reviews count error:', error);
			pendingArchiveReviewsCount = targets.length;
			return;
		}

		const reviewedTargets = new Set(
			((data ?? []) as Array<{ ride_id: string; reviewee_id: string }>).map(
				(item) => `${item.ride_id}:${item.reviewee_id}`
			)
		);

		pendingArchiveReviewsCount = targets.filter(
			(target) => !reviewedTargets.has(`${target.rideId}:${target.revieweeId}`)
		).length;
	}

	async function handleReviewSubmitted() {
		await refreshPendingArchiveReviewsCount();
	}

	async function loadDriverEligibility(userId: string) {
		const { data, error } = await supabase
			.from('profiles')
			.select('gender')
			.eq('id', userId)
			.maybeSingle();

		if (error) {
			console.error('Profile gender load error:', error);
			isFemaleDriver = false;
			return;
		}

		const profile = (data as DriverProfile | null) ?? null;
		isFemaleDriver = (profile?.gender ?? '').toLowerCase() === 'female';
	}

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
			.select('id, public_id, departure, arrival, ride_date, seats, price, girls_only')
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
			.select('id, ride_id, seats_booked, status, updated_at, ride:rides!bookings_ride_id_fkey(public_id, departure, arrival, ride_date, price, driver_id)')
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
							public_id: number | null;
							departure: string;
							arrival: string;
							ride_date: string;
							price: number;
							driver_id: string;
					  }
					| Array<{
						public_id: number | null;
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
				const driverProfiles: Record<string, { id: string; public_id: number | null; first_name: string; last_name: string }> = {};

				if (driverIds.length > 0) {
					const { data: driverRows, error: driverError } = await supabase
						.from('profiles')
						.select('id, public_id, first_name, last_name')
						.in('id', driverIds);

					if (driverError) {
						console.error('Driver profiles load error:', driverError);
					} else if (driverRows) {
						for (const driver of driverRows) {
							driverProfiles[driver.id] = {
								id: driver.id,
								public_id: driver.public_id ?? null,
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
						ride_public_id: rideInfo?.public_id ?? null,
						seat_booked: b.seats_booked,
						updated_at: b.updated_at,
						status: b.status,
						ride: {
							public_id: rideInfo?.public_id ?? null,
							departure: rideInfo?.departure || 'Ride unavailable',
							arrival: rideInfo?.arrival || '',
							ride_date: rideInfo?.ride_date || '',
							price: rideInfo?.price || 0,
							driver_id: rideInfo?.driver_id || '',
							driver_public_id: driver?.public_id ?? null
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
				'id, passenger_id, seats_booked, status, updated_at, ride:rides!bookings_ride_id_fkey!inner(id, public_id, driver_id, departure, arrival, ride_date, price)'
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
							public_id: number | null;
							driver_id: string;
							departure: string;
							arrival: string;
							ride_date: string;
							price: number;
					  }
					| Array<{
							id: string;
							public_id: number | null;
							driver_id: string;
							departure: string;
							arrival: string;
							ride_date: string;
							price: number;
					  }>
					| null;
			}>;

			const passengerIds = Array.from(new Set(rows.map((row) => row.passenger_id)));
			const passengerProfiles: Record<string, { public_id: number | null; first_name: string; last_name: string }> = {};

			if (passengerIds.length > 0) {
				const { data: profileRows, error: profileError } = await supabase
					.from('profiles')
					.select('id, public_id, first_name, last_name')
					.in('id', passengerIds);

				if (profileError) {
					console.error('Passenger profiles load error:', profileError);
				} else if (profileRows) {
					for (const profile of profileRows) {
						passengerProfiles[profile.id] = {
							public_id: profile.public_id ?? null,
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
						public_id: passengerProfile?.public_id ?? null,
						first_name: passengerProfile?.first_name || '',
						last_name: passengerProfile?.last_name || ''
					},
					ride: {
						id: rideInfo?.id || '',
						public_id: rideInfo?.public_id ?? null,
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

	function toDateTimeLocalValue(dateValue: string) {
		if (!dateValue) return '';
		const parsed = new Date(dateValue);
		if (Number.isNaN(parsed.getTime())) return '';

		const year = parsed.getFullYear();
		const month = String(parsed.getMonth() + 1).padStart(2, '0');
		const day = String(parsed.getDate()).padStart(2, '0');
		const hours = String(parsed.getHours()).padStart(2, '0');
		const minutes = String(parsed.getMinutes()).padStart(2, '0');

		return `${year}-${month}-${day}T${hours}:${minutes}`;
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
			rideDate: toDateTimeLocalValue(ride.ride_date),
			seats: ride.seats,
			price: ride.price,
			girlsOnly: isFemaleDriver ? ride.girls_only : false
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

		if (!Number.isInteger(editRideForm.price)) {
			rideActionError = 'Price must be a whole number.';
			return;
		}

		savingRide = true;
		rideActionError = '';
		rideActionSuccess = '';
		const girlsOnlyValue = isFemaleDriver ? editRideForm.girlsOnly : false;
		const rideDateIso = new Date(editRideForm.rideDate).toISOString();

		const { error } = await supabase
			.from('rides')
			.update({
				departure,
				arrival,
				ride_date: rideDateIso,
				seats: editRideForm.seats,
				price: editRideForm.price,
				girls_only: girlsOnlyValue
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
					ride_date: rideDateIso,
					seats: editRideForm.seats,
					price: editRideForm.price,
					girls_only: girlsOnlyValue
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

	async function getSessionAccessToken(): Promise<string | null> {
		// Use existing token if it won't expire within 60 seconds
		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (session?.access_token) {
			const expiresAt = session.expires_at ?? 0;
			const nowSec = Math.floor(Date.now() / 1000);
			if (expiresAt - nowSec > 60) {
				return session.access_token;
			}
		}

		// Token missing or about to expire — force a refresh
		const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
		if (refreshError || !refreshed.session?.access_token) return null;
		return refreshed.session.access_token;
	}

	function notifyAdminReportsUpdated() {
		if (typeof window === 'undefined') return;

		try {
			if ('BroadcastChannel' in window) {
				const channel = new BroadcastChannel('admin-reports');
				channel.postMessage({ type: 'reports-updated', timestamp: Date.now() });
				channel.close();
			}

			const storageKey = 'admin-reports-refresh';
			window.localStorage.setItem(storageKey, String(Date.now()));
			window.localStorage.removeItem(storageKey);
		} catch {
			// No-op: refresh is best-effort.
		}
	}

	function submitReport(targetType: 'user' | 'ride', targetId: string) {
		if (!targetId) return;
		reportActionMessage = '';
		reportActionError = '';
		reportModalTargetType = targetType;
		reportModalTargetId = targetId;
		reportModalDescription = '';
		showReportModal = true;
	}

	async function submitReportFromModal() {
		const description = reportModalDescription.trim();
		if (!description) {
			reportActionError = 'Please provide a description.';
			return;
		}

		const targetType = reportModalTargetType;
		const targetId = reportModalTargetId;

		const token = await getSessionAccessToken();
		if (!token) {
			reportActionError = 'Session expired. Please sign in again.';
			showReportModal = false;
			goto(resolve('/auth/login'));
			return;
		}

		reportModalSubmitting = true;
		reportingTargetId = `${targetType}:${targetId}`;
		try {
			const body =
				targetType === 'user'
					? { targetType, targetUserId: targetId, description }
					: { targetType, targetRideId: targetId, description };

			const response = await fetch('/api/reports', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify(body)
			});

			const rawPayload = await response.text();
			let payload: { reportId?: string; error?: string } | null = null;
			if (rawPayload) {
				try {
					payload = JSON.parse(rawPayload);
				} catch {
					payload = null;
				}
			}

			if (response.ok) {
				const reportId = payload?.reportId;
				reportActionMessage = reportId
					? `Report submitted (ID: ${reportId}). Our admin team will review it.`
					: 'Report submitted. Our admin team will review it.';
				showReportModal = false;
				notifyAdminReportsUpdated();
				return;
			}

			reportActionError = `Error (${response.status}): ${payload?.error || 'Unable to send the report right now.'}`;
		} catch (err) {
			reportActionError = `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			reportingTargetId = null;
			reportModalSubmitting = false;
		}
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
					<li>
						<button type="button" class="inline-flex items-center px-4 py-2 rounded-full bg-white/90 text-indigo-700 text-sm font-semibold hover:bg-white transition-colors" on:click={() => showSupportModal = true}>
							Contact Support
						</button>
					</li>
					</ul>
					<button type="button" on:click={showArchive ? closeArchive : openArchive} class="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-50/90 hover:text-white">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
						{showArchive
							? 'Back to dashboard'
							: `View archive (${myArchivedRides.length + myArchivedBookings.length + archivedRequests.length})${pendingArchiveReviewsCount > 0 ? ` · ${pendingArchiveReviewsCount} review${pendingArchiveReviewsCount > 1 ? 's' : ''} left` : ''}`}
					</button>
				</nav>

		<!-- Contact Support modal -->
		{#if showSupportModal}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
			<div class="bg-white text-gray-900 rounded-lg shadow-lg p-6 w-full max-w-md">
				<h2 class="text-lg font-bold mb-2">Contact Support</h2>
				<form on:submit|preventDefault={sendSupportTicket}>
					<label class="block mb-2">
						<span class="text-sm font-medium">Subject</span>
						<input type="text" class="mt-1 w-full border rounded px-3 py-2 bg-white text-gray-900 placeholder-gray-500 caret-gray-900" bind:value={supportSubject} placeholder="Subject" required />
					</label>
					<label class="block mb-2">
						<span class="text-sm font-medium">Message</span>
						<textarea class="mt-1 w-full border rounded px-3 py-2 bg-white text-gray-900 placeholder-gray-500 caret-gray-900" rows="4" bind:value={supportMessage} placeholder="Describe the issue" required></textarea>
					</label>
					{#if supportSendError}
						<p class="text-red-600 text-sm mb-2">{supportSendError}</p>
					{/if}
					{#if supportSendSuccess}
						<p class="text-green-600 text-sm mb-2">{supportSendSuccess}</p>
					{/if}
					<div class="flex justify-end gap-2 mt-4">
						<button type="button" class="px-3 py-2 rounded border text-sm" on:click={() => { showSupportModal = false; supportSendError = ''; supportSendSuccess = ''; supportSubject = ''; supportMessage = ''; }}>
							Cancel
						</button>
						<button type="submit" class="px-3 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60" disabled={supportSending}>
							{supportSending ? 'Sending...' : 'Send'}
						</button>
					</div>
				</form>
			</div>
		</div>
		{/if}
			</section>

			{#if !showArchive}
			<section class="dashboard-card p-6">
				<div class="flex items-center justify-between gap-3 mb-3">
					<div>
						<h2 class="text-xl font-semibold text-gray-900">Admin messages</h2>
						<p class="text-sm text-gray-500">Private moderation and support messages visible only to your account.</p>
					</div>
					<button
						type="button"
						on:click={loadAdminInboxMessages}
						disabled={adminInboxLoading}
						class="px-3 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
					>
						{adminInboxLoading ? 'Refreshing...' : 'Refresh'}
					</button>
				</div>

				{#if adminInboxError}
					<p class="text-sm text-red-600">{adminInboxError}</p>
				{/if}
				{#if supportReplyError}
					<p class="text-sm text-red-600">{supportReplyError}</p>
				{/if}
				{#if supportReplySuccess}
					<p class="text-sm text-green-700">{supportReplySuccess}</p>
				{/if}
				{#if adminInboxLoading}
					<p class="text-sm text-gray-500">Loading messages...</p>
				{:else if adminInboxMessages.length === 0}
					<p class="text-sm text-gray-500">No admin messages for now.</p>
				{:else}
					<div class="space-y-3">
						{#each adminInboxMessages as msg (msg.id)}
							<article class="surface-card p-4">
								<div class="flex flex-wrap items-center justify-between gap-2">
									<div class="flex items-center gap-2">
										<p class="text-sm font-semibold text-gray-900">{msg.subject}</p>
										<span class={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${msg.senderRole === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700'}`}>
											{msg.senderRole === 'admin' ? 'Admin' : 'You'}
										</span>
									</div>
									<span class={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
										msg.status === 'open'
											? 'bg-yellow-100 text-yellow-700'
											: msg.status === 'in_progress'
												? 'bg-blue-100 text-blue-700'
												: msg.status === 'resolved'
													? 'bg-green-100 text-green-700'
													: 'bg-gray-100 text-gray-700'
									}`}>{msg.status}</span>
								</div>
								<div class="text-sm text-gray-700 mt-2">{@html msg.message}</div>
								<div class="mt-2 flex items-center justify-between gap-2">
									<p class="text-xs text-gray-400">{new Date(msg.createdAt).toLocaleString()}</p>
									{#if msg.senderRole === 'admin'}
										<button
											type="button"
											on:click={() => deleteAdminInboxMessage(msg.id)}
											disabled={deletingAdminMessageId === msg.id}
											class="px-2 py-1 rounded-md border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
										>
											{deletingAdminMessageId === msg.id ? 'Deleting...' : 'Delete'}
										</button>
									{/if}
								</div>
								{#if isReplyBlocked(msg.status)}
									<p class="mt-2 text-xs text-gray-500">Replies are disabled because this ticket is {msg.status}.</p>
								{:else}
									<div class="mt-3 space-y-2">
										<label class="text-xs font-medium text-gray-600" for={`reply-${msg.id}`}>Reply</label>
										<textarea
											id={`reply-${msg.id}`}
											rows="3"
											class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
											placeholder="Write your reply"
											bind:value={supportReplyDrafts[msg.ticketId]}
										></textarea>
										<div class="flex justify-end">
											<button
												type="button"
												on:click={() => sendSupportReply(msg.ticketId, msg.status)}
												disabled={supportReplySendingTicketId === msg.ticketId}
												class="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60"
											>
												{supportReplySendingTicketId === msg.ticketId ? 'Sending...' : 'Send reply'}
											</button>
										</div>
									</div>
								{/if}
							</article>
						{/each}
					</div>
				{/if}
			</section>

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
												step="1"
												bind:value={editRideForm.price}
												class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
											/>
										</div>
										{#if isFemaleDriver}
											<label class="inline-flex items-center gap-2 text-sm text-gray-700">
												<input
													type="checkbox"
													bind:checked={editRideForm.girlsOnly}
													class="rounded border-gray-300 text-green-600 focus:ring-green-500"
												/>
												Girls Only
											</label>
										{/if}
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
									<p class="mt-1 text-sm font-semibold text-red-700">Ride ID: #{ride.public_id ?? '-'}</p>
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
											<button
												type="button"
												on:click={() => goto(resolve(`/ride/${ride.id}`))}
												class="px-3 py-2 rounded-md border border-emerald-300 text-emerald-700 text-sm font-medium hover:bg-emerald-50"
											>
												View details
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
				{#if reportActionError}
					<p class="mb-3 text-sm text-red-600">{reportActionError}</p>
				{/if}
				{#if reportActionMessage}
					<p class="mb-3 text-sm text-green-700">{reportActionMessage}</p>
				{/if}
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
									<p class="text-sm font-semibold text-red-700 mt-1">Ride ID: #{request.ride.public_id ?? '-'}</p>
									<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
										<span>Passenger:</span>
										<a
											href={request.passenger.public_id ? resolve(`/profile/public?pid=${request.passenger.public_id}`) : '#'}
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
									{#if request.passenger_id && request.passenger_id !== currentUser?.id}
										<button
											type="button"
											on:click={() => submitReport('user', request.passenger_id)}
											disabled={reportingTargetId === `user:${request.passenger_id}`}
											class="px-3 py-2 rounded-md border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-60"
										>
											{reportingTargetId === `user:${request.passenger_id}` ? 'Sending...' : 'Report user'}
										</button>
									{/if}
									<button
										type="button"
										on:click={() => goto(resolve(`/ride/${request.ride.id}`))}
										class="px-3 py-2 rounded-md border border-emerald-300 text-emerald-700 text-sm font-medium hover:bg-emerald-50"
									>
										View details
									</button>
								</div>
								{#if request.status === 'Confirmed' && hasRideEnded(request.ride.ride_date) && openReviewFormId === `active-request:${request.id}`}
									<div class="w-full">
										<ReviewForm
											rideId={request.ride.id}
											revieweeId={request.passenger_id}
											revieweeName={fullName(request.passenger.first_name, request.passenger.last_name, 'Passenger')}
											user={currentUser}
											accessToken={currentAccessToken}
											onSuccess={handleReviewSubmitted}
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
				{#if reportActionError}
					<p class="mb-3 text-sm text-red-600">{reportActionError}</p>
				{/if}
				{#if reportActionMessage}
					<p class="mb-3 text-sm text-green-700">{reportActionMessage}</p>
				{/if}
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
									<p class="text-sm font-semibold text-red-700 mt-1">Ride ID: #{booking.ride_public_id ?? '-'}</p>
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
								{#if booking.ride.driver_id && booking.ride.driver_id !== currentUser?.id}
									<button
										type="button"
										on:click={() => submitReport('user', booking.ride.driver_id)}
										disabled={reportingTargetId === `user:${booking.ride.driver_id}`}
										class="px-3 py-2 rounded-md border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-60"
									>
										{reportingTargetId === `user:${booking.ride.driver_id}` ? 'Sending...' : 'Report user'}
									</button>
								{/if}
								{#if booking.ride_id}
									<button
										type="button"
										on:click={() => submitReport('ride', booking.ride_id)}
										disabled={reportingTargetId === `ride:${booking.ride_id}`}
										class="px-3 py-2 rounded-md border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-60"
									>
										{reportingTargetId === `ride:${booking.ride_id}` ? 'Sending...' : 'Report ride'}
									</button>
								{/if}
								{#if booking.ride_id}
									<button
										type="button"
										on:click={() => goto(resolve(`/ride/${booking.ride_id}`))}
										class="px-3 py-2 rounded-md border border-emerald-300 text-emerald-700 text-sm font-medium hover:bg-emerald-50"
									>
										View details
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
										accessToken={currentAccessToken}
										onSuccess={handleReviewSubmitted}
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
					{#if pendingArchiveReviewsCount > 0}
						<span class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
							{pendingArchiveReviewsCount} review{pendingArchiveReviewsCount > 1 ? 's' : ''} left to post
						</span>
					{/if}
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
												href={request.passenger.public_id ? resolve(`/profile/public?pid=${request.passenger.public_id}`) : '#'}
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
											{#if request.passenger_id && request.passenger_id !== currentUser?.id}
												<button
													type="button"
													on:click={() => submitReport('user', request.passenger_id)}
													disabled={reportingTargetId === `user:${request.passenger_id}`}
													class="px-3 py-1.5 rounded-md border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-60"
												>
													{reportingTargetId === `user:${request.passenger_id}` ? 'Sending...' : 'Report user'}
												</button>
											{/if}
										</div>
										{#if request.status === 'Confirmed' && openReviewFormId === `request:${request.id}`}
											<ReviewForm
												rideId={request.ride.id}
												revieweeId={request.passenger_id}
												revieweeName={fullName(request.passenger.first_name, request.passenger.last_name, 'Passenger')}
												user={currentUser}
												accessToken={currentAccessToken}
												onSuccess={handleReviewSubmitted}
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
													href={booking.ride.driver_public_id ? resolve(`/profile/public?pid=${booking.ride.driver_public_id}`) : '#'}
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
											{#if booking.ride.driver_id && booking.ride.driver_id !== currentUser?.id}
												<button
													type="button"
													on:click={() => submitReport('user', booking.ride.driver_id)}
													disabled={reportingTargetId === `user:${booking.ride.driver_id}`}
													class="px-3 py-1.5 rounded-md border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-60"
												>
													{reportingTargetId === `user:${booking.ride.driver_id}` ? 'Sending...' : 'Report user'}
												</button>
											{/if}
											{#if booking.ride_id}
												<button
													type="button"
													on:click={() => submitReport('ride', booking.ride_id)}
													disabled={reportingTargetId === `ride:${booking.ride_id}`}
													class="px-3 py-1.5 rounded-md border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-60"
												>
													{reportingTargetId === `ride:${booking.ride_id}` ? 'Sending...' : 'Report ride'}
												</button>
											{/if}
										</div>
										{#if booking.status === 'Confirmed' && booking.ride.driver_id && openReviewFormId === `booking:${booking.id}`}
											<ReviewForm
												rideId={booking.ride_id}
												revieweeId={booking.ride.driver_id}
												revieweeName={booking.driver ? fullName(booking.driver.first_name, booking.driver.last_name, 'Driver') : 'Driver'}
												user={currentUser}
												accessToken={currentAccessToken}
												onSuccess={handleReviewSubmitted}
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

<!-- Report modal -->
{#if showReportModal}
	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
		on:click|self={() => { if (!reportModalSubmitting) showReportModal = false; }}
	>
		<div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
			<h2 class="text-lg font-semibold text-gray-800 mb-1">
				{reportModalTargetType === 'user' ? 'Report a user' : 'Report a ride'}
			</h2>
			<p class="text-sm text-gray-500 mb-4">Your report will be reviewed by the admin team and kept confidential.</p>

			<textarea
				bind:value={reportModalDescription}
				placeholder="Describe the issue..."
				rows="4"
				disabled={reportModalSubmitting}
				class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none disabled:bg-gray-50"
			></textarea>

			{#if reportActionError}
				<p class="mt-2 text-sm text-red-600">{reportActionError}</p>
			{/if}

			<div class="mt-4 flex justify-end gap-3">
				<button
					type="button"
					disabled={reportModalSubmitting}
					on:click={() => { showReportModal = false; reportActionError = ''; }}
					class="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
				>
					Cancel
				</button>
				<button
					type="button"
					disabled={reportModalSubmitting || !reportModalDescription.trim()}
					on:click={submitReportFromModal}
					class="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
				>
					{reportModalSubmitting ? 'Sending...' : 'Submit report'}
				</button>
			</div>
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