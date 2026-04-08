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
					"Impossible de verifier ton acces admin. Ton profil n'existe peut-etre pas encore dans la table profiles.";
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
				accessError = "Ton compte est connecte, mais il n'a pas encore le role admin.";
				loading = false;
				return;
			}

			isAdmin = true;
			await loadStats();
			await loadUsers();
			await loadRides();
			await loadBookings();
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
			statsError = 'Session expirée. Merci de te reconnecter.';
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
			statsError = payload?.error || 'Impossible de charger le tableau de bord.';
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
			usersError = 'Session expirée. Merci de te reconnecter.';
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
			usersError = payload?.error || "Impossible de charger les utilisateurs pour le moment.";
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
			usersActionMessage = 'Session expirée. Merci de te reconnecter.';
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
				"Action impossible pour le moment. Verifie que ton compte a bien le role admin dans profiles.";
			actionUserId = null;
			return;
		}

		users = users.map((u) =>
			u.id === targetUser.id ? { ...u, [field]: value, has_profile: true } : u
		);
		usersActionMessage =
			field === 'is_admin'
				? value
					? 'Le compte est maintenant admin.'
					: "Le role admin a ete retire."
				: value
					? 'Le compte est maintenant verifie.'
					: 'Le compte est repasse non verifie.';

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
	}

	async function openProfileModal(user: AdminUser) {
		selectedProfile = user;
		showProfileModal = true;
		profileRides = [];
		profileBookings = [];
		ridesLoading = true;

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

		ridesLoading = false;
	}

	function closeProfileModal() {
		showProfileModal = false;
		selectedProfile = null;
		profileRides = [];
		profileBookings = [];
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
			statusActionMessage = 'Session expirée. Merci de te reconnecter.';
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
			statusActionMessage = payload?.error || 'Erreur lors du changement de statut.';
			statusActionInProgress = false;
			return;
		}

		selectedProfile = { ...selectedProfile, user_status: status };
		users = users.map((u) =>
			u.id === selectedProfile?.id ? { ...u, user_status: status } : u
		);

		const statusLabels: Record<string, string> = {
			active: 'Compte activé',
			suspended: 'Compte suspendu',
			banned: 'Compte banni'
		};

		statusActionMessage = statusLabels[status] || 'Statut mis à jour';
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
			statusActionMessage = 'Session expirée. Merci de te reconnecter.';
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
			statusActionMessage = payload?.error || 'Erreur lors de la réinitialisation du mot de passe.';
			statusActionInProgress = false;
			return;
		}

		statusActionMessage = `Email de réinitialisation envoyé à ${selectedProfile.email}`;
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
			ridesManagementError = 'Session expirée. Merci de te reconnecter.';
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
			ridesManagementError = payload?.error || 'Impossible de charger les trajets.';
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
		if (!confirm(`Confirmer la suppression du trajet de ${ride.city_from} à ${ride.city_to} ?`)) {
			return;
		}

		deletingRideId = ride.id;
		ridesManagementActionMessage = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			ridesManagementActionMessage = 'Session expirée. Merci de te reconnecter.';
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
			ridesManagementActionMessage = payload?.error || 'Erreur lors de la suppression.';
			deletingRideId = null;
			return;
		}

		rides = rides.filter((r) => r.id !== ride.id);
		applyRideFilters();
		ridesManagementActionMessage = 'Trajet supprimé avec succès.';
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
			bookingsError = 'Session expirée. Merci de te reconnecter.';
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
			bookingsError = payload?.error || 'Impossible de charger les réservations.';
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
</script>

