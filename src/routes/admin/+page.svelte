<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabaseClient';
	import { user } from '$lib/authStore';
	import type { User } from '@supabase/supabase-js';

	let currentUser: User | null = null;
	let loading = true;
	let isAdmin = false;
	let accessError = '';
	let activeTab = 'overview';

	type AdminUser = {
		id: string;
		first_name: string | null;
		last_name: string | null;
		email: string | null;
		phone_number: string | null;
		is_admin: boolean | null;
		is_verified: boolean | null;
		user_status: string | null;
		average_rating: number | null;
		created_at: string | null;
		has_profile?: boolean;
	};

	let usersLoading = false;
	let usersError = '';
	let usersActionMessage = '';
	let userSearch = '';
	let users: AdminUser[] = [];
	let actionUserId: string | null = null;
	let statsError = '';

	// Modal states
	let showProfileModal = false;
	let selectedProfile: AdminUser | null = null;
	let profileRides: any[] = [];
	let profileBookings: any[] = [];
	type AdminVerificationDocument = {
		id: string;
		user_id: string;
		document_type: string;
		file_name: string;
		storage_path: string;
		mime_type: string | null;
		file_size: number | null;
		status: 'pending' | 'approved' | 'rejected';
		admin_note: string | null;
		reviewed_by: string | null;
		reviewed_at: string | null;
		created_at: string;
		updated_at: string;
		signed_url?: string | null;
	};
	let profileDocuments: AdminVerificationDocument[] = [];
	let profileDocumentsLoading = false;
	let profileDocumentsError = '';
	let profileDocumentsMessage = '';
	let profileDocumentActionId: string | null = null;
	const documentTypeLabelMap: Record<string, string> = {
		identity_card: 'Identity card',
		driver_license: 'Driver license',
		proof_of_address: 'Proof of address',
		insurance: 'Insurance proof',
		vehicle_registration: 'Vehicle registration',
		other: 'Other document',
		identity: 'Identity card',
		id_card: 'Identity card',
		license: 'Driver license',
		driving_license: 'Driver license',
		proof_address: 'Proof of address',
		residence_proof: 'Proof of address',
		insurance_proof: 'Insurance proof',
		registration: 'Vehicle registration',
		vehicle_papers: 'Vehicle registration'
	};
	let ridesLoading = false;
	let statusActionInProgress = false;
	let statusActionMessage = '';

	// Rides management
	type AdminRide = {
		id: string;
		city_from: string;
		city_to: string;
		ride_date: string;
		price: number;
		available_seats: number;
		driver_id: string;
		status: string;
		bookedSeats: number;
		profiles: {
			first_name: string | null;
			last_name: string | null;
			email: string | null;
		};
	};

	let ridesManagementLoading = false;
	let ridesManagementError = '';
	let ridesManagementActionMessage = '';
	let rides: AdminRide[] = [];
	let filteredRides: AdminRide[] = [];
	let rideFilterCityFrom = '';
	let rideFilterCityTo = '';
	let rideFilterStatus = '';
	let rideFilterFromDate = '';
	let selectedRideForBookings: AdminRide | null = null;
	let showRideBookingsModal = false;
	let rideBookings: any[] = [];
	let rideBookingsLoading = false;
	let deletingRideId: string | null = null;

	// Bookings/Reservations management
	type AdminBooking = {
		id: string;
		ride_id: string;
		user_id: string;
		seats_booked: number;
		status: string;
		created_at: string;
		rides: {
			id: string;
			city_from: string;
			city_to: string;
			ride_date: string;
			price: number;
			driver_id: string;
		};
		profiles: {
			first_name: string | null;
			last_name: string | null;
			email: string | null;
		};
	};

	let bookingsLoading = false;
	let bookingsError = '';
	let bookingsActionMessage = '';
	let bookings: AdminBooking[] = [];
	let filteredBookings: AdminBooking[] = [];
	let bookingFilterStatus = '';
	let bookingFilterFromDate = '';
	let selectedBooking: AdminBooking | null = null;
	let showBookingDetailsModal = false;
	let selectedBookingRider: AdminUser | null = null;
	let riderDetailsLoading = false;

	// Reports management
	type AdminReport = {
		id: string;
		user_id: string | null;
		ride_id: string | null;
		type: string;
		description: string | null;
		status: string;
		action_taken: string | null;
		admin_note: string | null;
		created_at: string;
		updated_at: string;
		profiles?: {
			first_name: string | null;
			last_name: string | null;
			email: string | null;
		} | null;
		rides?: {
			city_from: string | null;
			city_to: string | null;
			ride_date: string | null;
		} | null;
	};

	let reportsLoading = false;
	let reportsError = '';
	let reportActionMessage = '';
	let reports: AdminReport[] = [];
	let filteredReports: AdminReport[] = [];
	let reportFilterType = '';
	let reportFilterStatus = '';
	let reportActionId: string | null = null;
	let showReportHistoryModal = false;
	let selectedReportHistory: AdminReport | null = null;

	// Reviews moderation
	type AdminReview = {
		id: string;
		reviewer_id: string;
		reviewee_id: string;
		ride_id: string;
		rating: number;
		comment: string | null;
		status: 'pending' | 'approved' | 'rejected';
		admin_note: string | null;
		reviewed_by: string | null;
		reviewed_at: string | null;
		created_at: string;
		updated_at: string;
		reviewer_profile?: {
			first_name: string | null;
			last_name: string | null;
			email: string | null;
		} | null;
		reviewee_profile?: {
			first_name: string | null;
			last_name: string | null;
			email: string | null;
		} | null;
		ride?: {
			departure: string | null;
			arrival: string | null;
			ride_date: string | null;
		} | null;
	};

	let reviewsLoading = false;
	let reviewsError = '';
	let reviewsActionMessage = '';
	let reviews: AdminReview[] = [];
	let reviewFilterStatus = 'pending';
	let reviewActionId: string | null = null;

	// Support management (tickets + messages)
	type SupportTicket = {
		id: string;
		user_id: string | null;
		subject: string;
		status: 'open' | 'in_progress' | 'resolved' | 'closed';
		priority: 'low' | 'normal' | 'high' | 'urgent';
		created_at: string;
		updated_at: string;
		profiles?: {
			first_name: string | null;
			last_name: string | null;
			email: string | null;
		} | null;
	};

	type SupportMessage = {
		id: string;
		ticket_id: string;
		sender_id: string | null;
		sender_role: 'user' | 'admin';
		message: string;
		created_at: string;
		profiles?: {
			first_name: string | null;
			last_name: string | null;
			email: string | null;
		} | null;
	};

	let supportLoading = false;
	let supportError = '';
	let supportActionMessage = '';
	let supportTickets: SupportTicket[] = [];
	let supportFilterStatus = '';
	let selectedSupportTicket: SupportTicket | null = null;
	let supportMessages: SupportMessage[] = [];
	let supportMessagesLoading = false;
	let supportReplyMessage = '';
	let supportSendingReply = false;
	let supportUpdatingStatus = false;

	// Transactions management (simple MVP)
	type AdminTransaction = {
		id: string;
		booking_id: string | null;
		user_id: string | null;
		amount: number;
		status: 'succeeded' | 'failed';
		refund_status: 'none' | 'refunded';
		currency: string;
		created_at: string;
		profiles?: {
			first_name: string | null;
			last_name: string | null;
			email: string | null;
		} | null;
	};

	let transactionsLoading = false;
	let transactionsError = '';
	let transactionsActionMessage = '';
	let transactions: AdminTransaction[] = [];
	let transactionFilterStatus = '';
	let transactionActionId: string | null = null;

	// Platform settings management
	let settingsLoading = false;
	let settingsError = '';
	let settingsMessage = '';
	let settingsSaving = false;
	let commissionPercent = 10;
	let maxSeatsLimit = 6;
	let maxPriceLimit = 200;

	// Dashboard overview stats
	let stats = {
		totalUsers: 0,
		activeRides: 0,
		completedRides: 0,
		reservationsInProgress: 0,
		revenue: {
			hasPaymentIntegration: false,
			estimatedRevenue: 0
		},
		alerts: {
			total: 0,
			reports: 0,
			accountsToVerify: 0
		}
	};

	onMount(() => {
		const unsubscribe = user.subscribe((u) => {
			currentUser = u;
		});

		async function initializeAdminPage() {
			// Wait for auth to resolve
			const {
				data: { user: authUser }
			} = await supabase.auth.getUser();
			if (!authUser) {
				goto('/auth/login');
				return;
			}

			const isHizliAccount =
				(authUser.email ?? '').toLowerCase() === 'hizli.carpooling@gmail.com';
			if (isHizliAccount) {
				isAdmin = true;
				await loadStats();
				await loadUsers();
				await loadRides();
				await loadBookings();
				await loadReports();
				await loadReviews();
				await loadSupportTickets();
				await loadTransactions();
				await loadPlatformSettings();
				loading = false;
				return;
			}

			const { data: profile, error } = await supabase
				.from('profiles')
				.select('is_admin')
				.eq('id', authUser.id)
				.maybeSingle();

			if (error) {
				accessError =
					"Unable to verify admin access. Your profile may not exist yet in the profiles table.";
				loading = false;
				return;
			}

			let checkedProfile = profile;
			if (!checkedProfile) {
				const fallbackFirstName =
					authUser.user_metadata?.full_name?.toString()?.split(' ')[0] ||
					authUser.user_metadata?.name?.toString()?.split(' ')[0] ||
					authUser.email?.split('@')[0] ||
					'User';

				await supabase.from('profiles').insert({
					id: authUser.id,
					first_name: fallbackFirstName
				});

				const { data: retryProfile } = await supabase
					.from('profiles')
					.select('is_admin')
					.eq('id', authUser.id)
					.maybeSingle();

				checkedProfile = retryProfile;
			}

			if (!checkedProfile?.is_admin) {
				accessError = "Your account is signed in, but it does not have the admin role yet.";
				loading = false;
				return;
			}

			isAdmin = true;
			await loadStats();
			await loadUsers();
			await loadRides();
			await loadBookings();
			await loadReports();
			await loadReviews();
			await loadSupportTickets();
			await loadTransactions();
			await loadPlatformSettings();
			loading = false;
		}

		initializeAdminPage();

		return () => unsubscribe();
	});

	async function loadStats() {
		statsError = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			statsError = 'Session expired. Please sign in again.';
			return;
		}

		const response = await fetch('/api/admin/overview', {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${session.access_token}`
			}
		});

		const payload = await response.json();
		if (!response.ok) {
			statsError = payload?.error || 'Unable to load dashboard data.';
			return;
		}

		if (payload?.stats) {
			stats = payload.stats;
		}
	}

	async function loadUsers() {
		usersLoading = true;
		usersError = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			usersError = 'Session expired. Please sign in again.';
			users = [];
			usersLoading = false;
			return;
		}

		const response = await fetch('/api/admin/users', {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${session.access_token}`
			}
		});

		const payload = await response.json();
		if (!response.ok) {
			usersError = payload?.error || 'Unable to load users right now.';
			users = [];
			usersLoading = false;
			return;
		}

		users = ((payload?.users ?? []) as AdminUser[]).sort((a, b) => {
			const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
			const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
			return bDate - aDate;
		});
		usersLoading = false;
	}

	async function updateUserFlag(targetUser: AdminUser, field: 'is_admin' | 'is_verified', value: boolean) {
		actionUserId = targetUser.id;
		usersActionMessage = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			usersActionMessage = 'Session expired. Please sign in again.';
			actionUserId = null;
			return;
		}

		const response = await fetch('/api/admin/users', {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${session.access_token}`
			},
			body: JSON.stringify({
				userId: targetUser.id,
				field,
				value,
				email: targetUser.email,
				firstName: targetUser.first_name,
				lastName: targetUser.last_name
			})
		});

		const payload = await response.json();
		if (!response.ok) {
			usersActionMessage =
				payload?.error ||
				'Action unavailable right now. Check that your account has admin role in profiles.';
			actionUserId = null;
			return;
		}

		users = users.map((u) =>
			u.id === targetUser.id ? { ...u, [field]: value, has_profile: true } : u
		);
		usersActionMessage =
			field === 'is_admin'
				? value
					? 'The account is now admin.'
					: 'Admin role has been removed.'
				: value
					? 'The account is now verified.'
					: 'The account is now unverified.';

		actionUserId = null;
	}

	$: normalizedSearch = userSearch.trim().toLowerCase();
	$: filteredUsers = users.filter((u) => {
		if (!normalizedSearch) {
			return true;
		}

		const searchable = `${u.first_name ?? ''} ${u.last_name ?? ''} ${u.email ?? ''} ${u.id}`.toLowerCase();
		return searchable.includes(normalizedSearch);
	});

	function setTab(tab: string) {
		activeTab = tab;
		if (tab === 'reviews') {
			void loadReviews();
		}
	}

	async function openProfileModal(user: AdminUser) {
		selectedProfile = user;
		showProfileModal = true;
		profileRides = [];
		profileBookings = [];
		profileDocuments = [];
		profileDocumentsError = '';
		profileDocumentsMessage = '';
		ridesLoading = true;
		profileDocumentsLoading = true;

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			ridesLoading = false;
			return;
		}

		const response = await fetch(`/api/admin/user-rides?userId=${encodeURIComponent(user.id)}`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${session.access_token}`
			}
		});

		const payload = await response.json();
		if (response.ok) {
			profileRides = payload.driverRides ?? [];
			profileBookings = payload.bookings ?? [];
		}

		await loadProfileDocuments(user.id);

		ridesLoading = false;
	}

	async function loadProfileDocuments(userId: string) {
		profileDocumentsLoading = true;
		profileDocumentsError = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			profileDocumentsError = 'Session expired. Please sign in again.';
			profileDocuments = [];
			profileDocumentsLoading = false;
			return;
		}

		const response = await fetch(
			`/api/admin/user-documents?userId=${encodeURIComponent(userId)}`,
			{
				method: 'GET',
				headers: {
					Authorization: `Bearer ${session.access_token}`
				}
			}
		);

		const payload = await response.json();
		if (!response.ok) {
			profileDocumentsError = payload?.error || 'Unable to load verification documents.';
			profileDocuments = [];
			profileDocumentsLoading = false;
			return;
		}

		profileDocuments = (payload?.documents ?? []) as AdminVerificationDocument[];
		profileDocumentsLoading = false;
	}

	async function reviewProfileDocument(
		document: AdminVerificationDocument,
		status: 'approved' | 'rejected'
	) {
		const selectedProfileId = selectedProfile?.id;
		if (!selectedProfileId) return;

		profileDocumentActionId = document.id;
		profileDocumentsMessage = '';
		profileDocumentsError = '';

		const note =
			status === 'rejected'
				? (prompt('Add a rejection note (required):') ?? '').trim()
				: (prompt('Optional admin note:') ?? '').trim();

		if (status === 'rejected' && !note) {
			profileDocumentsError = 'A rejection note is required.';
			profileDocumentActionId = null;
			return;
		}

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			profileDocumentsError = 'Session expired. Please sign in again.';
			profileDocumentActionId = null;
			return;
		}

		const response = await fetch('/api/admin/user-documents', {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${session.access_token}`
			},
			body: JSON.stringify({
				documentId: document.id,
				status,
				note
			})
		});

		const payload = await response.json();
		if (!response.ok) {
			profileDocumentsError = payload?.error || 'Unable to review document.';
			profileDocumentActionId = null;
			return;
		}

		profileDocumentsMessage =
			status === 'approved'
				? 'Document approved and account verification updated.'
				: 'Document rejected and account marked unverified.';

		await loadProfileDocuments(selectedProfileId);
		await loadUsers();
		const refreshed = users.find((u) => u.id === selectedProfileId);
		if (refreshed) {
			selectedProfile = refreshed;
		}

		profileDocumentActionId = null;
	}

	function documentTypeLabel(value: string | null | undefined): string {
		const normalized = (value || 'other').trim().toLowerCase().replace(/[\s-]+/g, '_');
		return documentTypeLabelMap[normalized] || normalized.replaceAll('_', ' ');
	}

	function closeProfileModal() {
		showProfileModal = false;
		selectedProfile = null;
		profileRides = [];
		profileBookings = [];
		profileDocuments = [];
		profileDocumentsError = '';
		profileDocumentsMessage = '';
		profileDocumentActionId = null;
		statusActionMessage = '';
	}

	async function changeUserStatus(status: 'active' | 'suspended' | 'banned') {
		if (!selectedProfile) return;

		statusActionInProgress = true;
		statusActionMessage = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			statusActionMessage = 'Session expired. Please sign in again.';
			statusActionInProgress = false;
			return;
		}

		const response = await fetch('/api/admin/user-status', {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${session.access_token}`
			},
			body: JSON.stringify({
				userId: selectedProfile.id,
				status
			})
		});

		const payload = await response.json();
		if (!response.ok) {
			statusActionMessage = payload?.error || 'Error while changing status.';
			statusActionInProgress = false;
			return;
		}

		selectedProfile = { ...selectedProfile, user_status: status };
		users = users.map((u) =>
			u.id === selectedProfile?.id ? { ...u, user_status: status } : u
		);

		const statusLabels: Record<string, string> = {
			active: 'Account activated',
			suspended: 'Account suspended',
			banned: 'Account banned'
		};

		statusActionMessage = statusLabels[status] || 'Status updated';
		statusActionInProgress = false;
	}

	async function resetUserPassword() {
		if (!selectedProfile) return;

		statusActionInProgress = true;
		statusActionMessage = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			statusActionMessage = 'Session expired. Please sign in again.';
			statusActionInProgress = false;
			return;
		}

		const response = await fetch('/api/admin/reset-password', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${session.access_token}`
			},
			body: JSON.stringify({
				userId: selectedProfile.id,
				email: selectedProfile.email
			})
		});

		const payload = await response.json();
		if (!response.ok) {
			statusActionMessage = payload?.error || 'Error while resetting password.';
			statusActionInProgress = false;
			return;
		}

		statusActionMessage = `Password reset email sent to ${selectedProfile.email}`;
		statusActionInProgress = false;
	}

	async function loadRides() {
		ridesManagementLoading = true;
		ridesManagementError = '';
		ridesManagementActionMessage = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			ridesManagementError = 'Session expired. Please sign in again.';
			ridesManagementLoading = false;
			return;
		}

		const params = new URLSearchParams();
		if (rideFilterCityFrom) params.append('cityFrom', rideFilterCityFrom);
		if (rideFilterCityTo) params.append('cityTo', rideFilterCityTo);
		if (rideFilterStatus) params.append('status', rideFilterStatus);
		if (rideFilterFromDate) params.append('fromDate', rideFilterFromDate);

		const response = await fetch(`/api/admin/rides?${params.toString()}`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${session.access_token}`
			}
		});

		const payload = await response.json();
		if (!response.ok) {
			ridesManagementError = payload?.error || 'Unable to load rides.';
			rides = [];
			ridesManagementLoading = false;
			return;
		}

		rides = (payload?.rides ?? []) as AdminRide[];
		applyRideFilters();
		ridesManagementLoading = false;
	}

	function applyRideFilters() {
		filteredRides = rides.slice();
	}

	async function deleteRide(ride: AdminRide) {
		if (!confirm(`Confirm deletion of ride from ${ride.city_from} to ${ride.city_to}?`)) {
			return;
		}

		deletingRideId = ride.id;
		ridesManagementActionMessage = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			ridesManagementActionMessage = 'Session expired. Please sign in again.';
			deletingRideId = null;
			return;
		}

		const response = await fetch(`/api/admin/rides?rideId=${encodeURIComponent(ride.id)}`, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${session.access_token}`
			}
		});

		const payload = await response.json();
		if (!response.ok) {
			ridesManagementActionMessage = payload?.error || 'Error while deleting ride.';
			deletingRideId = null;
			return;
		}

		rides = rides.filter((r) => r.id !== ride.id);
		applyRideFilters();
		ridesManagementActionMessage = 'Ride deleted successfully.';
		deletingRideId = null;
	}

	async function showRideBookings(ride: AdminRide) {
		selectedRideForBookings = ride;
		showRideBookingsModal = true;
		rideBookings = [];
		rideBookingsLoading = true;

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			rideBookingsLoading = false;
			return;
		}

		const response = await fetch(
			`/api/admin/ride-bookings?rideId=${encodeURIComponent(ride.id)}`,
			{
				method: 'GET',
				headers: {
					Authorization: `Bearer ${session.access_token}`
				}
			}
		);

		const payload = await response.json();
		if (response.ok) {
			rideBookings = payload.bookings ?? [];
		}

		rideBookingsLoading = false;
	}

	function closeRideBookingsModal() {
		showRideBookingsModal = false;
		selectedRideForBookings = null;
		rideBookings = [];
	}

	async function loadBookings() {
		bookingsLoading = true;
		bookingsError = '';
		bookingsActionMessage = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			bookingsError = 'Session expired. Please sign in again.';
			bookingsLoading = false;
			return;
		}

		const params = new URLSearchParams();
		if (bookingFilterStatus) params.append('status', bookingFilterStatus);
		if (bookingFilterFromDate) params.append('fromDate', bookingFilterFromDate);

		const response = await fetch(`/api/admin/bookings?${params.toString()}`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${session.access_token}`
			}
		});

		const payload = await response.json();
		if (!response.ok) {
			bookingsError = payload?.error || 'Unable to load bookings.';
			bookings = [];
			bookingsLoading = false;
			return;
		}

		bookings = (payload?.bookings ?? []) as AdminBooking[];
		applyBookingFilters();
		bookingsLoading = false;
	}

	function applyBookingFilters() {
		filteredBookings = bookings.slice();
	}

	async function showBookingDetails(booking: AdminBooking) {
		selectedBooking = booking;
		showBookingDetailsModal = true;
		selectedBookingRider = null;
		riderDetailsLoading = true;

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			riderDetailsLoading = false;
			return;
		}

		// Fetch rider profile details
		const { data: riderProfile } = await supabase
			.from('profiles')
			.select('id, first_name, last_name, email, phone_number, average_rating, created_at')
			.eq('id', booking.user_id)
			.maybeSingle();

		if (riderProfile) {
			selectedBookingRider = {
				...(riderProfile as AdminUser),
				user_status: (riderProfile as Partial<AdminUser>).user_status ?? 'active'
			};
		}

		riderDetailsLoading = false;
	}

	function closeBookingDetailsModal() {
		showBookingDetailsModal = false;
		selectedBooking = null;
		selectedBookingRider = null;
	}

	async function loadReports() {
		reportsLoading = true;
		reportsError = '';
		reportActionMessage = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			reportsError = 'Session expired. Please sign in again.';
			reportsLoading = false;
			return;
		}

		const params = new URLSearchParams();
		if (reportFilterType) params.append('type', reportFilterType);
		if (reportFilterStatus) params.append('status', reportFilterStatus);

		const response = await fetch(`/api/admin/reports?${params.toString()}`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${session.access_token}`
			}
		});

		const payload = await response.json();
		if (!response.ok) {
			reportsError = payload?.error || 'Unable to load reports.';
			reports = [];
			reportsLoading = false;
			return;
		}

		reports = (payload?.reports ?? []) as AdminReport[];
		applyReportFilters();
		reportsLoading = false;
	}

	function applyReportFilters() {
		filteredReports = reports.slice();
	}

	function reportTypeLabel(type: string) {
		if (type === 'user') return 'User report';
		if (type === 'ride') return 'Ride report';
		if (type === 'behavior') return 'Behavior';
		if (type === 'spam') return 'Spam';
		if (type === 'payment_issue') return 'Payment issue';
		return type;
	}

	async function moderateReport(report: AdminReport, action: 'ignore' | 'warn' | 'suspend') {
		reportActionId = report.id;
		reportActionMessage = '';

		if (action === 'suspend' && !confirm('Confirm suspension of the account linked to this report?')) {
			reportActionId = null;
			return;
		}

		const note =
			action === 'ignore'
				? 'Report ignored by admin'
				: prompt('Add an admin note (optional)') ?? '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			reportActionMessage = 'Session expired. Please sign in again.';
			reportActionId = null;
			return;
		}

		const response = await fetch('/api/admin/reports', {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${session.access_token}`
			},
			body: JSON.stringify({
				reportId: report.id,
				action,
				note,
				userId: report.user_id
			})
		});

		const payload = await response.json();
		if (!response.ok) {
			reportActionMessage = payload?.error || 'Action unavailable right now.';
			reportActionId = null;
			return;
		}

		const nextStatus = action === 'ignore' ? 'ignored' : 'resolved';
		const nextAction =
			action === 'ignore' ? 'ignored' : action === 'warn' ? 'warned_user' : 'suspended_user';

		reports = reports.map((r) =>
			r.id === report.id
				? {
					...r,
					status: nextStatus,
					action_taken: nextAction,
					admin_note: note,
					updated_at: new Date().toISOString()
				}
				: r
		);
		applyReportFilters();

		if (action === 'suspend' && report.user_id) {
			users = users.map((u) => (u.id === report.user_id ? { ...u, user_status: 'suspended' } : u));
		}

		reportActionMessage =
			action === 'ignore'
				? 'Report ignored.'
				: action === 'warn'
					? 'User warned.'
					: 'Account suspended and report resolved.';
		reportActionId = null;
	}

	async function openReportedUser(report: AdminReport) {
		if (!report.user_id) return;

		if (users.length === 0) {
			await loadUsers();
		}

		const target = users.find((u) => u.id === report.user_id);
		if (!target) {
			reportActionMessage = 'User not found in current list.';
			return;
		}

		await openProfileModal(target);
	}

	async function openReportedRide(report: AdminReport) {
		if (!report.ride_id) return;
		setTab('rides');
		await loadRides();
	}

	function openReportHistory(report: AdminReport) {
		selectedReportHistory = report;
		showReportHistoryModal = true;
	}

	function closeReportHistoryModal() {
		selectedReportHistory = null;
		showReportHistoryModal = false;
	}

	async function loadReviews() {
		reviewsLoading = true;
		reviewsError = '';
		reviewsActionMessage = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			reviewsError = 'Session expired. Please sign in again.';
			reviews = [];
			reviewsLoading = false;
			return;
		}

		const params = new URLSearchParams();
		if (reviewFilterStatus) params.append('status', reviewFilterStatus);

		const response = await fetch(`/api/admin/reviews?${params.toString()}`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${session.access_token}`
			}
		});

		const payload = await response.json();
		if (!response.ok) {
			reviewsError = payload?.error || 'Unable to load reviews.';
			reviews = [];
			reviewsLoading = false;
			return;
		}

		reviews = (payload?.reviews ?? []) as AdminReview[];
		reviewsLoading = false;
	}

	async function moderateReview(review: AdminReview, status: 'approved' | 'rejected') {
		reviewActionId = review.id;
		reviewsActionMessage = '';

		const note =
			status === 'rejected'
				? (prompt('Add a rejection note (required):') ?? '').trim()
				: (prompt('Add an admin note (optional):') ?? '').trim();

		if (status === 'rejected' && !note) {
			reviewsError = 'A rejection note is required.';
			reviewActionId = null;
			return;
		}

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			reviewsError = 'Session expired. Please sign in again.';
			reviewActionId = null;
			return;
		}

		const response = await fetch('/api/admin/reviews', {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${session.access_token}`
			},
			body: JSON.stringify({
				reviewId: review.id,
				status,
				note
			})
		});

		const payload = await response.json();
		if (!response.ok) {
			reviewsError = payload?.error || 'Unable to moderate review.';
			reviewActionId = null;
			return;
		}

		reviews = reviews.map((r) =>
			r.id === review.id
				? {
					...r,
					status,
					admin_note: note || null,
					reviewed_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}
				: r
		);

		reviewsActionMessage =
			status === 'approved' ? 'Review approved.' : 'Review rejected.';
		reviewActionId = null;
	}

	async function loadSupportTickets() {
		supportLoading = true;
		supportError = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			supportError = 'Session expired. Please sign in again.';
			supportLoading = false;
			return;
		}

		const params = new URLSearchParams();
		if (supportFilterStatus) {
			params.append('status', supportFilterStatus);
		}

		const response = await fetch(`/api/admin/support?${params.toString()}`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${session.access_token}`
			}
		});

		const payload = await response.json();
		if (!response.ok) {
			supportError = payload?.error || 'Unable to load support tickets.';
			supportTickets = [];
			supportLoading = false;
			return;
		}

		supportTickets = (payload?.tickets ?? []) as SupportTicket[];
		supportLoading = false;
	}

	async function openSupportTicket(ticket: SupportTicket) {
		selectedSupportTicket = ticket;
		supportMessages = [];
		supportMessagesLoading = true;
		supportActionMessage = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			supportMessagesLoading = false;
			return;
		}

		const response = await fetch(
			`/api/admin/support?ticketId=${encodeURIComponent(ticket.id)}`,
			{
				method: 'GET',
				headers: {
					Authorization: `Bearer ${session.access_token}`
				}
			}
		);

		const payload = await response.json();
		if (!response.ok) {
			supportActionMessage = payload?.error || 'Unable to load conversation.';
			supportMessagesLoading = false;
			return;
		}

		supportMessages = (payload?.messages ?? []) as SupportMessage[];
		supportMessagesLoading = false;
	}

	async function sendSupportReply() {
		if (!selectedSupportTicket) return;
		const message = supportReplyMessage.trim();
		if (!message) return;

		supportSendingReply = true;
		supportActionMessage = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			supportActionMessage = 'Session expired. Please sign in again.';
			supportSendingReply = false;
			return;
		}

		const response = await fetch('/api/admin/support', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${session.access_token}`
			},
			body: JSON.stringify({
				ticketId: selectedSupportTicket.id,
				message
			})
		});

		const payload = await response.json();
		if (!response.ok) {
			supportActionMessage = payload?.error || 'Unable to send reply.';
			supportSendingReply = false;
			return;
		}

		supportReplyMessage = '';
		supportActionMessage = 'Reply sent.';
		supportSendingReply = false;
		await openSupportTicket(selectedSupportTicket);
		await loadSupportTickets();
	}

	async function updateSupportTicketStatus(status: SupportTicket['status']) {
		if (!selectedSupportTicket) return;
		supportUpdatingStatus = true;
		supportActionMessage = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			supportActionMessage = 'Session expired. Please sign in again.';
			supportUpdatingStatus = false;
			return;
		}

		const response = await fetch('/api/admin/support', {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${session.access_token}`
			},
			body: JSON.stringify({
				ticketId: selectedSupportTicket.id,
				status
			})
		});

		const payload = await response.json();
		if (!response.ok) {
			supportActionMessage = payload?.error || 'Unable to update ticket.';
			supportUpdatingStatus = false;
			return;
		}

		selectedSupportTicket = { ...selectedSupportTicket, status };
		supportTickets = supportTickets.map((t) =>
			t.id === selectedSupportTicket?.id ? { ...t, status } : t
		);
		supportActionMessage = 'Ticket status updated.';
		supportUpdatingStatus = false;
	}

	async function loadTransactions() {
		transactionsLoading = true;
		transactionsError = '';
		transactionsActionMessage = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			transactionsError = 'Session expired. Please sign in again.';
			transactionsLoading = false;
			return;
		}

		const params = new URLSearchParams();
		if (transactionFilterStatus) {
			params.append('status', transactionFilterStatus);
		}

		const response = await fetch(`/api/admin/transactions?${params.toString()}`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${session.access_token}`
			}
		});

		const payload = await response.json();
		if (!response.ok) {
			transactionsError = payload?.error || 'Unable to load transactions.';
			transactions = [];
			transactionsLoading = false;
			return;
		}

		transactions = (payload?.transactions ?? []) as AdminTransaction[];
		transactionsLoading = false;
	}

	async function refundTransaction(transaction: AdminTransaction) {
		if (transaction.refund_status === 'refunded') return;
		if (!confirm('Confirm refund for this transaction?')) return;

		transactionActionId = transaction.id;
		transactionsActionMessage = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			transactionsActionMessage = 'Session expired. Please sign in again.';
			transactionActionId = null;
			return;
		}

		const response = await fetch('/api/admin/transactions', {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${session.access_token}`
			},
			body: JSON.stringify({
				transactionId: transaction.id,
				action: 'refund'
			})
		});

		const payload = await response.json();
		if (!response.ok) {
			transactionsActionMessage = payload?.error || 'Refund unavailable right now.';
			transactionActionId = null;
			return;
		}

		transactions = transactions.map((t) =>
			t.id === transaction.id ? { ...t, refund_status: 'refunded' } : t
		);
		transactionsActionMessage = 'Transaction refunded.';
		transactionActionId = null;
	}

	async function loadPlatformSettings() {
		settingsLoading = true;
		settingsError = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			settingsError = 'Session expired. Please sign in again.';
			settingsLoading = false;
			return;
		}

		const response = await fetch('/api/admin/platform-settings', {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${session.access_token}`
			}
		});

		const payload = await response.json();
		if (!response.ok) {
			settingsError = payload?.error || 'Unable to load settings.';
			settingsLoading = false;
			return;
		}

		const s = payload?.settings;
		if (s) {
			commissionPercent = Number(s.commission_percent ?? 10);
			maxSeatsLimit = Number(s.max_seats ?? 6);
			maxPriceLimit = Number(s.max_price ?? 200);
		}

		settingsLoading = false;
	}

	async function savePlatformSettings() {
		settingsSaving = true;
		settingsError = '';
		settingsMessage = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			settingsError = 'Session expired. Please sign in again.';
			settingsSaving = false;
			return;
		}

		const response = await fetch('/api/admin/platform-settings', {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${session.access_token}`
			},
			body: JSON.stringify({
				commission_percent: commissionPercent,
				max_seats: maxSeatsLimit,
				max_price: maxPriceLimit
			})
		});

		const payload = await response.json();
		if (!response.ok) {
			settingsError = payload?.error || 'Unable to save settings.';
			settingsSaving = false;
			return;
		}

		settingsMessage = 'Settings saved.';
		settingsSaving = false;
	}
</script>

{#if loading}
	<div class="min-h-screen flex items-center justify-center">
		<div class="animate-spin rounded-full h-10 w-10 border-4 border-green-500 border-t-transparent"></div>
	</div>
{:else if accessError}
	<div class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
		<div class="max-w-xl w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
			<h1 class="text-xl font-bold text-gray-900 mb-2">Admin access unavailable</h1>
			<p class="text-sm text-gray-600 mb-4">{accessError}</p>
			<p class="text-sm text-gray-500 mb-6">Signed-in account: {currentUser?.email ?? 'not detected'}</p>
			<div class="flex gap-3">
				<a href="/profile" class="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700">Go to profile</a>
				<a href="/" class="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">Back to home</a>
			</div>
		</div>
	</div>
{:else if isAdmin}
	<div class="min-h-screen bg-gray-50">
		<!-- Admin header bar -->
		<div class="bg-white border-b border-gray-200 px-6 py-4">
			<div class="max-w-7xl mx-auto flex items-center justify-between">
				<div class="flex items-center gap-3">
					<span class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-green-100">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
						</svg>
					</span>
					<div>
						<h1 class="text-lg font-bold text-gray-900">Admin Dashboard</h1>
						<p class="text-xs text-gray-500">Restricted access</p>
					</div>
				</div>
				<span class="text-sm text-gray-500">{currentUser?.email}</span>
			</div>
		</div>

		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
			{#if statsError}
				<div class="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					{statsError}
				</div>
			{/if}

			<!-- Stats cards -->
			<div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
				<!-- Users -->
				<div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
					<div class="shrink-0 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
					</div>
					<div>
						<p class="text-xs text-gray-500">Users</p>
						<p class="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
					</div>
				</div>
				<!-- Active rides -->
				<div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
					<div class="shrink-0 w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
					</div>
					<div>
						<p class="text-xs text-gray-500">Active rides</p>
						<p class="text-2xl font-bold text-gray-900">{stats.activeRides}</p>
					</div>
				</div>
				<!-- Completed rides -->
				<div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
					<div class="shrink-0 w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<div>
						<p class="text-xs text-gray-500">Completed</p>
						<p class="text-2xl font-bold text-gray-900">{stats.completedRides}</p>
					</div>
				</div>
				<!-- Bookings -->
				<div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
					<div class="shrink-0 w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
						</svg>
					</div>
					<div>
						<p class="text-xs text-gray-500">Bookings</p>
						<p class="text-2xl font-bold text-gray-900">{stats.reservationsInProgress}</p>
					</div>
				</div>
				<!-- Alerts -->
				<div class="bg-white rounded-xl border p-4 shadow-sm flex items-center gap-3 {stats.alerts.total > 0 ? 'border-orange-200' : 'border-gray-100'}">
					<div class="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center {stats.alerts.total > 0 ? 'bg-orange-50' : 'bg-gray-100'}">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 {stats.alerts.total > 0 ? 'text-orange-500' : 'text-gray-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
						</svg>
					</div>
					<div>
						<p class="text-xs text-gray-500">Alerts</p>
						<p class="text-2xl font-bold {stats.alerts.total > 0 ? 'text-orange-500' : 'text-gray-900'}">{stats.alerts.total}</p>
					</div>
				</div>
			</div>

			<!-- Tab navigation -->
			<div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
				<div class="flex border-b border-gray-100">
					{#each [
						{ id: 'overview', label: 'Overview' },
						{ id: 'users', label: 'Users' },
						{ id: 'rides', label: 'Rides' },
						{ id: 'bookings', label: 'Bookings' },
						{ id: 'reviews', label: 'Reviews' },
						{ id: 'transactions', label: 'Transactions' },
						{ id: 'settings', label: 'Settings' },
						{ id: 'reports', label: 'Reports' },
						{ id: 'support', label: 'Support' }
					] as tab}
						<button
							class="px-5 py-3 text-sm font-medium transition-colors cursor-pointer
								{activeTab === tab.id
									? 'text-green-600 border-b-2 border-green-500 bg-green-50'
									: 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}"
							on:click={() => setTab(tab.id)}
						>
							{tab.label}
						</button>
					{/each}
				</div>

				<div class="p-6">
					{#if activeTab === 'overview'}
						<div class="space-y-6">
							<!-- Section title -->
							<div>
								<h2 class="text-base font-semibold text-gray-900">Platform Overview</h2>
								<p class="text-sm text-gray-500 mt-0.5">Key metrics in real time.</p>
							</div>

							<!-- Rides -->
							<div>
								<h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Rides</h3>
								<div class="grid md:grid-cols-2 gap-4">
									<div class="rounded-xl border border-green-200 bg-green-50 p-5">
										<div class="flex items-center justify-between mb-2">
											<p class="text-sm font-semibold text-green-800">Active rides</p>
											<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">{stats.activeRides}</span>
										</div>
										<p class="text-xs text-green-700 mb-3">Upcoming departure date, available for booking.</p>
										{#if stats.activeRides + stats.completedRides > 0}
											<div>
												<div class="flex justify-between text-xs text-green-700 mb-1">
													<span>Active share</span>
													<span>{Math.round(stats.activeRides / (stats.activeRides + stats.completedRides) * 100)} %</span>
												</div>
												<div class="w-full bg-green-200 rounded-full h-1.5">
													<div class="bg-green-500 h-1.5 rounded-full transition-all" style="width: {Math.round(stats.activeRides / (stats.activeRides + stats.completedRides) * 100)}%"></div>
												</div>
											</div>
										{/if}
									</div>
									<div class="rounded-xl border border-gray-200 bg-gray-50 p-5">
										<div class="flex items-center justify-between mb-2">
											<p class="text-sm font-semibold text-gray-700">Completed rides</p>
											<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-200 text-gray-600">{stats.completedRides}</span>
										</div>
										<p class="text-xs text-gray-500 mb-1">Departure date passed.</p>
										<p class="text-xs text-gray-500">
											Total created: <span class="font-semibold text-gray-700">{stats.activeRides + stats.completedRides}</span>
										</p>
									</div>
								</div>
							</div>

							<!-- Bookings + Revenue -->
							<div class="grid md:grid-cols-2 gap-4">
								<div class="rounded-xl border border-purple-200 bg-purple-50 p-5">
									<div class="flex items-center justify-between mb-2">
										<p class="text-sm font-semibold text-purple-800">Active bookings</p>
										<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">{stats.reservationsInProgress}</span>
									</div>
									<p class="text-xs text-purple-700">Status <strong>Pending</strong> or <strong>Confirmed</strong>, not departed yet.</p>
								</div>
								<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
									<div class="flex items-center justify-between mb-2">
										<p class="text-sm font-semibold text-emerald-800">Estimated revenue</p>
										{#if stats.revenue.hasPaymentIntegration}
											<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-200 text-emerald-700">Integrated</span>
										{:else}
											<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Estimate</span>
										{/if}
									</div>
									<p class="text-2xl font-bold text-emerald-700">
										{stats.revenue.estimatedRevenue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
									</p>
									{#if !stats.revenue.hasPaymentIntegration}
										<p class="text-xs text-emerald-700 mt-1">Calculated from confirmed bookings (price x seats). Payments not integrated.</p>
									{/if}
								</div>
							</div>

							<!-- Alerts -->
							<div>
								<h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Alertes</h3>
								<div class="grid md:grid-cols-2 gap-4">
									<div class="rounded-xl border p-5 {stats.alerts.reports > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}">
										<div class="flex items-center justify-between mb-2">
											<p class="text-sm font-semibold {stats.alerts.reports > 0 ? 'text-red-800' : 'text-gray-600'}">Reports</p>
											<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold {stats.alerts.reports > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'}">{stats.alerts.reports}</span>
										</div>
										{#if stats.alerts.reports === 0}
											<p class="text-xs text-gray-500">No pending reports.</p>
										{:else}
											<p class="text-xs text-red-700 mb-2">Some reports need action.</p>
											<button type="button" on:click={() => setTab('reports')} class="text-xs font-medium text-red-700 underline hover:text-red-900 cursor-pointer">
												View reports ->
											</button>
										{/if}
									</div>
									<div class="rounded-xl border p-5 {stats.alerts.accountsToVerify > 0 ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-gray-50'}">
										<div class="flex items-center justify-between mb-2">
											<p class="text-sm font-semibold {stats.alerts.accountsToVerify > 0 ? 'text-orange-800' : 'text-gray-600'}">Accounts to verify</p>
											<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold {stats.alerts.accountsToVerify > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'}">{stats.alerts.accountsToVerify}</span>
										</div>
										{#if stats.alerts.accountsToVerify === 0}
											<p class="text-xs text-gray-500">All accounts are verified.</p>
										{:else}
											<p class="text-xs text-orange-700 mb-2">Unverified profiles or missing entries in profiles table.</p>
											<button type="button" on:click={() => setTab('users')} class="text-xs font-medium text-orange-700 underline hover:text-orange-900 cursor-pointer">
												View users ->
											</button>
										{/if}
									</div>
								</div>
							</div>
						</div>
					{:else if activeTab === 'users'}
						<div class="space-y-4">
							<div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
								<div>
									<h2 class="text-lg font-semibold text-gray-900">User management</h2>
									<p class="text-sm text-gray-500">Search by name or email, manage permissions and verification.</p>
								</div>
								<div class="flex gap-2">
									<input
										type="text"
										bind:value={userSearch}
										placeholder="Search by name or email"
										class="w-72 max-w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
									/>
									<button
										type="button"
										on:click={loadUsers}
										class="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
									>
										Refresh
									</button>
								</div>
							</div>

							{#if usersActionMessage}
								<p class="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{usersActionMessage}</p>
							{/if}

							{#if usersError}
								<p class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{usersError}</p>
							{:else if usersLoading}
								<p class="text-sm text-gray-500">Loading users...</p>
							{:else if filteredUsers.length === 0}
								<p class="text-sm text-gray-500">No users match your search.</p>
							{:else}
								<div class="overflow-x-auto border border-gray-100 rounded-xl">
									<table class="w-full text-sm">
										<thead class="bg-gray-50 text-left text-gray-600">
											<tr>
												<th class="px-4 py-3 font-medium">User</th>
												<th class="px-4 py-3 font-medium">Verification</th>
												<th class="px-4 py-3 font-medium">Status</th>
												<th class="px-4 py-3 font-medium">Rating</th>
												<th class="px-4 py-3 font-medium">Created</th>
												<th class="px-4 py-3 font-medium">Actions</th>
											</tr>
										</thead>
										<tbody class="divide-y divide-gray-100">
											{#each filteredUsers as adminUser}
												<tr class="hover:bg-gray-50">
													<td class="px-4 py-3 align-top">
														<p class="font-medium text-gray-900">
															{`${adminUser.first_name ?? ''} ${adminUser.last_name ?? ''}`.trim() || 'Sans nom'}
														</p>
														<p class="text-xs text-gray-500">{adminUser.email ?? 'Email non renseigne'}</p>
														{#if adminUser.phone_number}
															<p class="text-xs text-gray-500">{adminUser.phone_number}</p>
														{/if}
														<p class="text-xs text-gray-400 break-all">{adminUser.id}</p>
														{#if adminUser.has_profile === false}
															<p class="text-xs text-amber-600">Profil manquant</p>
														{/if}
													</td>
													<td class="px-4 py-3 align-top">
														<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium {adminUser.is_verified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
															{adminUser.is_verified ? 'Verifie' : 'Non verifie'}
														</span>
													</td>
													<td class="px-4 py-3 align-top">
														<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium {adminUser.user_status === 'active' ? 'bg-green-100 text-green-700' : adminUser.user_status === 'suspended' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}">
															{adminUser.user_status === 'active' ? 'Actif' : adminUser.user_status === 'suspended' ? 'Suspendu' : 'Banni'}
														</span>
													</td>
													<td class="px-4 py-3 align-top text-gray-600">
														{#if adminUser.average_rating}
															<span class="text-sm font-medium">{adminUser.average_rating.toFixed(1)} *</span>
														{:else}
															<span class="text-xs text-gray-400">-</span>
														{/if}
													</td>
													<td class="px-4 py-3 align-top text-gray-500">
														{#if adminUser.created_at}
															{new Date(adminUser.created_at).toLocaleDateString('en-US')}
														{:else}
															-
														{/if}
													</td>
													<td class="px-4 py-3 align-top">
														<div class="flex flex-wrap gap-1">
															<button
																type="button"
																on:click={() => openProfileModal(adminUser)}
																class="px-2 py-1.5 rounded text-xs font-medium border border-blue-200 text-blue-700 hover:bg-blue-50"
															>
																Profil
															</button>
															<button
																type="button"
																disabled={actionUserId === adminUser.id}
																on:click={() => updateUserFlag(adminUser, 'is_verified', !adminUser.is_verified)}
																class="px-2 py-1.5 rounded text-xs font-medium border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
															>
																{adminUser.is_verified ? 'Passer non verifie' : 'Verifier'}
															</button>
														</div>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</div>
					{:else if activeTab === 'rides'}
						<div class="space-y-6">
							<!-- Filters Section -->
							<div class="bg-white rounded-xl p-4 border border-gray-200">
								<h3 class="text-sm font-semibold text-gray-900 mb-4">Filters</h3>
								<div class="grid grid-cols-1 md:grid-cols-5 gap-3">
									<input
										type="text"
										placeholder="Departure city"
										class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
										bind:value={rideFilterCityFrom}
										on:change={loadRides}
									/>
									<input
										type="text"
										placeholder="Arrival city"
										class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
										bind:value={rideFilterCityTo}
										on:change={loadRides}
									/>
									<input
										type="date"
										class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
										bind:value={rideFilterFromDate}
										on:change={loadRides}
									/>
									<select
										class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
										bind:value={rideFilterStatus}
										on:change={loadRides}
									>
										<option value="">All statuses</option>
										<option value="Actif">Active</option>
										<option value="Complet">Full</option>
										<option value="Annulé">Cancelled</option>
										<option value="Terminé">Completed</option>
									</select>
									<button
										on:click={loadRides}
										class="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium"
									>
										Load rides
									</button>
								</div>
								{#if ridesManagementActionMessage}
									<div class="text-sm text-green-600 px-3 py-2 mt-2">{ridesManagementActionMessage}</div>
								{/if}
							</div>

							{#if ridesManagementLoading}
								<div class="text-center py-8">
									<div class="inline-block animate-spin">
										<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
											<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
										</svg>
									</div>
								</div>
							{:else if ridesManagementError}
								<div class="bg-red-50 border border-red-200 rounded-lg p-4">
									<p class="text-sm text-red-600">{ridesManagementError}</p>
									<button
										on:click={loadRides}
										class="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
									>
										Retry
									</button>
								</div>
							{:else if filteredRides.length === 0}
								<div class="bg-gray-50 rounded-xl p-8 text-center">
									<p class="text-gray-500 text-sm">No rides found.</p>
									<button
										on:click={loadRides}
										class="mt-3 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
									>
										Reload
									</button>
								</div>
							{:else}
								<div class="overflow-x-auto">
									<table class="w-full text-sm">
										<thead class="bg-gray-50 border-b border-gray-200">
											<tr>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Driver</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Ride</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Date</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Price</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Seats</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Status</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Actions</th>
											</tr>
										</thead>
										<tbody>
											{#each filteredRides as ride}
												<tr class="border-b border-gray-200 hover:bg-gray-50">
													<td class="px-4 py-3">
														<div class="text-sm font-medium text-gray-900">
															{ride.profiles?.first_name} {ride.profiles?.last_name}
														</div>
														<div class="text-xs text-gray-500">{ride.profiles?.email}</div>
													</td>
													<td class="px-4 py-3">
														<div class="text-sm text-gray-900">{ride.city_from} → {ride.city_to}</div>
													</td>
													<td class="px-4 py-3">
														<div class="text-sm text-gray-600">
															{new Date(ride.ride_date).toLocaleDateString('en-US', {
																day: '2-digit',
																month: '2-digit',
																year: 'numeric'
															})}
														</div>
													</td>
													<td class="px-4 py-3">
														<div class="text-sm font-medium text-gray-900">
															{new Intl.NumberFormat('en-US', {
																style: 'currency',
																currency: 'USD'
															}).format(ride.price)}
														</div>
													</td>
													<td class="px-4 py-3">
														<div class="text-sm text-gray-600">
															{ride.bookedSeats}/{ride.available_seats}
														</div>
													</td>
													<td class="px-4 py-3">
														<span class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
															ride.status === 'Actif'
																? 'bg-green-100 text-green-800'
																: ride.status === 'Complet'
																	? 'bg-yellow-100 text-yellow-800'
																	: ride.status === 'Annulé'
																		? 'bg-red-100 text-red-800'
																		: 'bg-gray-100 text-gray-800'
														}`}>
															{ride.status === 'Actif' ? 'Active' : ride.status === 'Complet' ? 'Full' : ride.status === 'Annulé' ? 'Cancelled' : ride.status === 'Terminé' ? 'Completed' : ride.status}
														</span>
													</td>
													<td class="px-4 py-3">
														<div class="flex gap-2">
															<button
																on:click={() => showRideBookings(ride)}
																class="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
															>
																Bookings
															</button>
															<button
																on:click={() => deleteRide(ride)}
																disabled={deletingRideId === ride.id}
																class="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-50"
															>
																{deletingRideId === ride.id ? 'Deleting...' : 'Delete'}
															</button>
														</div>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</div>
					{:else if activeTab === 'bookings'}
						<div class="space-y-6">
							<!-- Filters Section -->
							<div class="bg-white rounded-xl p-4 border border-gray-200">
								<h3 class="text-sm font-semibold text-gray-900 mb-4">Filters</h3>
								<div class="grid grid-cols-1 md:grid-cols-4 gap-3">
									<input
										type="date"
										class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
										bind:value={bookingFilterFromDate}
										on:change={loadBookings}
									/>
									<select
										class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
										bind:value={bookingFilterStatus}
										on:change={loadBookings}
									>
										<option value="">All statuses</option>
										<option value="Confirmed">Confirmed</option>
										<option value="Pending">Pending</option>
										<option value="Cancelled">Cancelled</option>
									</select>
									<button
										on:click={loadBookings}
										class="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium"
									>
										Load bookings
									</button>
									{#if bookingsActionMessage}
										<div class="text-sm text-green-600 px-3 py-2">{bookingsActionMessage}</div>
									{/if}
								</div>
							</div>

							{#if bookingsLoading}
								<div class="text-center py-8">
									<div class="inline-block animate-spin">
										<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
											<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
										</svg>
									</div>
								</div>
							{:else if bookingsError}
								<div class="bg-red-50 border border-red-200 rounded-lg p-4">
									<p class="text-sm text-red-600">{bookingsError}</p>
									<button
										on:click={loadBookings}
										class="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
									>
										Retry
									</button>
								</div>
							{:else if filteredBookings.length === 0}
								<div class="bg-gray-50 rounded-xl p-8 text-center">
									<p class="text-gray-500 text-sm">No bookings found.</p>
									<button
										on:click={loadBookings}
										class="mt-3 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
									>
										Reload
									</button>
								</div>
							{:else}
								<div class="overflow-x-auto">
									<table class="w-full text-sm">
										<thead class="bg-gray-50 border-b border-gray-200">
											<tr>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Passenger</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Ride</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Seats</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Status</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Booking date</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Actions</th>
											</tr>
										</thead>
										<tbody>
											{#each filteredBookings as booking}
												<tr class="border-b border-gray-200 hover:bg-gray-50">
													<td class="px-4 py-3">
														<div class="text-sm font-medium text-gray-900">
															{booking.profiles?.first_name} {booking.profiles?.last_name}
														</div>
														<div class="text-xs text-gray-500">{booking.profiles?.email}</div>
													</td>
													<td class="px-4 py-3">
														<div class="text-sm text-gray-900">{booking.rides?.city_from} → {booking.rides?.city_to}</div>
														<div class="text-xs text-gray-500">
															{new Date(booking.rides?.ride_date).toLocaleDateString('en-US', {
																day: '2-digit',
																month: '2-digit',
																year: 'numeric'
															})}
														</div>
													</td>
													<td class="px-4 py-3">
														<div class="text-sm font-medium text-gray-900">{booking.seats_booked}</div>
													</td>
													<td class="px-4 py-3">
														<span class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
															booking.status === 'Confirmed'
																? 'bg-green-100 text-green-800'
																: booking.status === 'Pending'
																	? 'bg-yellow-100 text-yellow-800'
																	: booking.status === 'Cancelled'
																		? 'bg-red-100 text-red-800'
																		: 'bg-gray-100 text-gray-800'
														}`}>
															{booking.status === 'Confirmed' ? 'Confirmed' : booking.status === 'Pending' ? 'Pending' : booking.status === 'Cancelled' ? 'Cancelled' : booking.status}
														</span>
													</td>
													<td class="px-4 py-3">
														<div class="text-sm text-gray-600">
															{new Date(booking.created_at).toLocaleDateString('en-US')}
														</div>
													</td>
													<td class="px-4 py-3">
														<button
															on:click={() => showBookingDetails(booking)}
															class="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
														>
															Details
														</button>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</div>
					{:else if activeTab === 'reports'}
						<div class="space-y-6">
							<div class="bg-white rounded-xl p-4 border border-gray-200">
								<h3 class="text-sm font-semibold text-gray-900 mb-4">Filtres</h3>
								<div class="grid grid-cols-1 md:grid-cols-4 gap-3">
									<select
										class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
										bind:value={reportFilterType}
										on:change={loadReports}
									>
										<option value="">Tous les types</option>
										<option value="user">User report</option>
										<option value="ride">Ride report</option>
										<option value="behavior">Comportement</option>
										<option value="spam">Spam</option>
										<option value="payment_issue">Payment issue</option>
									</select>
									<select
										class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
										bind:value={reportFilterStatus}
										on:change={loadReports}
									>
										<option value="">Tous les statuts</option>
										<option value="pending">En attente</option>
										<option value="ignored">Ignored</option>
										<option value="resolved">Resolved</option>
									</select>
									<button
										on:click={loadReports}
										class="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium"
									>
										Load reports
									</button>
								</div>
								{#if reportActionMessage}
									<p class="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-3">{reportActionMessage}</p>
								{/if}
							</div>

							{#if reportsLoading}
								<p class="text-sm text-gray-500">Loading reports...</p>
							{:else if reportsError}
								<p class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{reportsError}</p>
							{:else if filteredReports.length === 0}
								<p class="text-sm text-gray-500">No reports right now.</p>
							{:else}
								<div class="overflow-x-auto border border-gray-100 rounded-xl">
									<table class="w-full text-sm">
										<thead class="bg-gray-50 text-left text-gray-600">
											<tr>
												<th class="px-4 py-3 font-medium">Type</th>
												<th class="px-4 py-3 font-medium">Report</th>
												<th class="px-4 py-3 font-medium">Statut</th>
												<th class="px-4 py-3 font-medium">Liens</th>
												<th class="px-4 py-3 font-medium">Actions</th>
											</tr>
										</thead>
										<tbody class="divide-y divide-gray-100">
											{#each filteredReports as report}
												<tr class="hover:bg-gray-50">
													<td class="px-4 py-3 align-top">
														<span class={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
																report.type === 'user'
																	? 'bg-red-100 text-red-700'
																	: report.type === 'ride'
																		? 'bg-indigo-100 text-indigo-700'
																		: report.type === 'behavior'
																			? 'bg-orange-100 text-orange-700'
																			: report.type === 'spam'
																				? 'bg-purple-100 text-purple-700'
																				: 'bg-blue-100 text-blue-700'
														}`}>
															{reportTypeLabel(report.type)}
														</span>
													</td>
													<td class="px-4 py-3 align-top">
														<p class="text-sm text-gray-900">{report.description || 'Sans description'}</p>
														<p class="text-xs text-gray-500 mt-1">Created on {new Date(report.created_at).toLocaleDateString('en-US')}</p>
													</td>
													<td class="px-4 py-3 align-top">
														<span class={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
															report.status === 'pending'
																? 'bg-yellow-100 text-yellow-700'
																: report.status === 'ignored'
																	? 'bg-gray-100 text-gray-700'
																	: 'bg-green-100 text-green-700'
														}`}>
															{report.status === 'pending' ? 'Pending' : report.status === 'ignored' ? 'Ignored' : 'Resolved'}
														</span>
													</td>
													<td class="px-4 py-3 align-top">
														<div class="flex flex-wrap gap-1">
															<button on:click={() => openReportedUser(report)} class="px-2 py-1 rounded text-xs border border-blue-200 text-blue-700 hover:bg-blue-50">Utilisateur</button>
															<button on:click={() => openReportedRide(report)} class="px-2 py-1 rounded text-xs border border-indigo-200 text-indigo-700 hover:bg-indigo-50">Trajet</button>
															<button on:click={() => openReportHistory(report)} class="px-2 py-1 rounded text-xs border border-gray-300 text-gray-700 hover:bg-gray-50">Historique</button>
														</div>
													</td>
													<td class="px-4 py-3 align-top">
														<div class="flex flex-wrap gap-1">
															<button
																disabled={reportActionId === report.id}
																on:click={() => moderateReport(report, 'ignore')}
																class="px-2 py-1 rounded text-xs border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
															>
																Ignorer
															</button>
															<button
																disabled={reportActionId === report.id}
																on:click={() => moderateReport(report, 'warn')}
																class="px-2 py-1 rounded text-xs border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
															>
																Avertir utilisateur
															</button>
															<button
																disabled={reportActionId === report.id}
																on:click={() => moderateReport(report, 'suspend')}
																class="px-2 py-1 rounded text-xs border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
															>
																Suspend account
															</button>
														</div>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</div>
					{:else if activeTab === 'reviews'}
						<div class="space-y-6">
							<div class="bg-white rounded-xl p-4 border border-gray-200">
								<h3 class="text-sm font-semibold text-gray-900 mb-4">Review moderation</h3>
								<div class="grid grid-cols-1 md:grid-cols-4 gap-3">
									<select
										class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
										bind:value={reviewFilterStatus}
										on:change={loadReviews}
									>
										<option value="">All statuses</option>
										<option value="pending">Pending</option>
										<option value="approved">Approved</option>
										<option value="rejected">Rejected</option>
									</select>
									<button
										on:click={loadReviews}
										class="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium"
									>
										Load reviews
									</button>
								</div>
								{#if reviewsActionMessage}
									<p class="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-3">{reviewsActionMessage}</p>
								{/if}
							</div>

							{#if reviewsLoading}
								<p class="text-sm text-gray-500">Loading reviews...</p>
							{:else if reviewsError}
								<p class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{reviewsError}</p>
							{:else if reviews.length === 0}
								<p class="text-sm text-gray-500">No reviews right now.</p>
							{:else}
								<div class="overflow-x-auto border border-gray-100 rounded-xl">
									<table class="w-full text-sm">
										<thead class="bg-gray-50 text-left text-gray-600">
											<tr>
												<th class="px-4 py-3 font-medium">Review</th>
												<th class="px-4 py-3 font-medium">Ride</th>
												<th class="px-4 py-3 font-medium">Status</th>
												<th class="px-4 py-3 font-medium">Action</th>
											</tr>
										</thead>
										<tbody class="divide-y divide-gray-100">
											{#each reviews as review}
												<tr class="hover:bg-gray-50">
													<td class="px-4 py-3 align-top">
														<p class="text-sm font-semibold text-gray-900">{review.rating}/5</p>
														<p class="text-xs text-gray-500 mt-1">
															Reviewer: {review.reviewer_profile?.first_name} {review.reviewer_profile?.last_name}
														</p>
														<p class="text-xs text-gray-500">
															Reviewee: {review.reviewee_profile?.first_name} {review.reviewee_profile?.last_name}
														</p>
														<p class="text-sm text-gray-700 mt-2">{review.comment || 'No comment'}</p>
														{#if review.admin_note}
															<p class="text-xs text-gray-500 mt-1">Admin note: {review.admin_note}</p>
														{/if}
													</td>
													<td class="px-4 py-3 align-top text-xs text-gray-600">
														<p>
															{review.ride?.departure || '-'} -> {review.ride?.arrival || '-'}
														</p>
														<p class="mt-1">{review.ride?.ride_date ? new Date(review.ride.ride_date).toLocaleString('en-US') : '-'}</p>
													</td>
													<td class="px-4 py-3 align-top">
														<span class={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
															review.status === 'pending'
																? 'bg-yellow-100 text-yellow-700'
																: review.status === 'approved'
																	? 'bg-green-100 text-green-700'
																	: 'bg-red-100 text-red-700'
														}`}>
															{review.status}
														</span>
													</td>
													<td class="px-4 py-3 align-top">
														<div class="flex flex-wrap gap-2">
															<button
																disabled={reviewActionId === review.id || review.status === 'approved'}
																on:click={() => moderateReview(review, 'approved')}
																class="px-3 py-1 rounded text-xs border border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-50"
															>
																Approve
															</button>
															<button
																disabled={reviewActionId === review.id || review.status === 'rejected'}
																on:click={() => moderateReview(review, 'rejected')}
																class="px-3 py-1 rounded text-xs border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
															>
																Reject
															</button>
														</div>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</div>
					{:else if activeTab === 'transactions'}
						<div class="space-y-6">
							<div class="bg-white rounded-xl p-4 border border-gray-200">
								<div class="grid grid-cols-1 md:grid-cols-4 gap-3">
									<select
										class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
										bind:value={transactionFilterStatus}
										on:change={loadTransactions}
									>
										<option value="">Tous les statuts</option>
										<option value="succeeded">Succeeded</option>
										<option value="failed">Failed</option>
									</select>
									<button
										on:click={loadTransactions}
										class="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium"
									>
										Charger transactions
									</button>
								</div>
								{#if transactionsActionMessage}
									<p class="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-3">{transactionsActionMessage}</p>
								{/if}
							</div>

							{#if transactionsLoading}
								<p class="text-sm text-gray-500">Loading transactions...</p>
							{:else if transactionsError}
								<p class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{transactionsError}</p>
							{:else if transactions.length === 0}
								<p class="text-sm text-gray-500">No transactions.</p>
							{:else}
								<div class="overflow-x-auto border border-gray-100 rounded-xl">
									<table class="w-full text-sm">
										<thead class="bg-gray-50 text-left text-gray-600">
											<tr>
												<th class="px-4 py-3 font-medium">Client</th>
												<th class="px-4 py-3 font-medium">Statut</th>
												<th class="px-4 py-3 font-medium">Montant</th>
												<th class="px-4 py-3 font-medium">Remboursement</th>
												<th class="px-4 py-3 font-medium">Date</th>
												<th class="px-4 py-3 font-medium">Action</th>
											</tr>
										</thead>
										<tbody class="divide-y divide-gray-100">
											{#each transactions as tx}
												<tr class="hover:bg-gray-50">
													<td class="px-4 py-3">
														<p class="font-medium text-gray-900">
															{tx.profiles?.first_name} {tx.profiles?.last_name}
														</p>
														<p class="text-xs text-gray-500">{tx.profiles?.email || '-'}</p>
													</td>
													<td class="px-4 py-3">
														<span class={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
															tx.status === 'succeeded' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
														}`}>
															{tx.status === 'succeeded' ? 'Succeeded' : 'Failed'}
														</span>
													</td>
													<td class="px-4 py-3 font-medium text-gray-900">
														{new Intl.NumberFormat('en-US', {
															style: 'currency',
															currency: tx.currency || 'USD'
														}).format(Number(tx.amount || 0))}
													</td>
													<td class="px-4 py-3">
														<span class={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
															tx.refund_status === 'refunded' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700'
														}`}>
															{tx.refund_status === 'refunded' ? 'Refunded' : 'None'}
														</span>
													</td>
													<td class="px-4 py-3 text-gray-600">
														{new Date(tx.created_at).toLocaleDateString('en-US')}
													</td>
													<td class="px-4 py-3">
														<button
															disabled={tx.refund_status === 'refunded' || tx.status !== 'succeeded' || transactionActionId === tx.id}
															on:click={() => refundTransaction(tx)}
															class="px-3 py-1 rounded text-xs font-medium border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
														>
															{transactionActionId === tx.id ? 'Traitement...' : 'Rembourser'}
														</button>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</div>
					{:else if activeTab === 'settings'}
						<div class="space-y-6">
							<div class="bg-white rounded-xl border border-gray-200 p-5">
								<h3 class="text-base font-semibold text-gray-900 mb-4">Platform settings</h3>
								{#if settingsError}
									<p class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{settingsError}</p>
								{/if}
								{#if settingsMessage}
									<p class="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">{settingsMessage}</p>
								{/if}
								{#if settingsLoading}
									<p class="text-sm text-gray-500">Loading settings...</p>
								{:else}
									<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
										<div>
											<p class="block text-xs font-medium text-gray-600 mb-1">Commission (%)</p>
											<input
												id="commission-percent"
												type="number"
												min="0"
												max="100"
												step="0.1"
												bind:value={commissionPercent}
												class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
											/>
										</div>
										<div>
											<p class="block text-xs font-medium text-gray-600 mb-1">Places max par trajet</p>
											<input
												id="max-seats-limit"
												type="number"
												min="1"
												bind:value={maxSeatsLimit}
												class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
											/>
										</div>
										<div>
											<p class="block text-xs font-medium text-gray-600 mb-1">Prix max (USD)</p>
											<input
												id="max-price-limit"
												type="number"
												min="1"
												step="0.01"
												bind:value={maxPriceLimit}
												class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
											/>
										</div>
									</div>
									<div class="mt-4 flex justify-end">
										<button
											on:click={savePlatformSettings}
											disabled={settingsSaving}
											class="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
										>
											{settingsSaving ? 'Enregistrement...' : 'Enregistrer'}
										</button>
									</div>
								{/if}
							</div>

							<div class="bg-white rounded-xl border border-gray-200 p-5">
								<h3 class="text-base font-semibold text-gray-900 mb-4">Admin management</h3>
								<p class="text-sm text-gray-500 mb-4">Promote or demote administrator accounts.</p>
								{#if usersLoading}
									<p class="text-sm text-gray-500">Loading users...</p>
								{:else if users.length === 0}
									<p class="text-sm text-gray-500">No users available.</p>
								{:else}
									<div class="overflow-x-auto border border-gray-100 rounded-xl">
										<table class="w-full text-sm">
											<thead class="bg-gray-50 text-left text-gray-600">
												<tr>
													<th class="px-4 py-3 font-medium">Utilisateur</th>
													<th class="px-4 py-3 font-medium">Role</th>
													<th class="px-4 py-3 font-medium">Action</th>
												</tr>
											</thead>
											<tbody class="divide-y divide-gray-100">
												{#each users as adminUser}
													<tr class="hover:bg-gray-50">
														<td class="px-4 py-3">
															<p class="font-medium text-gray-900">{`${adminUser.first_name ?? ''} ${adminUser.last_name ?? ''}`.trim() || 'Sans nom'}</p>
															<p class="text-xs text-gray-500">{adminUser.email ?? 'Email not provided'}</p>
														</td>
														<td class="px-4 py-3">
															<span class={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${adminUser.is_admin ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
																{adminUser.is_admin ? 'Admin' : 'Utilisateur'}
															</span>
														</td>
														<td class="px-4 py-3">
															<button
																type="button"
																disabled={actionUserId === adminUser.id}
																on:click={() => updateUserFlag(adminUser, 'is_admin', !adminUser.is_admin)}
																class="px-3 py-1.5 rounded text-xs font-medium border {adminUser.is_admin ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-green-200 text-green-700 hover:bg-green-50'} disabled:opacity-50"
															>
																{adminUser.is_admin ? 'Retirer admin' : 'Promouvoir admin'}
															</button>
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{/if}
							</div>
						</div>
					{:else if activeTab === 'support'}
						<div class="space-y-6">
							<div class="bg-white rounded-xl p-4 border border-gray-200">
								<div class="grid grid-cols-1 md:grid-cols-4 gap-3">
									<select
										class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
										bind:value={supportFilterStatus}
										on:change={loadSupportTickets}
									>
										<option value="">All tickets</option>
										<option value="open">Open</option>
										<option value="in_progress">En cours</option>
										<option value="resolved">Resolved</option>
										<option value="closed">Closed</option>
									</select>
									<button
										on:click={loadSupportTickets}
										class="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium"
									>
										Refresh tickets
									</button>
								</div>
							</div>

							{#if supportError}
								<p class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{supportError}</p>
							{/if}
							{#if supportActionMessage}
								<p class="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{supportActionMessage}</p>
							{/if}

							<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
								<div class="lg:col-span-1 border border-gray-200 rounded-xl overflow-hidden">
									<div class="bg-gray-50 px-4 py-3 border-b border-gray-200">
										<h3 class="text-sm font-semibold text-gray-900">Support tickets</h3>
									</div>
									{#if supportLoading}
										<p class="text-sm text-gray-500 px-4 py-3">Loading...</p>
									{:else if supportTickets.length === 0}
										<p class="text-sm text-gray-500 px-4 py-3">No tickets.</p>
									{:else}
										<div class="max-h-125 overflow-y-auto divide-y divide-gray-100">
											{#each supportTickets as ticket}
												<button
													type="button"
													on:click={() => openSupportTicket(ticket)}
													class="w-full text-left px-4 py-3 hover:bg-gray-50 {selectedSupportTicket?.id === ticket.id ? 'bg-green-50' : ''}"
												>
													<p class="text-sm font-medium text-gray-900 truncate">{ticket.subject}</p>
													<p class="text-xs text-gray-500 truncate">
														{ticket.profiles?.first_name} {ticket.profiles?.last_name} • {ticket.profiles?.email}
													</p>
													<div class="mt-1 flex gap-1">
														<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700">
															{ticket.priority}
														</span>
														<span class={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
																ticket.status === 'open'
																	? 'bg-yellow-100 text-yellow-700'
																	: ticket.status === 'in_progress'
																		? 'bg-indigo-100 text-indigo-700'
																		: ticket.status === 'resolved'
																			? 'bg-green-100 text-green-700'
																			: 'bg-gray-100 text-gray-700'
														}`}>
															{ticket.status}
														</span>
													</div>
												</button>
											{/each}
										</div>
									{/if}
								</div>

								<div class="lg:col-span-2 border border-gray-200 rounded-xl overflow-hidden">
									<div class="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
										<h3 class="text-sm font-semibold text-gray-900">
											{selectedSupportTicket ? `Ticket: ${selectedSupportTicket.subject}` : 'Conversation'}
										</h3>
										{#if selectedSupportTicket}
											<div class="flex gap-2">
												<select
													disabled={supportUpdatingStatus}
													class="px-2 py-1 border border-gray-300 rounded text-xs"
													on:change={(e) => updateSupportTicketStatus((e.currentTarget as HTMLSelectElement).value as SupportTicket['status'])}
												>
													<option selected={selectedSupportTicket.status === 'open'} value="open">Open</option>
													<option selected={selectedSupportTicket.status === 'in_progress'} value="in_progress">En cours</option>
													<option selected={selectedSupportTicket.status === 'resolved'} value="resolved">Resolved</option>
													<option selected={selectedSupportTicket.status === 'closed'} value="closed">Closed</option>
												</select>
											</div>
										{/if}
									</div>

									{#if !selectedSupportTicket}
										<p class="text-sm text-gray-500 p-4">Select a ticket to view messages.</p>
									{:else}
										<div class="p-4 space-y-3 max-h-105 overflow-y-auto bg-gray-50">
											{#if supportMessagesLoading}
												<p class="text-sm text-gray-500">Loading conversation...</p>
											{:else if supportMessages.length === 0}
												<p class="text-sm text-gray-500">No messages.</p>
											{:else}
												{#each supportMessages as msg}
													<div class="{msg.sender_role === 'admin' ? 'text-right' : 'text-left'}">
														<div class="inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm {msg.sender_role === 'admin' ? 'bg-green-100 text-green-900' : 'bg-white border border-gray-200 text-gray-800'}">
															<p class="text-[11px] opacity-70 mb-1">
																{msg.sender_role === 'admin' ? 'Admin' : 'User'} • {new Date(msg.created_at).toLocaleString('en-US')}
															</p>
															<p>{msg.message}</p>
														</div>
													</div>
												{/each}
											{/if}
										</div>

										<div class="p-4 border-t border-gray-200 space-y-2">
											<textarea
												rows="3"
												bind:value={supportReplyMessage}
												placeholder="Reply to user..."
												class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
											></textarea>
											<div class="flex justify-end">
												<button
													disabled={supportSendingReply || !supportReplyMessage.trim()}
													on:click={sendSupportReply}
													class="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
												>
													{supportSendingReply ? 'Sending...' : 'Reply'}
												</button>
											</div>
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
	<!-- Ride Bookings Modal -->
	{#if showRideBookingsModal && selectedRideForBookings}
		<div class="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
			<div class="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
				<!-- Modal Header -->
				<div class="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
					<div>
						<h2 class="text-lg font-bold text-gray-900">Bookings</h2>
						<p class="text-sm text-gray-500">{selectedRideForBookings.city_from} → {selectedRideForBookings.city_to}</p>
					</div>
					<button
						on:click={closeRideBookingsModal}
						class="text-gray-400 hover:text-gray-600 text-xl font-semibold p-1"
						aria-label="Close"
						title="Close modal"
					>
						×
					</button>
				</div>

				<!-- Modal Content -->
				<div class="p-6">
					{#if rideBookingsLoading}
						<div class="text-center py-8">
							<div class="inline-block animate-spin">
								<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
							</div>
						</div>
					{:else if rideBookings.length === 0}
						<p class="text-gray-500 text-center py-4">No bookings for this ride.</p>
					{:else}
						<div class="space-y-4">
							{#each rideBookings as booking}
								<div class="border border-gray-200 rounded-lg p-4">
									<div class="flex items-center justify-between mb-2">
										<div>
											<h3 class="text-sm font-semibold text-gray-900">
												{booking.profiles?.first_name} {booking.profiles?.last_name}
											</h3>
											<p class="text-xs text-gray-500">{booking.profiles?.email}</p>
										</div>
										<span class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
											booking.status === 'Confirmed'
												? 'bg-green-100 text-green-800'
												: booking.status === 'Cancelled'
													? 'bg-red-100 text-red-800'
													: 'bg-gray-100 text-gray-800'
										}`}>
											{booking.status === 'Confirmed' ? 'Confirmed' : booking.status === 'Cancelled' ? 'Cancelled' : booking.status}
										</span>
									</div>
									<div class="text-sm text-gray-600">
										<p><strong>Booked seats:</strong> {booking.seats_booked}</p>
										<p><strong>Booked on:</strong> {new Date(booking.created_at).toLocaleDateString('en-US')}</p>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
	<!-- Booking Details Modal -->
	{#if showBookingDetailsModal && selectedBooking}
		<div class="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
			<div class="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
				<!-- Modal Header -->
				<div class="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
					<h2 class="text-lg font-bold text-gray-900">Booking details</h2>
					<button
						on:click={closeBookingDetailsModal}
						class="text-gray-400 hover:text-gray-600 text-xl font-semibold p-1"
						aria-label="Close"
						title="Close modal"
					>
						×
					</button>
				</div>

				<!-- Modal Content -->
				<div class="p-6 space-y-6">
					<!-- Booking Status -->
					<div class="border border-gray-200 rounded-lg p-4">
						<h3 class="text-sm font-semibold text-gray-900 mb-3">Booking status</h3>
						<div class="flex items-center justify-between">
							<span class="text-sm text-gray-600">Status:</span>
							<span class={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
								selectedBooking.status === 'Confirmed'
									? 'bg-green-100 text-green-800'
									: selectedBooking.status === 'Pending'
										? 'bg-yellow-100 text-yellow-800'
										: 'bg-red-100 text-red-800'
							}`}>
								{selectedBooking.status === 'Confirmed' ? '✓ Confirmed' : selectedBooking.status === 'Pending' ? '⏳ Pending' : '✕ Cancelled'}
							</span>
						</div>
						<p class="text-xs text-gray-500 mt-2">Booked on {new Date(selectedBooking.created_at).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
					</div>

					<!-- Passenger Information -->
					<div class="border border-gray-200 rounded-lg p-4">
						<h3 class="text-sm font-semibold text-gray-900 mb-4">Passenger information</h3>
						{#if riderDetailsLoading}
							<div class="text-center py-4">
								<div class="inline-block animate-spin">
									<svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
										<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
									</svg>
								</div>
							</div>
						{:else if selectedBookingRider}
							<div class="space-y-3">
								<div class="grid grid-cols-2 gap-4">
									<div>
										<p class="text-xs text-gray-500">Nom</p>
										<p class="text-sm font-medium text-gray-900">{selectedBookingRider.first_name} {selectedBookingRider.last_name}</p>
									</div>
									<div>
										<p class="text-xs text-gray-500">Email</p>
										<p class="text-sm font-medium text-gray-900">{selectedBookingRider.email}</p>
									</div>
									<div>
										<p class="text-xs text-gray-500">Phone</p>
										<p class="text-sm font-medium text-gray-900">{selectedBookingRider.phone_number || 'Not provided'}</p>
									</div>
									<div>
										<p class="text-xs text-gray-500">Note moyenne</p>
										<p class="text-sm font-medium text-gray-900">{selectedBookingRider.average_rating ? `${selectedBookingRider.average_rating}/5 ⭐` : 'No reviews'}</p>
									</div>
								</div>
								<div class="pt-2">
									<p class="text-xs text-gray-500">Account status</p>
									<span class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
										selectedBookingRider.user_status === 'active'
											? 'bg-green-100 text-green-800'
											: selectedBookingRider.user_status === 'suspended'
												? 'bg-yellow-100 text-yellow-800'
												: 'bg-red-100 text-red-800'
									}`}>
										{selectedBookingRider.user_status === 'active' ? 'Active' : selectedBookingRider.user_status === 'suspended' ? 'Suspended' : 'Banned'}
									</span>
								</div>
							</div>
						{/if}
					</div>

					<!-- Ride Information -->
					<div class="border border-gray-200 rounded-lg p-4">
						<h3 class="text-sm font-semibold text-gray-900 mb-4">Ride information</h3>
						<div class="space-y-3">
							<div class="grid grid-cols-2 gap-4">
								<div>
									<p class="text-xs text-gray-500">Route</p>
									<p class="text-sm font-medium text-gray-900">{selectedBooking.rides?.city_from} → {selectedBooking.rides?.city_to}</p>
								</div>
								<div>
									<p class="text-xs text-gray-500">Ride date</p>
									<p class="text-sm font-medium text-gray-900">
										{new Date(selectedBooking.rides?.ride_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
									</p>
								</div>
								<div>
									<p class="text-xs text-gray-500">Booked seats</p>
									<p class="text-sm font-medium text-gray-900">{selectedBooking.seats_booked}</p>
								</div>
								<div>
									<p class="text-xs text-gray-500">Prix par place</p>
									<p class="text-sm font-medium text-gray-900">
										{new Intl.NumberFormat('en-US', {
											style: 'currency',
											currency: 'USD'
										}).format(selectedBooking.rides?.price || 0)}
									</p>
								</div>
								<div>
									<p class="text-xs text-gray-500">Total</p>
									<p class="text-sm font-bold text-green-600">
										{new Intl.NumberFormat('en-US', {
											style: 'currency',
											currency: 'USD'
										}).format((selectedBooking.rides?.price || 0) * selectedBooking.seats_booked)}
									</p>
								</div>
							</div>
						</div>
					</div>

					<!-- Actions -->
					<div class="flex gap-2 justify-end">
						<button
							on:click={closeBookingDetailsModal}
							class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
						>
							Close
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
	<!-- Report History Modal -->
	{#if showReportHistoryModal && selectedReportHistory}
		<div class="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
			<div class="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
				<div class="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
					<h2 class="text-lg font-bold text-gray-900">Report history</h2>
					<button
						on:click={closeReportHistoryModal}
						class="text-gray-400 hover:text-gray-600 text-xl font-semibold p-1"
						aria-label="Close"
						title="Close modal"
					>
						×
					</button>
				</div>
				<div class="p-6 space-y-4 text-sm">
					<div class="rounded-lg border border-gray-200 p-4">
						<p class="text-gray-500">Type</p>
						<p class="font-medium text-gray-900">{reportTypeLabel(selectedReportHistory.type)}</p>
					</div>
					<div class="rounded-lg border border-gray-200 p-4">
						<p class="text-gray-500">Description</p>
						<p class="font-medium text-gray-900">{selectedReportHistory.description || 'Sans description'}</p>
					</div>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div class="rounded-lg border border-gray-200 p-4">
							<p class="text-gray-500">Created on</p>
							<p class="font-medium text-gray-900">{new Date(selectedReportHistory.created_at).toLocaleString('en-US')}</p>
						</div>
						<div class="rounded-lg border border-gray-200 p-4">
							<p class="text-gray-500">Last updated</p>
							<p class="font-medium text-gray-900">{new Date(selectedReportHistory.updated_at).toLocaleString('en-US')}</p>
						</div>
					</div>
					<div class="rounded-lg border border-gray-200 p-4">
						<p class="text-gray-500">Action prise</p>
						<p class="font-medium text-gray-900">{selectedReportHistory.action_taken || 'No action yet'}</p>
					</div>
					<div class="rounded-lg border border-gray-200 p-4">
						<p class="text-gray-500">Note admin</p>
						<p class="font-medium text-gray-900">{selectedReportHistory.admin_note || 'No note'}</p>
					</div>
				</div>
			</div>
		</div>
	{/if}
	<!-- Profile Modal -->
	{#if showProfileModal && selectedProfile}
		<div class="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
			<div class="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
				<!-- Modal Header -->
				<div class="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
					<div>
						<h2 class="text-lg font-bold text-gray-900">{selectedProfile.first_name} {selectedProfile.last_name}</h2>
						<p class="text-sm text-gray-500">{selectedProfile.email}</p>
					</div>
					<button
						type="button"
						on:click={closeProfileModal}
						class="text-gray-400 hover:text-gray-600"
						aria-label="Close"
						title="Close"
					>
						<span class="sr-only">Close</span>
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<!-- Modal Body -->
				<div class="p-6 space-y-6">
					<!-- Profile Info -->
					<div>
						<h3 class="text-sm font-semibold text-gray-900 mb-3">Personal information</h3>
						<div class="grid grid-cols-2 gap-4 text-sm">
							<div>
								<p class="text-gray-500">Phone</p>
								<p class="font-medium text-gray-900">{selectedProfile.phone_number || '-'}</p>
							</div>
							<div>
								<p class="text-gray-500">Average rating</p>
								<p class="font-medium text-gray-900">{selectedProfile.average_rating ? selectedProfile.average_rating.toFixed(1) + ' ⭐' : '-'}</p>
							</div>
							<div>
								<p class="text-gray-500">Created</p>
								<p class="font-medium text-gray-900">{selectedProfile.created_at ? new Date(selectedProfile.created_at).toLocaleDateString('en-US') : '-'}</p>
							</div>
							<div>
								<p class="text-gray-500">Role</p>
								<p class="font-medium text-gray-900">{selectedProfile.is_admin ? 'Admin' : 'User'}</p>
							</div>
						</div>
					</div>

					<!-- Status Actions -->
					<div>
						<h3 class="text-sm font-semibold text-gray-900 mb-3">Account management</h3>
						{#if statusActionMessage}
							<p class="text-sm bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 mb-3">{statusActionMessage}</p>
						{/if}
						<div class="space-y-2">
							<button
								type="button"
								disabled={statusActionInProgress}
								on:click={() => changeUserStatus('active')}
								class="w-full px-4 py-2 rounded-lg border text-sm font-medium {selectedProfile.user_status === 'active' ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'} disabled:opacity-50"
							>
								{selectedProfile.user_status === 'active' ? '✓' : ''} Activate account
							</button>
							<button
								type="button"
								disabled={statusActionInProgress}
								on:click={() => changeUserStatus('suspended')}
								class="w-full px-4 py-2 rounded-lg border text-sm font-medium {selectedProfile.user_status === 'suspended' ? 'border-yellow-300 bg-yellow-50 text-yellow-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'} disabled:opacity-50"
							>
								{selectedProfile.user_status === 'suspended' ? '✓' : ''} Suspend account
							</button>
							<button
								type="button"
								disabled={statusActionInProgress}
								on:click={() => changeUserStatus('banned')}
								class="w-full px-4 py-2 rounded-lg border text-sm font-medium {selectedProfile.user_status === 'banned' ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'} disabled:opacity-50"
							>
								{selectedProfile.user_status === 'banned' ? '✓' : ''} Ban account
							</button>
							<button
								type="button"
								disabled={statusActionInProgress}
								on:click={resetUserPassword}
								class="w-full px-4 py-2 rounded-lg border border-blue-300 text-blue-700 bg-blue-50 text-sm font-medium hover:bg-blue-100 disabled:opacity-50"
							>
								Reset password
							</button>
						</div>
					</div>

					<!-- Verification Documents -->
					<div>
						<h3 class="text-sm font-semibold text-gray-900 mb-3">Verification documents</h3>
						{#if profileDocumentsError}
							<p class="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 mb-3">{profileDocumentsError}</p>
						{/if}
						{#if profileDocumentsMessage}
							<p class="text-sm bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 mb-3">{profileDocumentsMessage}</p>
						{/if}

						{#if profileDocumentsLoading}
							<p class="text-sm text-gray-500">Loading verification documents...</p>
						{:else if profileDocuments.length === 0}
							<p class="text-sm text-gray-500 italic">No verification documents uploaded.</p>
						{:else}
							<div class="space-y-2">
								{#each profileDocuments as doc}
									<div class="border border-gray-200 rounded-lg p-3">
										<div class="flex items-start justify-between gap-3">
											<div>
												<p class="text-sm font-semibold text-gray-900">{documentTypeLabel(doc.document_type)}</p>
												<p class="text-xs text-gray-500">{doc.file_name} • {new Date(doc.created_at).toLocaleDateString('en-US')}</p>
												{#if doc.admin_note}
													<p class="text-xs text-red-600 mt-1">Note: {doc.admin_note}</p>
												{/if}
											</div>
											<div class="flex items-center gap-2">
												<span class={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
													doc.status === 'approved'
														? 'bg-green-100 text-green-700'
														: doc.status === 'rejected'
															? 'bg-red-100 text-red-700'
															: 'bg-amber-100 text-amber-700'
												}`}>
													{doc.status === 'approved' ? 'Approved' : doc.status === 'rejected' ? 'Rejected' : 'Pending'}
												</span>
												{#if doc.signed_url}
													<a href={doc.signed_url} target="_blank" rel="noopener noreferrer" class="px-2 py-1 rounded text-xs border border-blue-200 text-blue-700 hover:bg-blue-50">Open</a>
												{/if}
												<button
													type="button"
													disabled={profileDocumentActionId === doc.id}
													on:click={() => reviewProfileDocument(doc, 'approved')}
													class="px-2 py-1 rounded text-xs border border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-50"
												>
													Approve
												</button>
												<button
													type="button"
													disabled={profileDocumentActionId === doc.id}
													on:click={() => reviewProfileDocument(doc, 'rejected')}
													class="px-2 py-1 rounded text-xs border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
												>
													Reject
												</button>
											</div>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Rides History -->
					<div>
						<h3 class="text-sm font-semibold text-gray-900 mb-3">Ride history</h3>
						{#if ridesLoading}
							<p class="text-sm text-gray-500">Loading...</p>
						{:else if profileRides.length === 0 && profileBookings.length === 0}
							<p class="text-sm text-gray-500 italic">No rides for this user.</p>
						{:else}
							<div class="space-y-3">
								{#if profileRides.length > 0}
									<div>
										<p class="text-xs font-medium text-gray-600 mb-2">Rides as driver</p>
										{#each profileRides as ride}
											<div class="text-xs border border-gray-200 rounded p-2 mb-2">
												<p><strong>{ride.city_from}</strong> → <strong>{ride.city_to}</strong></p>
												<p class="text-gray-600">{new Date(ride.ride_date).toLocaleDateString('en-US')} • {ride.available_seats} seats • ${ride.price}</p>
											</div>
										{/each}
									</div>
								{/if}
								{#if profileBookings.length > 0}
									<div>
										<p class="text-xs font-medium text-gray-600 mb-2">Booked rides</p>
										{#each profileBookings as booking}
											<div class="text-xs border border-gray-200 rounded p-2 mb-2">
												<p>{booking.ride?.[0]?.city_from || '-'} → {booking.ride?.[0]?.city_to || '-'} ({booking.seats_booked} seats)</p>
												<p class="text-gray-600">{booking.status}</p>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>

				<!-- Modal Footer -->
				<div class="flex justify-end gap-2 p-6 border-t border-gray-200 bg-gray-50 sticky bottom-0">
					<button
						type="button"
						on:click={closeProfileModal}
						class="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	{/if}
{/if}