{#if loading}
	<div class="min-h-screen flex items-center justify-center">
		<div class="animate-spin rounded-full h-10 w-10 border-4 border-green-500 border-t-transparent"></div>
	</div>
{:else if accessError}
	<div class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
		<div class="max-w-xl w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
			<h1 class="text-xl font-bold text-gray-900 mb-2">Acces admin indisponible</h1>
			<p class="text-sm text-gray-600 mb-4">{accessError}</p>
			<p class="text-sm text-gray-500 mb-6">Compte connecte: {currentUser?.email ?? 'non detecte'}</p>
			<div class="flex gap-3">
				<a href="/profile" class="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700">Aller au profil</a>
				<a href="/" class="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">Retour accueil</a>
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
						<h1 class="text-lg font-bold text-gray-900">Panneau d'administration</h1>
						<p class="text-xs text-gray-500">Accès restreint</p>
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
				<!-- Utilisateurs -->
				<div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
					<div class="shrink-0 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
					</div>
					<div>
						<p class="text-xs text-gray-500">Utilisateurs</p>
						<p class="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
					</div>
				</div>
				<!-- Trajets actifs -->
				<div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
					<div class="shrink-0 w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
					</div>
					<div>
						<p class="text-xs text-gray-500">Trajets actifs</p>
						<p class="text-2xl font-bold text-gray-900">{stats.activeRides}</p>
					</div>
				</div>
				<!-- Trajets terminés -->
				<div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
					<div class="shrink-0 w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<div>
						<p class="text-xs text-gray-500">Terminés</p>
						<p class="text-2xl font-bold text-gray-900">{stats.completedRides}</p>
					</div>
				</div>
				<!-- Réservations -->
				<div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
					<div class="shrink-0 w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
						</svg>
					</div>
					<div>
						<p class="text-xs text-gray-500">Réservations</p>
						<p class="text-2xl font-bold text-gray-900">{stats.reservationsInProgress}</p>
					</div>
				</div>
				<!-- Alertes -->
				<div class="bg-white rounded-xl border p-4 shadow-sm flex items-center gap-3 {stats.alerts.total > 0 ? 'border-orange-200' : 'border-gray-100'}">
					<div class="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center {stats.alerts.total > 0 ? 'bg-orange-50' : 'bg-gray-100'}">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 {stats.alerts.total > 0 ? 'text-orange-500' : 'text-gray-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
						</svg>
					</div>
					<div>
						<p class="text-xs text-gray-500">Alertes</p>
						<p class="text-2xl font-bold {stats.alerts.total > 0 ? 'text-orange-500' : 'text-gray-900'}">{stats.alerts.total}</p>
					</div>
				</div>
			</div>

			<!-- Tab navigation -->
			<div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
				<div class="flex border-b border-gray-100">
					{#each [
						{ id: 'overview', label: 'Vue d\'ensemble' },
						{ id: 'users', label: 'Utilisateurs' },
						{ id: 'rides', label: 'Trajets' },
						{ id: 'bookings', label: 'Réservations' }
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
							<!-- Titre section -->
							<div>
								<h2 class="text-base font-semibold text-gray-900">Aperçu de la plateforme</h2>
								<p class="text-sm text-gray-500 mt-0.5">Indicateurs clés en temps réel.</p>
							</div>

							<!-- Trajets -->
							<div>
								<h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Trajets</h3>
								<div class="grid md:grid-cols-2 gap-4">
									<div class="rounded-xl border border-green-200 bg-green-50 p-5">
										<div class="flex items-center justify-between mb-2">
											<p class="text-sm font-semibold text-green-800">Trajets actifs</p>
											<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">{stats.activeRides}</span>
										</div>
										<p class="text-xs text-green-700 mb-3">Date de départ à venir — disponibles à la réservation.</p>
										{#if stats.activeRides + stats.completedRides > 0}
											<div>
												<div class="flex justify-between text-xs text-green-700 mb-1">
													<span>Part des actifs</span>
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
											<p class="text-sm font-semibold text-gray-700">Trajets terminés</p>
											<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-200 text-gray-600">{stats.completedRides}</span>
										</div>
										<p class="text-xs text-gray-500 mb-1">Date de départ passée.</p>
										<p class="text-xs text-gray-500">
											Total créés : <span class="font-semibold text-gray-700">{stats.activeRides + stats.completedRides}</span>
										</p>
									</div>
								</div>
							</div>

							<!-- Réservations + Revenus -->
							<div class="grid md:grid-cols-2 gap-4">
								<div class="rounded-xl border border-purple-200 bg-purple-50 p-5">
									<div class="flex items-center justify-between mb-2">
										<p class="text-sm font-semibold text-purple-800">Réservations en cours</p>
										<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">{stats.reservationsInProgress}</span>
									</div>
									<p class="text-xs text-purple-700">Statut <strong>En attente</strong> ou <strong>Confirmée</strong> — départ pas encore effectué.</p>
								</div>
								<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
									<div class="flex items-center justify-between mb-2">
										<p class="text-sm font-semibold text-emerald-800">Revenus estimés</p>
										{#if stats.revenue.hasPaymentIntegration}
											<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-200 text-emerald-700">Intégré</span>
										{:else}
											<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Estimation</span>
										{/if}
									</div>
									<p class="text-2xl font-bold text-emerald-700">
										{stats.revenue.estimatedRevenue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
									</p>
									{#if !stats.revenue.hasPaymentIntegration}
										<p class="text-xs text-emerald-700 mt-1">Calculé sur les réservations confirmées (prix × sièges). Paiements non intégrés.</p>
									{/if}
								</div>
							</div>

							<!-- Alertes -->
							<div>
								<h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Alertes</h3>
								<div class="grid md:grid-cols-2 gap-4">
									<div class="rounded-xl border p-5 {stats.alerts.reports > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}">
										<div class="flex items-center justify-between mb-2">
											<p class="text-sm font-semibold {stats.alerts.reports > 0 ? 'text-red-800' : 'text-gray-600'}">Signalements</p>
											<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold {stats.alerts.reports > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'}">{stats.alerts.reports}</span>
										</div>
										{#if stats.alerts.reports === 0}
											<p class="text-xs text-gray-500">Aucun signalement en attente.</p>
										{:else}
											<p class="text-xs text-red-700 mb-2">Des signalements nécessitent une action.</p>
											<button type="button" on:click={() => setTab('reports')} class="text-xs font-medium text-red-700 underline hover:text-red-900 cursor-pointer">
												Voir les signalements →
											</button>
										{/if}
									</div>
									<div class="rounded-xl border p-5 {stats.alerts.accountsToVerify > 0 ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-gray-50'}">
										<div class="flex items-center justify-between mb-2">
											<p class="text-sm font-semibold {stats.alerts.accountsToVerify > 0 ? 'text-orange-800' : 'text-gray-600'}">Comptes à vérifier</p>
											<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold {stats.alerts.accountsToVerify > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'}">{stats.alerts.accountsToVerify}</span>
										</div>
										{#if stats.alerts.accountsToVerify === 0}
											<p class="text-xs text-gray-500">Tous les comptes sont vérifiés.</p>
										{:else}
											<p class="text-xs text-orange-700 mb-2">Profils non vérifiés ou sans entrée dans la table profiles.</p>
											<button type="button" on:click={() => setTab('users')} class="text-xs font-medium text-orange-700 underline hover:text-orange-900 cursor-pointer">
												Voir les utilisateurs →
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
									<h2 class="text-lg font-semibold text-gray-900">Gestion des utilisateurs</h2>
									<p class="text-sm text-gray-500">Recherche par nom ou email, gestion des droits et verification.</p>
								</div>
								<div class="flex gap-2">
									<input
										type="text"
										bind:value={userSearch}
										placeholder="Rechercher un nom ou un email"
										class="w-72 max-w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
									/>
									<button
										type="button"
										on:click={loadUsers}
										class="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
									>
										Rafraichir
									</button>
								</div>
							</div>

							{#if usersActionMessage}
								<p class="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{usersActionMessage}</p>
							{/if}

							{#if usersError}
								<p class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{usersError}</p>
							{:else if usersLoading}
								<p class="text-sm text-gray-500">Chargement des utilisateurs...</p>
							{:else if filteredUsers.length === 0}
								<p class="text-sm text-gray-500">Aucun utilisateur ne correspond a la recherche.</p>
							{:else}
								<div class="overflow-x-auto border border-gray-100 rounded-xl">
									<table class="w-full text-sm">
										<thead class="bg-gray-50 text-left text-gray-600">
											<tr>
												<th class="px-4 py-3 font-medium">Utilisateur</th>
												<th class="px-4 py-3 font-medium">Vérification</th>
												<th class="px-4 py-3 font-medium">Status</th>
												<th class="px-4 py-3 font-medium">Note</th>
												<th class="px-4 py-3 font-medium">Inscription</th>
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
															{new Date(adminUser.created_at).toLocaleDateString('fr-FR')}
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
								<h3 class="text-sm font-semibold text-gray-900 mb-4">Filtres</h3>
								<div class="grid grid-cols-1 md:grid-cols-5 gap-3">
									<input
										type="text"
										placeholder="Ville départ"
										class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
										bind:value={rideFilterCityFrom}
										on:change={loadRides}
									/>
									<input
										type="text"
										placeholder="Ville arrivée"
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
										<option value="">Tous les statuts</option>
										<option value="Actif">Actif</option>
										<option value="Complet">Complet</option>
										<option value="Annulé">Annulé</option>
										<option value="Terminé">Terminé</option>
									</select>
									<button
										on:click={loadRides}
										class="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium"
									>
										Charger trajets
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
										Réessayer
									</button>
								</div>
							{:else if filteredRides.length === 0}
								<div class="bg-gray-50 rounded-xl p-8 text-center">
									<p class="text-gray-500 text-sm">Aucun trajet trouvé.</p>
									<button
										on:click={loadRides}
										class="mt-3 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
									>
										Recharger
									</button>
								</div>
							{:else}
								<div class="overflow-x-auto">
									<table class="w-full text-sm">
										<thead class="bg-gray-50 border-b border-gray-200">
											<tr>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Conducteur</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Trajet</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Date</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Prix</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Places</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Statut</th>
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
															{new Date(ride.ride_date).toLocaleDateString('fr-FR', {
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
															{ride.status}
														</span>
													</td>
													<td class="px-4 py-3">
														<div class="flex gap-2">
															<button
																on:click={() => showRideBookings(ride)}
																class="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
															>
																Réservations
															</button>
															<button
																on:click={() => deleteRide(ride)}
																disabled={deletingRideId === ride.id}
																class="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-50"
															>
																{deletingRideId === ride.id ? 'Suppression...' : 'Supprimer'}
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
								<h3 class="text-sm font-semibold text-gray-900 mb-4">Filtres</h3>
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
										<option value="">Tous les statuts</option>
										<option value="Confirmed">Confirmée</option>
										<option value="Pending">En attente</option>
										<option value="Cancelled">Annulée</option>
									</select>
									<button
										on:click={loadBookings}
										class="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium"
									>
										Charger réservations
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
										Réessayer
									</button>
								</div>
							{:else if filteredBookings.length === 0}
								<div class="bg-gray-50 rounded-xl p-8 text-center">
									<p class="text-gray-500 text-sm">Aucune réservation trouvée.</p>
									<button
										on:click={loadBookings}
										class="mt-3 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
									>
										Recharger
									</button>
								</div>
							{:else}
								<div class="overflow-x-auto">
									<table class="w-full text-sm">
										<thead class="bg-gray-50 border-b border-gray-200">
											<tr>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Passager</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Trajet</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Places</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Statut</th>
												<th class="px-4 py-3 text-left font-semibold text-gray-900">Date réservation</th>
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
															{new Date(booking.rides?.ride_date).toLocaleDateString('fr-FR', {
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
															{booking.status === 'Confirmed' ? 'Confirmée' : booking.status === 'Pending' ? 'En attente' : booking.status === 'Cancelled' ? 'Annulée' : booking.status}
														</span>
													</td>
													<td class="px-4 py-3">
														<div class="text-sm text-gray-600">
															{new Date(booking.created_at).toLocaleDateString('fr-FR')}
														</div>
													</td>
													<td class="px-4 py-3">
														<button
															on:click={() => showBookingDetails(booking)}
															class="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
														>
															Détails
														</button>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
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
						<h2 class="text-lg font-bold text-gray-900">Réservations</h2>
						<p class="text-sm text-gray-500">{selectedRideForBookings.city_from} → {selectedRideForBookings.city_to}</p>
					</div>
					<button
						on:click={closeRideBookingsModal}
						class="text-gray-400 hover:text-gray-600 text-xl font-semibold p-1"
						aria-label="Fermer"
						title="Fermer la modale"
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
						<p class="text-gray-500 text-center py-4">Aucune réservation pour ce trajet.</p>
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
											{booking.status === 'Confirmed' ? 'Confirmée' : booking.status === 'Cancelled' ? 'Annulée' : booking.status}
										</span>
									</div>
									<div class="text-sm text-gray-600">
										<p><strong>Places réservées:</strong> {booking.seats_booked}</p>
										<p><strong>Réservé le:</strong> {new Date(booking.created_at).toLocaleDateString('fr-FR')}</p>
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
					<h2 class="text-lg font-bold text-gray-900">Détails de la réservation</h2>
					<button
						on:click={closeBookingDetailsModal}
						class="text-gray-400 hover:text-gray-600 text-xl font-semibold p-1"
						aria-label="Fermer"
						title="Fermer la modale"
					>
						×
					</button>
				</div>

				<!-- Modal Content -->
				<div class="p-6 space-y-6">
					<!-- Booking Status -->
					<div class="border border-gray-200 rounded-lg p-4">
						<h3 class="text-sm font-semibold text-gray-900 mb-3">État de la réservation</h3>
						<div class="flex items-center justify-between">
							<span class="text-sm text-gray-600">Statut:</span>
							<span class={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
								selectedBooking.status === 'Confirmed'
									? 'bg-green-100 text-green-800'
									: selectedBooking.status === 'Pending'
										? 'bg-yellow-100 text-yellow-800'
										: 'bg-red-100 text-red-800'
							}`}>
								{selectedBooking.status === 'Confirmed' ? '✓ Confirmée' : selectedBooking.status === 'Pending' ? '⏳ En attente' : '✕ Annulée'}
							</span>
						</div>
						<p class="text-xs text-gray-500 mt-2">Réservé le {new Date(selectedBooking.created_at).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
					</div>

					<!-- Passenger Information -->
					<div class="border border-gray-200 rounded-lg p-4">
						<h3 class="text-sm font-semibold text-gray-900 mb-4">Informations du passager</h3>
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
										<p class="text-xs text-gray-500">Téléphone</p>
										<p class="text-sm font-medium text-gray-900">{selectedBookingRider.phone_number || 'Non fourni'}</p>
									</div>
									<div>
										<p class="text-xs text-gray-500">Note moyenne</p>
										<p class="text-sm font-medium text-gray-900">{selectedBookingRider.average_rating ? `${selectedBookingRider.average_rating}/5 ⭐` : 'Pas d\'avis'}</p>
									</div>
								</div>
								<div class="pt-2">
									<p class="text-xs text-gray-500">Statut du compte</p>
									<span class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
										selectedBookingRider.user_status === 'active'
											? 'bg-green-100 text-green-800'
											: selectedBookingRider.user_status === 'suspended'
												? 'bg-yellow-100 text-yellow-800'
												: 'bg-red-100 text-red-800'
									}`}>
										{selectedBookingRider.user_status === 'active' ? 'Actif' : selectedBookingRider.user_status === 'suspended' ? 'Suspendu' : 'Banni'}
									</span>
								</div>
							</div>
						{/if}
					</div>

					<!-- Ride Information -->
					<div class="border border-gray-200 rounded-lg p-4">
						<h3 class="text-sm font-semibold text-gray-900 mb-4">Informations du trajet</h3>
						<div class="space-y-3">
							<div class="grid grid-cols-2 gap-4">
								<div>
									<p class="text-xs text-gray-500">Itinéraire</p>
									<p class="text-sm font-medium text-gray-900">{selectedBooking.rides?.city_from} → {selectedBooking.rides?.city_to}</p>
								</div>
								<div>
									<p class="text-xs text-gray-500">Date du trajet</p>
									<p class="text-sm font-medium text-gray-900">
										{new Date(selectedBooking.rides?.ride_date).toLocaleDateString('fr-FR', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
									</p>
								</div>
								<div>
									<p class="text-xs text-gray-500">Places réservées</p>
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
							Fermer
						</button>
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
						aria-label="Fermer"
						title="Fermer"
					>
						<span class="sr-only">Fermer</span>
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<!-- Modal Body -->
				<div class="p-6 space-y-6">
					<!-- Profile Info -->
					<div>
						<h3 class="text-sm font-semibold text-gray-900 mb-3">Informations personnelles</h3>
						<div class="grid grid-cols-2 gap-4 text-sm">
							<div>
								<p class="text-gray-500">Téléphone</p>
								<p class="font-medium text-gray-900">{selectedProfile.phone_number || '-'}</p>
							</div>
							<div>
								<p class="text-gray-500">Note moyenne</p>
								<p class="font-medium text-gray-900">{selectedProfile.average_rating ? selectedProfile.average_rating.toFixed(1) + ' ⭐' : '-'}</p>
							</div>
							<div>
								<p class="text-gray-500">Inscription</p>
								<p class="font-medium text-gray-900">{selectedProfile.created_at ? new Date(selectedProfile.created_at).toLocaleDateString('fr-FR') : '-'}</p>
							</div>
							<div>
								<p class="text-gray-500">Rôle</p>
								<p class="font-medium text-gray-900">{selectedProfile.is_admin ? 'Admin' : 'Utilisateur'}</p>
							</div>
						</div>
					</div>

					<!-- Status Actions -->
					<div>
						<h3 class="text-sm font-semibold text-gray-900 mb-3">Gestion du compte</h3>
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
								{selectedProfile.user_status === 'active' ? '✓' : ''} Activer le compte
							</button>
							<button
								type="button"
								disabled={statusActionInProgress}
								on:click={() => changeUserStatus('suspended')}
								class="w-full px-4 py-2 rounded-lg border text-sm font-medium {selectedProfile.user_status === 'suspended' ? 'border-yellow-300 bg-yellow-50 text-yellow-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'} disabled:opacity-50"
							>
								{selectedProfile.user_status === 'suspended' ? '✓' : ''} Suspendre le compte
							</button>
							<button
								type="button"
								disabled={statusActionInProgress}
								on:click={() => changeUserStatus('banned')}
								class="w-full px-4 py-2 rounded-lg border text-sm font-medium {selectedProfile.user_status === 'banned' ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'} disabled:opacity-50"
							>
								{selectedProfile.user_status === 'banned' ? '✓' : ''} Bannir le compte
							</button>
							<button
								type="button"
								disabled={statusActionInProgress}
								on:click={resetUserPassword}
								class="w-full px-4 py-2 rounded-lg border border-blue-300 text-blue-700 bg-blue-50 text-sm font-medium hover:bg-blue-100 disabled:opacity-50"
							>
								Réinitialiser le mot de passe
							</button>
						</div>
					</div>

					<!-- Rides History -->
					<div>
						<h3 class="text-sm font-semibold text-gray-900 mb-3">Historique des trajets</h3>
						{#if ridesLoading}
							<p class="text-sm text-gray-500">Chargement...</p>
						{:else if profileRides.length === 0 && profileBookings.length === 0}
							<p class="text-sm text-gray-500 italic">Aucun trajet pour cet utilisateur.</p>
						{:else}
							<div class="space-y-3">
								{#if profileRides.length > 0}
									<div>
										<p class="text-xs font-medium text-gray-600 mb-2">Trajets en tant que conducteur</p>
										{#each profileRides as ride}
											<div class="text-xs border border-gray-200 rounded p-2 mb-2">
												<p><strong>{ride.city_from}</strong> → <strong>{ride.city_to}</strong></p>
												<p class="text-gray-600">{new Date(ride.ride_date).toLocaleDateString('fr-FR')} • {ride.available_seats} places • {ride.price}€</p>
											</div>
										{/each}
									</div>
								{/if}
								{#if profileBookings.length > 0}
									<div>
										<p class="text-xs font-medium text-gray-600 mb-2">Trajets réservés</p>
										{#each profileBookings as booking}
											<div class="text-xs border border-gray-200 rounded p-2 mb-2">
												<p>{booking.ride?.[0]?.city_from || '-'} → {booking.ride?.[0]?.city_to || '-'} ({booking.seats_booked} places)</p>
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
						Fermer
					</button>
				</div>
			</div>
		</div>
	{/if}
{/if}
