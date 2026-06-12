<svelte:options runes={false} />

<script lang="ts">
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabaseClient';
	import { user } from '$lib/authStore';
	import type { User } from '@supabase/supabase-js';

	let currentUser: User | null = null;
	let loading = true;
	let isAdmin = false;
	let accessError = '';

	type SupportTicket = {
		id: string;
		user_id: string;
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
	let supportActionIsError = false;
	let supportTickets: SupportTicket[] = [];
	let filteredSupportTickets: SupportTicket[] = [];
	let supportSearch = '';
	let supportFilterStatus = '';
	let supportFilterPriority = '';
	let selectedSupportTicket: SupportTicket | null = null;
	let supportMessages: SupportMessage[] = [];
	let supportMessagesLoading = false;
	let supportReplyMessage = '';
	let supportReplyAndResolve = false;
	let supportSendingReply = false;
	let supportUpdatingStatus = false;
	let supportDeletingTicket = false;

	// Platform settings management
	let settingsLoading = false;
	let settingsError = '';
	let settingsMessage = '';
	let settingsSaving = false;
	let commissionPercent = 10;
	let maxSeatsLimit = 6;
	let maxPriceLimit = 200;
	let footerBrandDescription = 'A carpooling platform that connects people.';
	let footerAboutUsLabel = 'About Us';
	let footerAboutUsUrl = '/about';
	let footerHowItWorksLabel = 'How it works';
	let footerHowItWorksUrl = '/how-it-works';
	let footerFaqLabel = 'FAQ';
	let footerFaqUrl = '/faq';
	let footerHelpCenterLabel = 'Help Center';
	let footerHelpCenterUrl = '/help';
	let footerPrivacyPolicyLabel = 'Privacy Policy';
	let footerPrivacyPolicyUrl = '/privacy';
	let footerTermsOfServiceLabel = 'Terms of Service';
	let footerTermsOfServiceUrl = '/terms';
	let socialFacebookUrl = 'https://www.facebook.com';
	let socialInstagramUrl = 'https://www.instagram.com';
	let socialYoutubeUrl = 'https://www.youtube.com';
	let aboutPageTitle = 'About Us';
	let aboutPageContent =
		'Hizli Carpooling is a community-first carpooling platform focused on safety, simplicity, and fair prices.';
	let howItWorksPageTitle = 'How it works';
	let howItWorksPageContent =
		'1. Search your route.\n2. Pick a ride that matches your needs.\n3. Book and travel together.';
	let faqPageTitle = 'FAQ';
	let faqPageContent =
		'Q: How do I book a ride?\nA: Search your route, open ride details, and send your booking request.\n\nQ: How is payment handled?\nA: Payments are arranged directly between members; the platform does not process payments.';
	let helpPageTitle = 'Help Center';
	let helpPageContent =
		'Need help? Contact our support team and include your ride ID and account email for faster resolution.';
	let privacyPageTitle = 'Privacy Policy';
	let privacyPageContent =
		'We collect only the data needed to operate Hizli Carpooling and keep the platform safe. We do not sell personal data.';
	let termsPageTitle = 'Terms of Service';
	let termsPageContent =
		'By using Hizli Carpooling, you agree to respect other members, provide accurate information, and follow platform rules.';

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
			accountsToVerify: 0,
			supportTickets: 0
		}
	};
	let statsError = '';
	let selectedPeriod = 'all';
	let showCustomDatePicker = false;
	let customStartDate = '';
	let customEndDate = '';
	let customRangeError = '';
	let userSearch = '';
	let rideFilterCityFrom = '';
	let rideFilterCityTo = '';
	let rideFilterStatus = '';
	let rideFilterFromDate = '';
	let rideFilterToDate = '';
	let bookingFilterFromDate = '';
	let bookingFilterStatus = '';
	let reportSearch = '';
	let reportFilterType = '';
	let reportFilterStatus = '';
	let reportNoteModalText = '';
	let reviewFilterStatus = '';
	let exportLoading = false;
	let exportError = '';

	onMount(() => {
		const unsubscribe = user.subscribe((u) => {
			currentUser = u;
		});
		const reportRefreshChannel =
			typeof window !== 'undefined' && 'BroadcastChannel' in window
				? new BroadcastChannel('admin-reports')
				: null;
		const refreshInterval = window.setInterval(() => {
			if (!loading && isAdmin) {
				void loadStats();
				if (activeTab === 'reports') {
					void loadReports();
				}
			}
		}, 30000);
		const handleReportsRefreshSignal = () => {
			if (!loading && isAdmin) {
				void loadStats();
				if (activeTab === 'reports') {
					void loadReports();
				}
			}
		};

		const handleStorageRefreshSignal = (event: StorageEvent) => {
			if (event.key === 'admin-reports-refresh') {
				handleReportsRefreshSignal();
			}
		};

		reportRefreshChannel?.addEventListener('message', handleReportsRefreshSignal);
		window.addEventListener('storage', handleStorageRefreshSignal);

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
			await loadPlatformSettings();
			loading = false;
		}

		initializeAdminPage();

		return () => {
			unsubscribe();
			reportRefreshChannel?.removeEventListener('message', handleReportsRefreshSignal);
			reportRefreshChannel?.close();
			window.removeEventListener('storage', handleStorageRefreshSignal);
			window.clearInterval(refreshInterval);
		};
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

		let url = '/api/admin/overview?period=' + encodeURIComponent(selectedPeriod);
		if (selectedPeriod === 'custom' && customStartDate && customEndDate) {
			url += '&startDate=' + encodeURIComponent(customStartDate);
			url += '&endDate=' + encodeURIComponent(customEndDate);
		}
		url += '&_ts=' + Date.now();

		const response = await fetch(url, {
			method: 'GET',
			cache: 'no-store',
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

	function getPresetRange(period: string): { start: string; end: string } | null {
		const now = new Date();
		const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

		if (period === 'all') {
			return null;
		}

		if (period === 'today') {
			return { start: toDateOnly(now), end: toDateOnly(now) };
		}

		if (period === 'week') {
			const day = now.getDay();
			const diffToMonday = (day + 6) % 7;
			const monday = new Date(now);
			monday.setDate(now.getDate() - diffToMonday);
			return { start: toDateOnly(monday), end: toDateOnly(now) };
		}

		if (period === 'month') {
			const start = new Date(now.getFullYear(), now.getMonth(), 1);
			return { start: toDateOnly(start), end: toDateOnly(now) };
		}

		if (period === 'year') {
			const start = new Date(now.getFullYear(), 0, 1);
			return { start: toDateOnly(start), end: toDateOnly(now) };
		}

		return null;
	}

	async function handlePeriodChange(period: string) {
		selectedPeriod = period;
		showCustomDatePicker = period === 'custom';
		customRangeError = '';

		if (period === 'custom') {
			return;
		}

		const preset = getPresetRange(period);
		if (preset) {
			rideFilterFromDate = preset.start;
			rideFilterToDate = preset.end;
		} else {
			rideFilterFromDate = '';
			rideFilterToDate = '';
		}

		await loadStats();

		if (activeTab === 'rides') {
			await loadRides();
		}
	}

	async function applyCustomRange() {
		customRangeError = '';

		if (!customStartDate || !customEndDate) {
			customRangeError = 'Please select both start and end dates.';
			return;
		}

		if (customStartDate > customEndDate) {
			customRangeError = 'Start date must be before or equal to end date.';
			return;
		}

		rideFilterFromDate = customStartDate;
		rideFilterToDate = customEndDate;

		await loadStats();

		if (activeTab === 'rides') {
			await loadRides();
		}
	}

	async function exportData(format: 'json' | 'csv', type: 'rides' | 'bookings' | 'users' | 'all') {
		exportLoading = true;
		exportError = '';

		try {
			const {
				data: { session }
			} = await supabase.auth.getSession();

			if (!session?.access_token) {
				exportError = 'Session expired. Please sign in again.';
				exportLoading = false;
				return;
			}

			let url = `/api/admin/export?format=${format}&type=${type}&period=${encodeURIComponent(selectedPeriod)}`;
			if (selectedPeriod === 'custom' && customStartDate && customEndDate) {
				url += '&startDate=' + encodeURIComponent(customStartDate);
				url += '&endDate=' + encodeURIComponent(customEndDate);
			}

			const response = await fetch(url, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${session.access_token}`
				}
			});

			if (!response.ok) {
				exportError = 'Failed to export data. Please try again.';
				exportLoading = false;
				return;
			}

			// Handle file download
			const blob = await response.blob();
			const contentDisposition = response.headers.get('content-disposition');
			let filename = `platform-data.${format}`;
			
			if (contentDisposition) {
				const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
				if (filenameMatch) {
					filename = filenameMatch[1];
				}
			}

			const url_obj = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url_obj;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url_obj);
			document.body.removeChild(a);
		} catch (error) {
			exportError = error instanceof Error ? error.message : 'An error occurred during export.';
		} finally {
			exportLoading = false;
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

		users = users.map((u) => {
			if (u.id !== targetUser.id) {
				return u;
			}

			const updated = { ...u, [field]: value, has_profile: true } as AdminUser;
			const emailConfirmed = Boolean(updated.email_confirmed);
			updated.account_verified = Boolean(updated.is_verified) && emailConfirmed;
			return updated;
		});

		if (selectedProfile?.id === targetUser.id) {
			const refreshed = users.find((u) => u.id === targetUser.id);
			if (refreshed) {
				selectedProfile = refreshed;
			}
		}
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

	async function updateSelectedProfileVerification(value: boolean) {
		const profile = selectedProfile;
		if (!profile) return;
		await updateUserFlag(profile, 'is_verified', value);
	}

	async function updateSelectedProfileGender(gender: string) {
		if (!selectedProfile) return;
		const selectedProfileId = selectedProfile.id;

		actionUserId = selectedProfileId;
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
				userId: selectedProfileId,
				field: 'gender',
				value: gender
			})
		});

		const payload = await response.json();
		if (!response.ok) {
			usersActionMessage = payload?.error || 'Unable to update gender right now.';
			actionUserId = null;
			return;
		}

		users = users.map((u) => {
			if (u.id !== selectedProfileId) {
				return u;
			}

			const updated: AdminUser = {
				...u,
				gender: gender
			};
			return updated;
		});

		if (selectedProfile?.id === selectedProfileId) {
			const refreshed = users.find((u) => u.id === selectedProfileId);
			if (refreshed) {
				selectedProfile = refreshed;
			}
		}

		usersActionMessage = `Gender updated to ${gender}.`;
		actionUserId = null;
	}

	async function markSelectedProfileEmailConfirmed() {
		if (!selectedProfile) return;
		const selectedProfileId = selectedProfile.id;

		actionUserId = selectedProfileId;
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
				userId: selectedProfileId,
				field: 'email_confirmed',
				value: true
			})
		});

		const payload = await response.json();
		if (!response.ok) {
			usersActionMessage = payload?.error || 'Unable to confirm email right now.';
			actionUserId = null;
			return;
		}

		users = users.map((u) => {
			if (u.id !== selectedProfileId) {
				return u;
			}

			const updated: AdminUser = {
				...u,
				email_confirmed: true,
				account_verified: Boolean(u.is_verified)
			};
			return updated;
		});

		const refreshed = users.find((u) => u.id === selectedProfileId);
		if (refreshed) {
			selectedProfile = refreshed;
		}

		usersActionMessage = 'Email marked as confirmed.';
		actionUserId = null;
	}

	async function deleteUserAccount(targetUser: AdminUser) {
		const userLabel = targetUser.email || targetUser.id;
		const shouldDelete = confirm(
			`Delete account ${userLabel}? This action is permanent and cannot be undone.`
		);

		if (!shouldDelete) {
			return;
		}

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
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${session.access_token}`
			},
			body: JSON.stringify({
				userId: targetUser.id
			})
		});

		const payload = await response.json();
		if (!response.ok) {
			usersActionMessage = payload?.error || 'Unable to delete this account right now.';
			actionUserId = null;
			return;
		}

		users = users.filter((u) => u.id !== targetUser.id);
		if (selectedProfile?.id === targetUser.id) {
			closeProfileModal();
		}
		usersActionMessage = 'User account deleted successfully.';
		actionUserId = null;
	}

	$: normalizedSearch = userSearch.trim().toLowerCase();
	$: filteredUsers = users.filter((u) => {
		if (!normalizedSearch) {
			return true;
		}

		const searchable = `${u.public_id ?? ''} ${u.first_name ?? ''} ${u.last_name ?? ''} ${u.email ?? ''} ${u.id}`.toLowerCase();
		return searchable.includes(normalizedSearch);
	});

	function setTab(tab: string) {
		activeTab = tab;
		if (tab === 'reviews') {
			void loadReviews();
		}
		if (tab === 'rides') {
			void loadRides();
		}
		if (tab === 'reports') {
			void loadReports();
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
		privateProfile = null;
		privateProfileError = '';
		ridesLoading = true;
		profileDocumentsLoading = true;
		privateProfileLoading = true;

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			profileDocumentsError = 'Session expired. Please sign in again.';
			privateProfileError = 'Session expired. Please sign in again.';
			ridesLoading = false;
			profileDocumentsLoading = false;
			privateProfileLoading = false;
			return;
		}

		try {
			const response = await fetch(`/api/admin/user-rides?userId=${encodeURIComponent(user.id)}`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${session.access_token}`
				}
			});

			const payload = await response
				.json()
				.catch(() => null) as { driverRides?: unknown[]; bookings?: unknown[] } | null;

			if (response.ok) {
				profileRides = payload?.driverRides ?? [];
				profileBookings = payload?.bookings ?? [];
			}
		} catch {
			profileRides = [];
			profileBookings = [];
		} finally {
			ridesLoading = false;
		}

		await Promise.allSettled([loadProfileDocuments(user.id), loadPrivateProfile(user.id)]);
	}

	async function loadPrivateProfile(userId: string) {
		privateProfileLoading = true;
		privateProfileError = '';

		try {
			const {
				data: { session }
			} = await supabase.auth.getSession();

			if (!session?.access_token) {
				privateProfileError = 'Session expired. Please sign in again.';
				privateProfile = null;
				return;
			}

			const response = await fetch(`/api/admin/user-profile?userId=${encodeURIComponent(userId)}`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${session.access_token}`
				}
			});

			const payload = await response
				.json()
				.catch(() => null) as {
					error?: string;
					full_profile?: Record<string, unknown>;
					profile?: Record<string, unknown>;
				} | null;

			if (!response.ok) {
				if (response.status === 404) {
					const fallback = buildPrivateProfileFallback(userId);
					if (fallback) {
						privateProfile = fallback;
						privateProfileError = '';
						return;
					}
				}

				privateProfileError = payload?.error || `Unable to load private profile (${response.status}).`;
				privateProfile = null;
				return;
			}

			privateProfile = (payload?.full_profile ?? payload?.profile ?? payload) as Record<string, unknown> | null;
		} catch {
			privateProfileError = 'Unable to load private profile.';
			privateProfile = null;
		} finally {
			privateProfileLoading = false;
		}
	}

	function escapeHtml(value: string): string {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
	}

	function asRecord(value: unknown): Record<string, unknown> | null {
		return value && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: null;
	}

	function asString(value: unknown): string {
		return typeof value === 'string' ? value : '';
	}

	function asBoolean(value: unknown): boolean | null {
		return typeof value === 'boolean' ? value : null;
	}

	function buildPrivateProfileSummary(value: Record<string, unknown> | null) {
		const root = asRecord(value);
		const profilePart = asRecord(root?.profile) ?? root;
		const authPart = asRecord(root?.auth);
		const appMetadata = asRecord(authPart?.app_metadata);
		const verified = asBoolean(profilePart?.is_verified);

		return {
			firstName: asString(profilePart?.first_name),
			lastName: asString(profilePart?.last_name),
			email: asString(profilePart?.email) || asString(authPart?.email),
			phone: asString(profilePart?.phone_number) || asString(authPart?.phone),
			status: asString(profilePart?.status),
			isVerified: verified,
			emailConfirmedAt: asString(authPart?.email_confirmed_at),
			lastSignInAt: asString(authPart?.last_sign_in_at),
			provider: asString(appMetadata?.provider)
		};
	}

	$: privateProfilePrettyJson = privateProfile ? JSON.stringify(privateProfile, null, 2) : '';
	$: privateProfileSummary = buildPrivateProfileSummary(privateProfile);

	function buildPrivateProfileFallback(userId: string): Record<string, unknown> | null {
		const baseUser =
			(selectedProfile?.id === userId ? selectedProfile : users.find((u) => u.id === userId)) ?? null;

		if (!baseUser) {
			return null;
		}

		return {
			source: 'admin-fallback',
			generated_at: new Date().toISOString(),
			user_from_admin_list: baseUser,
			activity_snapshot: {
				driver_rides_count: profileRides.length,
				bookings_count: profileBookings.length,
				verification_documents_count: profileDocuments.length
			}
		};
	}

	async function openPrivateProfileJson(userId: string) {
		privateProfileOpenInProgress = true;
		privateProfileError = '';
		const opened = window.open('', '_blank');
		if (opened) {
			opened.document.open();
			opened.document.write('<!doctype html><title>Loading...</title><body style="font-family:system-ui;padding:16px">Loading private profile...</body>');
			opened.document.close();
		}

		try {
			const {
				data: { session }
			} = await supabase.auth.getSession();

			if (!session?.access_token) {
				privateProfileError = 'Session expired. Please sign in again.';
				return;
			}

			const response = await fetch(`/api/admin/user-profile?userId=${encodeURIComponent(userId)}`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${session.access_token}`
				}
			});

			const payload = await response
				.json()
				.catch(() => null) as { error?: string; full_profile?: Record<string, unknown>; profile?: Record<string, unknown> } | null;

			if (!response.ok) {
				if (response.status === 404) {
					const fallback = buildPrivateProfileFallback(userId);
					if (fallback) {
						privateProfile = fallback;
						const serializedFallback = JSON.stringify(fallback, null, 2);
						const safeFallback = escapeHtml(serializedFallback);
						const fallbackHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Admin Private Profile (Fallback)</title><style>body{font-family:ui-monospace,Menlo,Monaco,Consolas,'Courier New',monospace;padding:16px;background:#f8fafc;color:#0f172a}h1{font-size:16px;margin:0 0 12px}p{font-family:system-ui;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px}pre{white-space:pre-wrap;word-break:break-word;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:12px}</style></head><body><h1>Admin Private Profile (Fallback Data)</h1><p>Private endpoint returned 404. Showing snapshot from admin data.</p><pre>${safeFallback}</pre></body></html>`;
						if (opened) {
							opened.document.open();
							opened.document.write(fallbackHtml);
							opened.document.close();
						}
						return;
					}
				}

				privateProfileError = payload?.error || `Unable to load private profile (${response.status}).`;
				if (opened) {
					opened.document.open();
					opened.document.write(`<!doctype html><title>Error</title><body style="font-family:system-ui;padding:16px;color:#991b1b">${escapeHtml(privateProfileError)}</body>`);
					opened.document.close();
				}
				return;
			}

			const fullProfile = (payload?.full_profile ?? payload?.profile ?? payload) as Record<string, unknown> | null;
			if (!fullProfile) {
				privateProfileError = 'Profile not found.';
				if (opened) {
					opened.document.open();
					opened.document.write('<!doctype html><title>Not found</title><body style="font-family:system-ui;padding:16px;color:#991b1b">Profile not found.</body>');
					opened.document.close();
				}
				return;
			}

			privateProfile = fullProfile;
			const p = (fullProfile?.profile ?? fullProfile) as Record<string, unknown>;
			const a = (fullProfile?.auth) as Record<string, unknown> | null;
			const am = (a?.app_metadata ?? {}) as Record<string, unknown>;
			const um = (a?.user_metadata ?? {}) as Record<string, unknown>;

			function row(label: string, value: unknown): string {
				const v = value === null || value === undefined ? '—' : String(value);
				return `<tr><td class="label">${escapeHtml(label)}</td><td class="value">${escapeHtml(v)}</td></tr>`;
			}
			function badge(text: string, color: string): string {
				return `<span class="badge" style="background:${color}20;color:${color};border:1px solid ${color}40">${escapeHtml(text)}</span>`;
			}
			function fmt(iso: unknown): string {
				if (!iso || typeof iso !== 'string') return '—';
				try { return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; }
			}
			function fmtDate(iso: unknown): string {
				if (!iso || typeof iso !== 'string') return '—';
				try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return iso; }
			}

			const isVerified = Boolean(p?.is_verified);
			const verifiedBadge = isVerified ? badge('Verified', '#16a34a') : badge('Unverified', '#d97706');
			const adminBadge = p?.is_admin ? badge('Admin', '#7c3aed') : '';
			const statusColors: Record<string, string> = { active: '#16a34a', suspended: '#d97706', banned: '#dc2626' };
			const userStatusColor = statusColors[String(p?.user_status ?? '')] ?? '#64748b';
			const userStatusBadge = badge(String(p?.user_status ?? 'active'), userStatusColor);
			const providerBadge = badge(String(am?.provider ?? 'email'), '#0ea5e9');

			const langRaw = p?.languages;
			const langStr = Array.isArray(langRaw) ? langRaw.join(', ') : (langRaw ? String(langRaw) : '—');

			let prefStr = '—';
			try {
				const raw = p?.ride_preferences;
				const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
				prefStr = Array.isArray(parsed) ? parsed.join(', ') : String(raw ?? '—');
			} catch { prefStr = String(p?.ride_preferences ?? '—'); }

			const photoUrl = typeof p?.profile_photo_url === 'string' ? p.profile_photo_url : '';
			const photoHtml = photoUrl
				? `<img src="${escapeHtml(photoUrl)}" alt="Profile photo" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid #e2e8f0;margin-bottom:8px">`
				: `<div style="width:80px;height:80px;border-radius:50%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:8px">👤</div>`;

			const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin — Private Profile #${escapeHtml(String(p?.public_id ?? ''))}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#f1f5f9;color:#0f172a;min-height:100vh;padding:24px}
.page{max-width:860px;margin:0 auto}
h1{font-size:20px;font-weight:700;color:#0f172a;margin-bottom:4px}
.subtitle{font-size:13px;color:#64748b;margin-bottom:24px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:16px;overflow:hidden}
.card-header{padding:14px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px}
.card-header h2{font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#475569}
.card-body{padding:18px}
.hero{display:flex;align-items:flex-start;gap:18px;padding:18px}
.hero-info h2{font-size:18px;font-weight:700;margin-bottom:4px}
.hero-info p{font-size:13px;color:#64748b;margin-bottom:8px}
.badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.badge{display:inline-block;padding:2px 9px;border-radius:99px;font-size:11px;font-weight:600}
table{width:100%;border-collapse:collapse}
td{padding:8px 12px;font-size:13px;border-bottom:1px solid #f1f5f9;vertical-align:top}
td.label{width:42%;font-weight:500;color:#64748b}
td.value{color:#0f172a;word-break:break-word}
tr:last-child td{border-bottom:none}
.icon{font-size:16px;flex-shrink:0}
details summary{cursor:pointer;font-size:13px;font-weight:600;color:#2563eb;padding:12px 18px;user-select:none}
details summary:hover{color:#1d4ed8}
pre{background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px;font-size:12px;font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-word;overflow:auto;max-height:400px}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:0}
@media(max-width:600px){.grid-2{grid-template-columns:1fr}.hero{flex-direction:column}}
.section-icon{width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}
.ts{font-size:11px;color:#94a3b8;margin-top:16px;text-align:right}
</style></head><body><div class="page">
<h1>Admin Private Profile</h1>
<p class="subtitle">Full data — confidential, admin access only</p>

<div class="card">
  <div class="hero">
    ${photoHtml}
    <div class="hero-info">
      <h2>${escapeHtml(String(p?.first_name ?? '—'))}${p?.last_name ? ' ' + escapeHtml(String(p.last_name)) : ''}</h2>
      <p>${escapeHtml(String(a?.email ?? p?.email ?? '—'))}</p>
      <div class="badges">${verifiedBadge}${adminBadge}${userStatusBadge}${providerBadge}</div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><span class="section-icon">👤</span><h2>Personal Information</h2></div>
  <div class="grid-2">
    <table>
      ${row('Public ID', '#' + String(p?.public_id ?? '—'))}
      ${row('First name', p?.first_name)}
      ${row('Last name', p?.last_name ?? null)}
      ${row('Gender', p?.gender)}
      ${row('Date of birth', fmtDate(p?.date_of_birth))}
      ${row('City of birth', p?.city_of_birth)}
    </table>
    <table>
      ${row('Phone', p?.phone_number)}
      ${row('Address', p?.address)}
      ${row('Zip code', p?.zip_code)}
      ${row('Languages', langStr)}
      ${row('Ride preferences', prefStr)}
    </table>
  </div>
</div>

<div class="card">
  <div class="card-header"><span class="section-icon">🚗</span><h2>Vehicle & Documents</h2></div>
  <div class="grid-2">
    <table>
      ${row('Car make', p?.car_make)}
      ${row('Car year', p?.car_year)}
      ${row('Plate number', p?.plate_number)}
    </table>
    <table>
      ${row('Insurance', p?.insurance_company)}
      ${row('Resident proof type', p?.proof_of_resident_type)}
    </table>
  </div>
</div>

<div class="card">
  <div class="card-header"><span class="section-icon">💳</span><h2>Payment & Payout</h2></div>
  <table>
    ${row('Method', p?.payment_method)}
    ${row('PayPal email', p?.paypal_email)}
    ${row('Venmo handle', p?.venmo_handle)}
  </table>
</div>

<div class="card">
  <div class="card-header"><span class="section-icon">🔐</span><h2>Auth & Account</h2></div>
  <div class="grid-2">
    <table>
      ${row('Email', a?.email)}
      ${row('Phone (auth)', a?.phone || '—')}
      ${row('Provider', am?.provider)}
      ${row('Email confirmed', fmt(a?.email_confirmed_at))}
    </table>
    <table>
      ${row('Account created', fmt(a?.created_at))}
      ${row('Last sign-in', fmt(a?.last_sign_in_at))}
      ${row('Profile created', fmt(p?.created_at))}
      ${row('Profile updated', fmt(p?.updated_at))}
    </table>
  </div>
  ${um?.status ? `<table><tr><td class="label">Status (auth metadata)</td><td class="value">${escapeHtml(String(um.status))}</td></tr></table>` : ''}
</div>

${p?.bio ? `<div class="card"><div class="card-header"><span class="section-icon">📝</span><h2>Bio</h2></div><div class="card-body" style="font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(String(p.bio))}</div></div>` : ''}

<p class="ts">Generated ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</p>
</div></body></html>`;

			if (opened) {
				opened.document.open();
				opened.document.write(html);
				opened.document.close();
			} else {
				privateProfileError = 'Popup blocked by browser. Please allow popups for this site.';
			}
		} catch {
			privateProfileError = 'Unable to load private profile.';
			if (opened) {
				opened.document.open();
				opened.document.write('<!doctype html><title>Error</title><body style="font-family:system-ui;padding:16px;color:#991b1b">Unable to load private profile.</body>');
				opened.document.close();
			}
		} finally {
			privateProfileOpenInProgress = false;
		}
	}

	async function loadProfileDocuments(userId: string) {
		profileDocumentsLoading = true;
		profileDocumentsError = '';

		try {
			const {
				data: { session }
			} = await supabase.auth.getSession();

			if (!session?.access_token) {
				profileDocumentsError = 'Session expired. Please sign in again.';
				profileDocuments = [];
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

			const payload = await response
				.json()
				.catch(() => null) as { error?: string; documents?: AdminVerificationDocument[] } | null;

			if (!response.ok) {
				profileDocumentsError = payload?.error || 'Unable to load verification documents.';
				profileDocuments = [];
				return;
			}

			profileDocuments = (payload?.documents ?? []) as AdminVerificationDocument[];
		} catch {
			profileDocumentsError = 'Unable to load verification documents.';
			profileDocuments = [];
		} finally {
			profileDocumentsLoading = false;
		}
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
		privateProfile = null;
		privateProfileError = '';
		privateProfileLoading = false;
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
		if (rideFilterToDate) params.append('toDate', rideFilterToDate);

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
		let { data: riderProfile, error: riderProfileError } = await supabase
			.from('profiles')
			.select('id, first_name, last_name, email, phone_number, average_rating, created_at')
			.eq('id', booking.user_id)
			.maybeSingle();

		if (riderProfileError?.message?.toLowerCase().includes('average_rating')) {
			const { data: fallbackRiderProfile, error: fallbackRiderProfileError } = await supabase
				.from('profiles')
				.select('id, first_name, last_name, email, phone_number, created_at')
				.eq('id', booking.user_id)
				.maybeSingle();

			if (!fallbackRiderProfileError && fallbackRiderProfile) {
				riderProfile = {
					...fallbackRiderProfile,
					average_rating: null
				};
			}
		}

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
		params.append('_ts', Date.now().toString());

		const fetchReportsPayload = async (query: URLSearchParams) => {
			const response = await fetch(`/api/admin/reports?${query.toString()}`, {
				method: 'GET',
				cache: 'no-store',
				headers: {
					Authorization: `Bearer ${session.access_token}`
				}
			});

			const payload = await response.json();
			return { response, payload };
		};

		let { response, payload } = await fetchReportsPayload(params);
		if (!response.ok) {
			reportsError = payload?.error || 'Unable to load reports.';
			reports = [];
			reportsLoading = false;
			return;
		}

		let fetchedReports = (payload?.reports ?? []) as AdminReport[];
		if (fetchedReports.length === 0 && (reportFilterType || reportFilterStatus)) {
			const fallbackParams = new URLSearchParams();
			fallbackParams.append('_ts', Date.now().toString());
			({ response, payload } = await fetchReportsPayload(fallbackParams));
			if (response.ok) {
				fetchedReports = (payload?.reports ?? []) as AdminReport[];
			}
		}

		if (fetchedReports.length === 0) {
			const { data: clientRows, error: clientError } = await supabase
				.from('reports')
				.select('id, user_id, reporter_id, ride_id, type, description, status, action_taken, admin_note, created_at, updated_at')
				.order('created_at', { ascending: false });

			if (!clientError && clientRows && clientRows.length > 0) {
				fetchedReports = (clientRows as AdminReport[]).map((row) => ({
					...row,
					profiles: null,
					reported_profile: null,
					reporter_profile: null,
					rides: null
				}));
			}
		}

		reports = fetchedReports;
		applyReportFilters();
		reportsLoading = false;
	}

	function applyReportFilters() {
		const q = reportSearch.trim().toLowerCase();
		filteredReports = q
			? reports.filter((r) => {
				const reportedName = `${r.reported_profile?.first_name ?? r.profiles?.first_name ?? ''} ${r.reported_profile?.last_name ?? r.profiles?.last_name ?? ''}`.toLowerCase();
				const reporterName = `${r.reporter_profile?.first_name ?? ''} ${r.reporter_profile?.last_name ?? ''}`.toLowerCase();
				return (
					(r.description ?? '').toLowerCase().includes(q) ||
					reportedName.includes(q) ||
					reporterName.includes(q) ||
					(r.reported_profile?.email ?? r.profiles?.email ?? '').toLowerCase().includes(q) ||
					(r.reporter_profile?.email ?? '').toLowerCase().includes(q)
				);
			})
			: reports.slice();
	}

	function reportTypeLabel(type: string) {
		if (type === 'user') return 'User report';
		if (type === 'ride') return 'Ride report';
		if (type === 'behavior') return 'Behavior';
		if (type === 'spam') return 'Spam';
		if (type === 'payment_issue') return 'Payment issue';
		return type;
	}

	function actionTakenLabel(action: string | null) {
		if (!action) return '—';
		if (action === 'ignored') return 'Ignored';
		if (action === 'warned_user') return 'User warned';
		if (action === 'suspended_user') return 'Account suspended';
		if (action === 'resolved') return 'Resolved';
		return action;
	}

	function openReportNoteModal(report: AdminReport, action: 'ignore' | 'warn' | 'suspend' | 'resolve') {
		reportNoteModalReport = report;
		reportNoteModalAction = action;
		reportNoteModalText = action === 'ignore' ? 'Report ignored by admin' : '';
		showReportNoteModal = true;
	}

	function closeReportNoteModal() {
		showReportNoteModal = false;
		reportNoteModalReport = null;
		reportNoteModalAction = null;
		reportNoteModalText = '';
		reportNoteModalSaving = false;
	}

	async function submitReportNote() {
		if (!reportNoteModalReport || !reportNoteModalAction) return;
		await moderateReport(reportNoteModalReport, reportNoteModalAction, reportNoteModalText);
		closeReportNoteModal();
	}

	async function moderateReport(report: AdminReport, action: 'ignore' | 'warn' | 'suspend' | 'resolve', note: string = '') {
		reportActionId = report.id;
		reportActionMessage = '';
		reportActionIsError = false;
		reportNoteModalSaving = true;

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
			reportActionIsError = true;
			reportActionId = null;
			reportNoteModalSaving = false;
			return;
		}

		const nextStatus = action === 'ignore' ? 'ignored' : 'resolved';
		const nextAction =
			action === 'ignore' ? 'ignored' :
			action === 'warn' ? 'warned_user' :
			action === 'resolve' ? 'resolved' :
			'suspended_user';

		reports = reports.map((r) =>
			r.id === report.id
				? {
					...r,
					status: nextStatus,
					action_taken: nextAction,
					admin_note: note || r.admin_note,
					updated_at: new Date().toISOString()
				}
				: r
		);
		applyReportFilters();

		if (action === 'suspend' && report.user_id) {
			users = users.map((u) => (u.id === report.user_id ? { ...u, user_status: 'suspended' } : u));
		}

		reportActionIsError = false;
		reportActionMessage =
			action === 'ignore' ? 'Report ignored.' :
			action === 'warn' ? 'User warned.' :
			action === 'resolve' ? 'Report resolved.' :
			'Account suspended and report resolved.';
		reportActionId = null;
		reportNoteModalSaving = false;
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
		if (supportFilterStatus) params.append('status', supportFilterStatus);
		if (supportFilterPriority) params.append('priority', supportFilterPriority);

		const response = await fetch(`/api/admin/support?${params.toString()}`, {
			method: 'GET',
			headers: { Authorization: `Bearer ${session.access_token}` }
		});

		const payload = await response.json();
		if (!response.ok) {
			supportError = payload?.error || 'Unable to load support tickets.';
			supportTickets = [];
			filteredSupportTickets = [];
			supportLoading = false;
			return;
		}

		supportTickets = (payload?.tickets ?? []) as SupportTicket[];
		applySupportFilters();
		supportLoading = false;
	}

	function applySupportFilters() {
		const q = supportSearch.trim().toLowerCase();
		filteredSupportTickets = q
			? supportTickets.filter((t) => {
				const name = `${t.profiles?.first_name ?? ''} ${t.profiles?.last_name ?? ''}`.toLowerCase();
				const email = (t.profiles?.email ?? '').toLowerCase();
				return t.subject.toLowerCase().includes(q) || name.includes(q) || email.includes(q);
			})
			: supportTickets.slice();
	}

	function ticketAge(createdAt: string): string {
		const diff = Date.now() - new Date(createdAt).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		return `${Math.floor(hours / 24)}d ago`;
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
			supportActionIsError = true;
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
			supportActionIsError = true;
			supportSendingReply = false;
			return;
		}

		supportReplyMessage = '';
		supportActionMessage = 'Reply sent.';
		supportActionIsError = false;
		supportSendingReply = false;

		if (supportReplyAndResolve) {
			await updateSupportTicketStatus('resolved');
		} else {
			await openSupportTicket(selectedSupportTicket);
			await loadSupportTickets();
		}
	}

	async function updateSupportTicketStatus(status: SupportTicket['status']) {
		if (!selectedSupportTicket) return;
		supportUpdatingStatus = true;
		supportActionMessage = '';
		supportActionIsError = false;

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			supportActionMessage = 'Session expired. Please sign in again.';
			supportActionIsError = true;
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
			supportActionIsError = true;
			supportUpdatingStatus = false;
			return;
		}

		selectedSupportTicket = { ...selectedSupportTicket, status };
		supportTickets = supportTickets.map((t) =>
			t.id === selectedSupportTicket?.id ? { ...t, status } : t
		);
		applySupportFilters();
		supportActionMessage = `Ticket marked as ${status.replace('_', ' ')}.`;
		supportActionIsError = false;
		supportUpdatingStatus = false;
		if (status === 'resolved' || status === 'closed') {
			await openSupportTicket(selectedSupportTicket);
			await loadSupportTickets();
		}
	}

	async function updateSupportTicketPriority(priority: SupportTicket['priority']) {
		if (!selectedSupportTicket) return;
		supportUpdatingStatus = true;
		supportActionMessage = '';
		supportActionIsError = false;

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			supportActionMessage = 'Session expired.';
			supportActionIsError = true;
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
				action: 'update_priority',
				priority
			})
		});

		const payload = await response.json();
		if (!response.ok) {
			supportActionMessage = payload?.error || 'Unable to update priority.';
			supportActionIsError = true;
			supportUpdatingStatus = false;
			return;
		}

		selectedSupportTicket = { ...selectedSupportTicket, priority };
		supportTickets = supportTickets.map((t) =>
			t.id === selectedSupportTicket?.id ? { ...t, priority } : t
		);
		applySupportFilters();
		supportActionMessage = `Priority set to ${priority}.`;
		supportActionIsError = false;
		supportUpdatingStatus = false;
	}

	async function deleteSupportTicket(ticket: SupportTicket) {
		supportDeletingTicket = true;
		supportActionMessage = '';
		supportActionIsError = false;

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			supportActionMessage = 'Session expired.';
			supportActionIsError = true;
			supportDeletingTicket = false;
			return;
		}

		const response = await fetch(`/api/admin/support?ticketId=${encodeURIComponent(ticket.id)}`, {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${session.access_token}` }
		});

		const payload = await response.json();
		if (!response.ok) {
			supportActionMessage = payload?.error || 'Unable to delete ticket.';
			supportActionIsError = true;
			supportDeletingTicket = false;
			return;
		}

		supportTickets = supportTickets.filter((t) => t.id !== ticket.id);
		applySupportFilters();
		if (selectedSupportTicket?.id === ticket.id) {
			selectedSupportTicket = null;
			supportMessages = [];
		}
		supportActionMessage = 'Ticket deleted.';
		supportDeletingTicket = false;
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
			footerBrandDescription = String(s.footer_brand_description ?? 'A carpooling platform that connects people.');
			footerAboutUsLabel = String(s.footer_about_us_label ?? 'About Us');
			footerAboutUsUrl = String(s.footer_about_us_url ?? '/about');
			footerHowItWorksLabel = String(s.footer_how_it_works_label ?? 'How it works');
			footerHowItWorksUrl = String(s.footer_how_it_works_url ?? '/how-it-works');
			footerFaqLabel = String(s.footer_faq_label ?? 'FAQ');
			footerFaqUrl = String(s.footer_faq_url ?? '/faq');
			footerHelpCenterLabel = String(s.footer_help_center_label ?? 'Help Center');
			footerHelpCenterUrl = String(s.footer_help_center_url ?? '/help');
			footerPrivacyPolicyLabel = String(s.footer_privacy_policy_label ?? 'Privacy Policy');
			footerPrivacyPolicyUrl = String(s.footer_privacy_policy_url ?? '/privacy');
			footerTermsOfServiceLabel = String(s.footer_terms_of_service_label ?? 'Terms of Service');
			footerTermsOfServiceUrl = String(s.footer_terms_of_service_url ?? '/terms');
			socialFacebookUrl = String(s.social_facebook_url ?? 'https://www.facebook.com');
			socialInstagramUrl = String(s.social_instagram_url ?? 'https://www.instagram.com');
			socialYoutubeUrl = String(s.social_youtube_url ?? 'https://www.youtube.com');
			aboutPageTitle = String(s.about_page_title ?? 'About Us');
			aboutPageContent = String(
				s.about_page_content ??
					'Hizli Carpooling is a community-first carpooling platform focused on safety, simplicity, and fair prices.'
			);
			howItWorksPageTitle = String(s.how_it_works_page_title ?? 'How it works');
			howItWorksPageContent = String(
				s.how_it_works_page_content ??
					'1. Search your route.\n2. Pick a ride that matches your needs.\n3. Book and travel together.'
			);
			faqPageTitle = String(s.faq_page_title ?? 'FAQ');
			faqPageContent = String(
				s.faq_page_content ??
					'Q: How do I book a ride?\nA: Search your route, open ride details, and book your seat.\n\nQ: Is payment secure?\nA: Yes, payments are processed through secure providers.'
			);
			helpPageTitle = String(s.help_page_title ?? 'Help Center');
			helpPageContent = String(
				s.help_page_content ??
					'Need help? Contact our support team and include your ride ID and account email for faster resolution.'
			);
			privacyPageTitle = String(s.privacy_page_title ?? 'Privacy Policy');
			privacyPageContent = String(
				s.privacy_page_content ??
					'We collect only the data needed to operate Hizli Carpooling and keep the platform safe. We do not sell personal data.'
			);
			termsPageTitle = String(s.terms_page_title ?? 'Terms of Service');
			termsPageContent = String(
				s.terms_page_content ??
					'By using Hizli Carpooling, you agree to respect other members, provide accurate information, and follow platform rules.'
			);
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
				max_price: maxPriceLimit,
				footer_brand_description: footerBrandDescription,
				footer_about_us_label: footerAboutUsLabel,
				footer_about_us_url: footerAboutUsUrl,
				footer_how_it_works_label: footerHowItWorksLabel,
				footer_how_it_works_url: footerHowItWorksUrl,
				footer_faq_label: footerFaqLabel,
				footer_faq_url: footerFaqUrl,
				footer_help_center_label: footerHelpCenterLabel,
				footer_help_center_url: footerHelpCenterUrl,
				footer_privacy_policy_label: footerPrivacyPolicyLabel,
				footer_privacy_policy_url: footerPrivacyPolicyUrl,
				footer_terms_of_service_label: footerTermsOfServiceLabel,
				footer_terms_of_service_url: footerTermsOfServiceUrl,
				social_facebook_url: socialFacebookUrl,
				social_instagram_url: socialInstagramUrl,
				social_youtube_url: socialYoutubeUrl,
				about_page_title: aboutPageTitle,
				about_page_content: aboutPageContent,
				how_it_works_page_title: howItWorksPageTitle,
				how_it_works_page_content: howItWorksPageContent,
				faq_page_title: faqPageTitle,
				faq_page_content: faqPageContent,
				help_page_title: helpPageTitle,
				help_page_content: helpPageContent,
				privacy_page_title: privacyPageTitle,
				privacy_page_content: privacyPageContent,
				terms_page_title: termsPageTitle,
				terms_page_content: termsPageContent
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

			<!-- Period Filter -->
			<div class="mb-8 bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
				<div class="flex flex-col gap-4">
					<div>
						<h3 class="text-sm font-semibold text-gray-900 mb-3">Filter by period</h3>
						<div class="flex flex-wrap gap-2">
							<button
								on:click={() => handlePeriodChange('all')}
								class="px-4 py-2 rounded-lg border transition-colors cursor-pointer {selectedPeriod === 'all' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-700 hover:border-gray-300'}"
							>
								All time
							</button>
							<button
								on:click={() => handlePeriodChange('today')}
								class="px-4 py-2 rounded-lg border transition-colors cursor-pointer {selectedPeriod === 'today' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-700 hover:border-gray-300'}"
							>
								Today
							</button>
							<button
								on:click={() => handlePeriodChange('week')}
								class="px-4 py-2 rounded-lg border transition-colors cursor-pointer {selectedPeriod === 'week' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-700 hover:border-gray-300'}"
							>
								This week
							</button>
							<button
								on:click={() => handlePeriodChange('month')}
								class="px-4 py-2 rounded-lg border transition-colors cursor-pointer {selectedPeriod === 'month' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-700 hover:border-gray-300'}"
							>
								This month
							</button>
							<button
								on:click={() => handlePeriodChange('year')}
								class="px-4 py-2 rounded-lg border transition-colors cursor-pointer {selectedPeriod === 'year' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-700 hover:border-gray-300'}"
							>
								This year
							</button>
							<button
								on:click={() => handlePeriodChange('custom')}
								class="px-4 py-2 rounded-lg border transition-colors cursor-pointer {selectedPeriod === 'custom' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-700 hover:border-gray-300'}"
							>
								Custom range
							</button>
						</div>
					</div>

					{#if showCustomDatePicker && selectedPeriod === 'custom'}
						<div class="flex flex-col gap-3 pt-2">
							<div class="flex gap-4">
							<div class="flex-1">
								<label for="custom-start-date" class="text-xs text-gray-600 mb-1 block">Start date</label>
								<input
									id="custom-start-date"
									type="date"
									value={customStartDate}
									on:input={(e) => { customStartDate = e.currentTarget.value; customRangeError = ''; }}
									class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
								/>
							</div>
							<div class="flex-1">
								<label for="custom-end-date" class="text-xs text-gray-600 mb-1 block">End date</label>
								<input
									id="custom-end-date"
									type="date"
									value={customEndDate}
									on:input={(e) => { customEndDate = e.currentTarget.value; customRangeError = ''; }}
									class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
								/>
							</div>
							</div>
							<div class="flex items-center gap-2">
								<button
									type="button"
									on:click={applyCustomRange}
									class="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer"
								>
									Apply custom range
								</button>
								<p class="text-xs text-gray-500">Click to refresh stats and rides with the selected period.</p>
							</div>
							{#if customRangeError}
								<p class="text-xs text-red-600">{customRangeError}</p>
							{/if}
						</div>
					{/if}
				</div>
			</div>

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
							<div class="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 shadow-sm">
								<div class="flex flex-wrap items-center justify-between gap-2">
									<div>
										<h2 class="text-base font-semibold text-gray-900">Platform Overview</h2>
										<p class="text-sm text-gray-600 mt-0.5">Key metrics in real time.</p>
									</div>
									<span class="inline-flex items-center rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700">
										Auto refresh: 30s
									</span>
								</div>
							</div>

							<!-- Rides -->
							<div class="rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-sm">
								<h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1">Rides</h3>
								<div class="grid md:grid-cols-2 gap-4 items-stretch">
									<div class="rounded-xl border border-green-200 bg-green-50 p-5 h-full flex flex-col shadow-sm">
										<div class="flex items-center justify-between mb-2">
											<p class="text-sm font-semibold text-green-800">Active rides</p>
											<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">{stats.activeRides}</span>
										</div>
										<p class="text-xs text-green-700 mb-3">Upcoming departure date, available for booking.</p>
										{#if stats.activeRides + stats.completedRides > 0}
											<div class="mt-auto">
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
									<div class="rounded-xl border border-gray-200 bg-gray-50 p-5 h-full flex flex-col justify-between shadow-sm">
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
							<div class="grid md:grid-cols-2 gap-4 items-stretch">
								<div class="rounded-xl border border-sky-200 bg-sky-50 p-5 h-full flex flex-col justify-between shadow-sm">
									<div class="flex items-center justify-between mb-2">
										<p class="text-sm font-semibold text-sky-800">Active bookings</p>
										<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-700">{stats.reservationsInProgress}</span>
									</div>
									<p class="text-xs text-sky-700">Status <strong>Pending</strong> or <strong>Confirmed</strong>, not departed yet.</p>
								</div>
								<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-5 h-full flex flex-col justify-between shadow-sm">
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
							<div class="rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-sm">
								<h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1">Alerts</h3>
								<div class="grid md:grid-cols-3 gap-4">
									<div class="rounded-xl border p-5 h-full flex flex-col justify-between shadow-sm {stats.alerts.reports > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}">
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
									<div class="rounded-xl border p-5 h-full flex flex-col justify-between shadow-sm {stats.alerts.accountsToVerify > 0 ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-gray-50'}">
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
									<div class="rounded-xl border p-5 h-full flex flex-col justify-between shadow-sm {stats.alerts.supportTickets > 0 ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-gray-50'}">
										<div class="flex items-center justify-between mb-2">
											<p class="text-sm font-semibold {stats.alerts.supportTickets > 0 ? 'text-indigo-800' : 'text-gray-600'}">Support tickets</p>
											<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold {stats.alerts.supportTickets > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-600'}">{stats.alerts.supportTickets}</span>
										</div>
										{#if stats.alerts.supportTickets === 0}
											<p class="text-xs text-gray-500">No open support tickets.</p>
										{:else}
											<p class="text-xs text-indigo-700 mb-2">New or active support requests need attention.</p>
											<button type="button" on:click={() => setTab('support')} class="text-xs font-medium text-indigo-700 underline hover:text-indigo-900 cursor-pointer">
												View support ->
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
															{`${adminUser.first_name ?? ''} ${adminUser.last_name ?? ''}`.trim() || 'No name'}
														</p>
														<p class="text-xs text-gray-700">ID #{adminUser.public_id ?? '-'}</p>
														<p class="text-xs text-gray-500">{adminUser.email ?? 'Email not provided'}</p>
														{#if adminUser.phone_number}
															<p class="text-xs text-gray-500">{adminUser.phone_number}</p>
														{/if}
														<p class="text-xs text-gray-400 break-all">UUID: {adminUser.id}</p>
														{#if adminUser.has_profile === false}
															<p class="text-xs text-amber-600">Missing profile</p>
														{/if}
													</td>
													<td class="px-4 py-3 align-top">
														<div class="flex flex-col gap-1">
															<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium {adminUser.account_verified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
																{adminUser.account_verified ? 'Verified' : 'Not verified'}
															</span>
															<div class="flex flex-wrap gap-1">
																<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium {adminUser.email_confirmed ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}">
																	Email {adminUser.email_confirmed ? 'ok' : 'missing'}
																</span>
																<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium {adminUser.is_verified ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}">
																	Profile {adminUser.is_verified ? 'ok' : 'missing'}
																</span>
															</div>
														</div>
													</td>
													<td class="px-4 py-3 align-top">
														<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium {adminUser.user_status === 'active' ? 'bg-green-100 text-green-700' : adminUser.user_status === 'suspended' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}">
															{adminUser.user_status === 'active' ? 'Active' : adminUser.user_status === 'suspended' ? 'Suspended' : 'Banned'}
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
														<div class="flex flex-wrap gap-2">
															<button
																type="button"
																on:click={() => openProfileModal(adminUser)}
																class="px-2.5 py-1.5 rounded text-xs font-medium border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"
															>
																Profile
															</button>
															<button
																type="button"
																disabled={actionUserId === adminUser.id}
																on:click={() => deleteUserAccount(adminUser)}
																class="px-2.5 py-1.5 rounded text-xs font-medium border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
															>
																{actionUserId === adminUser.id ? 'Deleting...' : 'Delete'}
															</button>
														</div>
														<p class="mt-2 text-[11px] text-gray-400">Verification actions are available in Profile.</p>
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
								<div class="grid grid-cols-1 md:grid-cols-6 gap-3">
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
									<input
										type="date"
										class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
										bind:value={rideFilterToDate}
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
														<div class="text-sm text-gray-900">{ride.city_from} -> {ride.city_to}</div>
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
														<div class="text-sm text-gray-900">{booking.rides?.city_from} -> {booking.rides?.city_to}</div>
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
								<div class="grid grid-cols-1 md:grid-cols-5 gap-3">
									<input type="text" placeholder="Search description, name, email..." class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" bind:value={reportSearch} on:input={applyReportFilters} />
									<select
										class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
										bind:value={reportFilterType}
										on:change={loadReports}
									>
										<option value="">All types</option>
										<option value="user">User report</option>
										<option value="ride">Ride report</option>
										<option value="behavior">Behavior</option>
										<option value="spam">Spam</option>
										<option value="payment_issue">Payment issue</option>
									</select>
									<select
										class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
										bind:value={reportFilterStatus}
										on:change={loadReports}
									>
										<option value="">All statuses</option>
										<option value="pending">Pending</option>
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
									<p class={`text-sm border rounded-lg px-3 py-2 mt-3 ${reportActionIsError ? 'text-red-700 bg-red-50 border-red-200' : 'text-green-700 bg-green-50 border-green-200'}`}>{reportActionMessage}</p>
								{/if}
							</div>

							{#if reports.length > 0}
								{@const pendingCount = reports.filter(r => r.status === 'pending').length}
								{@const resolvedCount = reports.filter(r => r.status === 'resolved').length}
								{@const ignoredCount = reports.filter(r => r.status === 'ignored').length}
								{@const userReportCount = reports.filter(r => r.type === 'user').length}
								{@const rideReportCount = reports.filter(r => r.type === 'ride').length}
								<div class="grid grid-cols-2 md:grid-cols-5 gap-3">
									<div class="bg-white rounded-xl border border-yellow-200 px-4 py-3">
										<p class="text-xs text-yellow-700">Pending</p>
										<p class="text-2xl font-bold text-yellow-800 mt-0.5">{pendingCount}</p>
									</div>
									<div class="bg-white rounded-xl border border-green-200 px-4 py-3">
										<p class="text-xs text-green-700">Resolved</p>
										<p class="text-2xl font-bold text-green-800 mt-0.5">{resolvedCount}</p>
									</div>
									<div class="bg-white rounded-xl border border-gray-200 px-4 py-3">
										<p class="text-xs text-gray-500">Ignored</p>
										<p class="text-2xl font-bold text-gray-700 mt-0.5">{ignoredCount}</p>
									</div>
									<div class="bg-white rounded-xl border border-red-200 px-4 py-3">
										<p class="text-xs text-red-700">User reports</p>
										<p class="text-2xl font-bold text-red-800 mt-0.5">{userReportCount}</p>
									</div>
									<div class="bg-white rounded-xl border border-indigo-200 px-4 py-3">
										<p class="text-xs text-indigo-700">Ride reports</p>
										<p class="text-2xl font-bold text-indigo-800 mt-0.5">{rideReportCount}</p>
									</div>
								</div>
							{/if}

							{#if reportsLoading}
								<p class="text-sm text-gray-500">Loading reports...</p>
							{:else if reportsError}
								<p class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{reportsError}</p>
							{:else if filteredReports.length === 0}
								<p class="text-sm text-gray-500">
									{reportSearch.trim() || reportFilterType || reportFilterStatus
										? 'No reports match the current search/filters.'
										: 'No reports right now.'}
								</p>
							{:else}
								<div class="overflow-x-auto border border-gray-100 rounded-xl">
									<table class="w-full text-sm">
										<thead class="bg-gray-50 text-left text-gray-600">
											<tr>
												<th class="px-4 py-3 font-medium">Type</th>
												<th class="px-4 py-3 font-medium">Description</th>
												<th class="px-4 py-3 font-medium">Reporter</th>
												<th class="px-4 py-3 font-medium">Reported user</th>
												<th class="px-4 py-3 font-medium">Statut / Action</th>
												<th class="px-4 py-3 font-medium">Actions</th>
											</tr>
										</thead>
										<tbody class="divide-y divide-gray-100">
											{#each filteredReports as report}
												<tr class="hover:bg-gray-50">
													<td class="px-4 py-3 align-top">
														<span class={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
																report.type === 'user' ? 'bg-red-100 text-red-700'
																: report.type === 'ride' ? 'bg-indigo-100 text-indigo-700'
																: report.type === 'behavior' ? 'bg-orange-100 text-orange-700'
																: report.type === 'spam' ? 'bg-purple-100 text-purple-700'
																: 'bg-blue-100 text-blue-700'
														}`}>
															{reportTypeLabel(report.type)}
														</span>
														<p class="text-xs text-gray-400 mt-1">{new Date(report.created_at).toLocaleDateString('en-US')}</p>
													</td>
													<td class="px-4 py-3 align-top max-w-xs">
														<p class="text-sm text-gray-900 line-clamp-3">{report.description || '—'}</p>
														{#if report.admin_note}
															<p class="text-xs text-gray-400 mt-1 italic">Note: {report.admin_note}</p>
														{/if}
													</td>
													<td class="px-4 py-3 align-top">
														{#if report.reporter_profile}
															<p class="text-sm font-medium text-gray-900">{report.reporter_profile.first_name} {report.reporter_profile.last_name}</p>
															<p class="text-xs text-gray-500">{report.reporter_profile.email || '—'}</p>
														{:else}
															<p class="text-xs text-gray-400">Anonymous</p>
														{/if}
													</td>
													<td class="px-4 py-3 align-top">
														{#if report.reported_profile ?? report.profiles}
															{@const rp = report.reported_profile ?? report.profiles}
															<p class="text-sm font-medium text-gray-900">{rp?.first_name} {rp?.last_name}</p>
															<p class="text-xs text-gray-500">{rp?.email || '—'}</p>
														{/if}
														{#if report.rides}
															<p class="text-xs text-gray-400 mt-1">{report.rides.city_from} → {report.rides.city_to}</p>
														{/if}
													</td>
													<td class="px-4 py-3 align-top">
														<span class={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
															report.status === 'pending' ? 'bg-yellow-100 text-yellow-700'
															: report.status === 'ignored' ? 'bg-gray-100 text-gray-700'
															: 'bg-green-100 text-green-700'
														}`}>
															{report.status === 'pending' ? 'Pending' : report.status === 'ignored' ? 'Ignored' : 'Resolved'}
														</span>
														{#if report.action_taken}
															<p class="text-xs text-gray-500 mt-1">{actionTakenLabel(report.action_taken)}</p>
														{/if}
													</td>
													<td class="px-4 py-3 align-top">
														<div class="flex flex-wrap gap-1">
															<button on:click={() => openReportedUser(report)} class="px-2 py-1 rounded text-xs border border-blue-200 text-blue-700 hover:bg-blue-50">User</button>
															{#if report.ride_id}
																<button on:click={() => openReportedRide(report)} class="px-2 py-1 rounded text-xs border border-indigo-200 text-indigo-700 hover:bg-indigo-50">Ride</button>
															{/if}
															<button on:click={() => openReportHistory(report)} class="px-2 py-1 rounded text-xs border border-gray-300 text-gray-700 hover:bg-gray-50">Detail</button>
														</div>
														<div class="flex flex-wrap gap-1 mt-1">
															<button
																disabled={reportActionId === report.id || report.status === 'ignored'}
																on:click={() => openReportNoteModal(report, 'ignore')}
																class="px-2 py-1 rounded text-xs border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
															>Ignore</button>
															<button
																disabled={reportActionId === report.id}
																on:click={() => openReportNoteModal(report, 'warn')}
																class="px-2 py-1 rounded text-xs border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
															>Warn user</button>
															<button
																disabled={reportActionId === report.id || report.status === 'resolved'}
																on:click={() => openReportNoteModal(report, 'resolve')}
																class="px-2 py-1 rounded text-xs border border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-50"
															>Resolve</button>
															<button
																disabled={reportActionId === report.id}
																on:click={() => openReportNoteModal(report, 'suspend')}
																class="px-2 py-1 rounded text-xs border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
															>Suspend</button>
														</div>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}

							{#if showReportNoteModal && reportNoteModalReport && reportNoteModalAction}
								<div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
									<div class="bg-white rounded-2xl max-w-lg w-full" role="dialog" aria-modal="true" aria-label="Report action modal">
										<div class="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
											<div>
												<h3 class="text-base font-semibold text-gray-900">
													{reportNoteModalAction === 'ignore' ? 'Ignore report'
													: reportNoteModalAction === 'warn' ? 'Warn user'
													: reportNoteModalAction === 'resolve' ? 'Resolve report'
													: 'Suspend account'}
												</h3>
												<p class="text-xs text-gray-500 mt-0.5">Report: {reportNoteModalReport.description?.slice(0, 60) || '—'}</p>
											</div>
											<button on:click={closeReportNoteModal} class="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Close</button>
										</div>
										<div class="p-6 space-y-4">
											{#if reportNoteModalAction === 'suspend'}
												<p class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">This will suspend the reported user's account.</p>
											{/if}
											<div>
												<label for="report-note-input" class="text-xs font-semibold text-gray-700 block mb-1">Admin note (optional)</label>
												<textarea id="report-note-input" bind:value={reportNoteModalText} rows="3" placeholder="Add context or reason..." class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"></textarea>
											</div>
											<div class="flex gap-2">
												<button on:click={submitReportNote} disabled={reportNoteModalSaving} class={`px-4 py-2 text-white text-sm rounded-lg font-medium disabled:opacity-50 ${reportNoteModalAction === 'suspend' ? 'bg-red-600 hover:bg-red-700' : reportNoteModalAction === 'warn' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-600 hover:bg-green-700'}`}>
													{reportNoteModalSaving ? 'Saving...' : 'Confirm'}
												</button>
												<button on:click={closeReportNoteModal} class="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
											</div>
										</div>
									</div>
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
					{:else if activeTab === 'settings'}
						<div class="space-y-5">
							<div class="rounded-2xl border border-gray-200 bg-linear-to-r from-emerald-50 to-white p-5 sm:p-6">
								<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
									<div>
										<h3 class="text-lg font-semibold text-gray-900">Settings</h3>
										<p class="mt-1 text-sm text-gray-600">Configure pricing limits and public content shown on the landing/footer pages.</p>
									</div>
									<button
										on:click={savePlatformSettings}
										disabled={settingsSaving || settingsLoading}
										class="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
									>
										{settingsSaving ? 'Saving...' : 'Save changes'}
									</button>
								</div>
								{#if settingsError}
									<p class="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{settingsError}</p>
								{/if}
								{#if settingsMessage}
									<p class="mt-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{settingsMessage}</p>
								{/if}
							</div>

							{#if settingsLoading}
								<div class="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">Loading settings...</div>
							{:else}
								<div class="grid grid-cols-1 xl:grid-cols-3 gap-5">
									<div class="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
										<h4 class="text-sm font-semibold text-gray-900">Ride limits</h4>
										<div>
											<p class="text-xs font-medium text-gray-600 mb-1">Commission (%)</p>
											<input
												id="commission-percent"
												type="number"
												min="0"
												max="100"
												step="0.1"
												bind:value={commissionPercent}
												class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
											/>
										</div>
										<div>
											<p class="text-xs font-medium text-gray-600 mb-1">Maximum seats per ride</p>
											<input
												id="max-seats-limit"
												type="number"
												min="1"
												bind:value={maxSeatsLimit}
												class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
											/>
										</div>
										<div>
											<p class="text-xs font-medium text-gray-600 mb-1">Maximum ride price (USD)</p>
											<input
												id="max-price-limit"
												type="number"
												min="1"
												step="0.01"
												bind:value={maxPriceLimit}
												class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
											/>
										</div>
									</div>

									<div class="rounded-xl border border-gray-200 bg-white p-5 space-y-4 xl:col-span-2">
										<div class="flex items-start justify-between gap-4">
											<div>
												<h4 class="text-sm font-semibold text-gray-900">Footer content</h4>
												<p class="mt-1 text-xs text-gray-500">Only the labels are editable here. Links stay on standard pages: /about, /how-it-works, /faq, /help, /privacy, /terms.</p>
											</div>
										</div>
										<div>
											<p class="text-xs font-medium text-gray-600 mb-1">Brand description</p>
											<textarea
												rows="2"
												bind:value={footerBrandDescription}
												class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
											></textarea>
										</div>
										<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
											<div>
												<p class="text-xs font-medium text-gray-600 mb-1">About label</p>
												<input bind:value={footerAboutUsLabel} class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
											</div>
											<div>
												<p class="text-xs font-medium text-gray-600 mb-1">How it works label</p>
												<input bind:value={footerHowItWorksLabel} class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
											</div>
											<div>
												<p class="text-xs font-medium text-gray-600 mb-1">FAQ label</p>
												<input bind:value={footerFaqLabel} class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
											</div>
											<div>
												<p class="text-xs font-medium text-gray-600 mb-1">Help center label</p>
												<input bind:value={footerHelpCenterLabel} class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
											</div>
											<div>
												<p class="text-xs font-medium text-gray-600 mb-1">Privacy label</p>
												<input bind:value={footerPrivacyPolicyLabel} class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
											</div>
											<div>
												<p class="text-xs font-medium text-gray-600 mb-1">Terms label</p>
												<input bind:value={footerTermsOfServiceLabel} class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
											</div>
											<div class="md:col-span-2 lg:col-span-3">
												<p class="text-xs font-medium text-gray-600 mb-1">Social links shown on landing footer</p>
												<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
													<input bind:value={socialFacebookUrl} placeholder="https://facebook.com/your-page" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
													<input bind:value={socialInstagramUrl} placeholder="https://instagram.com/your-handle" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
													<input bind:value={socialYoutubeUrl} placeholder="https://youtube.com/@your-channel" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
												</div>
											</div>
										</div>
									</div>

									<div class="rounded-xl border border-gray-200 bg-white p-5 xl:col-span-3">
										<div class="mb-4">
											<h4 class="text-sm font-semibold text-gray-900">Linked page content</h4>
											<p class="mt-1 text-xs text-gray-500">Content shown to users when they open the footer pages.</p>
										</div>
										<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
											<div class="rounded-lg border border-gray-200 p-3">
												<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">About</p>
												<input bind:value={aboutPageTitle} placeholder="Title" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
												<textarea rows="4" bind:value={aboutPageContent} placeholder="Page content" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"></textarea>
											</div>
											<div class="rounded-lg border border-gray-200 p-3">
												<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">How it works</p>
												<input bind:value={howItWorksPageTitle} placeholder="Title" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
												<textarea rows="4" bind:value={howItWorksPageContent} placeholder="Page content" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"></textarea>
											</div>
											<div class="rounded-lg border border-gray-200 p-3">
												<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">FAQ</p>
												<input bind:value={faqPageTitle} placeholder="Title" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
												<textarea rows="4" bind:value={faqPageContent} placeholder="Page content" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"></textarea>
											</div>
											<div class="rounded-lg border border-gray-200 p-3">
												<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Help</p>
												<input bind:value={helpPageTitle} placeholder="Title" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
												<textarea rows="4" bind:value={helpPageContent} placeholder="Page content" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"></textarea>
											</div>
											<div class="rounded-lg border border-gray-200 p-3">
												<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Privacy</p>
												<input bind:value={privacyPageTitle} placeholder="Title" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
												<textarea rows="4" bind:value={privacyPageContent} placeholder="Page content" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"></textarea>
											</div>
											<div class="rounded-lg border border-gray-200 p-3">
												<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Terms</p>
												<input bind:value={termsPageTitle} placeholder="Title" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
												<textarea rows="4" bind:value={termsPageContent} placeholder="Page content" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"></textarea>
											</div>
										</div>
									</div>
								</div>
							{/if}
						</div>
					{:else if activeTab === 'support'}
						<div class="space-y-6">
							<div class="bg-white rounded-xl p-4 border border-gray-200">
								<div class="grid grid-cols-1 md:grid-cols-5 gap-3">
									<input
										type="text"
										placeholder="Search subject, name, email..."
										class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
										bind:value={supportSearch}
										on:input={applySupportFilters}
									/>
									<select
										class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
										bind:value={supportFilterStatus}
										on:change={loadSupportTickets}
									>
										<option value="">All statuses</option>
										<option value="open">Open</option>
										<option value="in_progress">In progress</option>
										<option value="resolved">Resolved</option>
										<option value="closed">Closed</option>
									</select>
									<select
										class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
										bind:value={supportFilterPriority}
										on:change={loadSupportTickets}
									>
										<option value="">All priorities</option>
										<option value="urgent">Urgent</option>
										<option value="high">High</option>
										<option value="normal">Normal</option>
										<option value="low">Low</option>
									</select>
									<button
										on:click={loadSupportTickets}
										class="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium"
									>
										Refresh
									</button>
								</div>
								{#if supportActionMessage}
									<p class={`text-sm border rounded-lg px-3 py-2 mt-3 ${supportActionIsError ? 'text-red-700 bg-red-50 border-red-200' : 'text-green-700 bg-green-50 border-green-200'}`}>{supportActionMessage}</p>
								{/if}
								{#if supportError}
									<p class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">{supportError}</p>
								{/if}
							</div>

							{#if supportTickets.length > 0}
								{@const openCount = supportTickets.filter(t => t.status === 'open').length}
								{@const inProgressCount = supportTickets.filter(t => t.status === 'in_progress').length}
								{@const resolvedCount = supportTickets.filter(t => t.status === 'resolved').length}
								{@const urgentCount = supportTickets.filter(t => t.priority === 'urgent').length}
								{@const highCount = supportTickets.filter(t => t.priority === 'high').length}
								<div class="grid grid-cols-2 md:grid-cols-5 gap-3">
									<div class="bg-white rounded-xl border border-gray-200 px-4 py-3">
										<p class="text-xs text-gray-500">Total</p>
										<p class="text-2xl font-bold text-gray-800 mt-0.5">{supportTickets.length}</p>
									</div>
									<div class="bg-white rounded-xl border border-yellow-200 px-4 py-3">
										<p class="text-xs text-yellow-700">Open</p>
										<p class="text-2xl font-bold text-yellow-800 mt-0.5">{openCount}</p>
									</div>
									<div class="bg-white rounded-xl border border-indigo-200 px-4 py-3">
										<p class="text-xs text-indigo-700">In progress</p>
										<p class="text-2xl font-bold text-indigo-800 mt-0.5">{inProgressCount}</p>
									</div>
									<div class="bg-white rounded-xl border border-green-200 px-4 py-3">
										<p class="text-xs text-green-700">Resolved</p>
										<p class="text-2xl font-bold text-green-800 mt-0.5">{resolvedCount}</p>
									</div>
									<div class="bg-white rounded-xl border border-red-200 px-4 py-3">
										<p class="text-xs text-red-700">Urgent / High</p>
										<p class="text-2xl font-bold text-red-800 mt-0.5">{urgentCount + highCount}</p>
									</div>
								</div>
							{/if}

							<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
								<!-- Ticket list -->
								<div class="lg:col-span-1 border border-gray-200 rounded-xl overflow-hidden">
									<div class="bg-gray-50 px-4 py-3 border-b border-gray-200">
										<h3 class="text-sm font-semibold text-gray-900">Tickets ({filteredSupportTickets.length})</h3>
									</div>
									{#if supportLoading}
										<p class="text-sm text-gray-500 px-4 py-3">Loading...</p>
									{:else if filteredSupportTickets.length === 0}
										<p class="text-sm text-gray-500 px-4 py-3">No tickets.</p>
									{:else}
										<div class="max-h-150 overflow-y-auto divide-y divide-gray-100">
											{#each filteredSupportTickets as ticket}
												<button
													type="button"
													on:click={() => openSupportTicket(ticket)}
													class="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors {selectedSupportTicket?.id === ticket.id ? 'bg-green-50 border-l-2 border-l-green-500' : ''}"
												>
													<div class="flex items-start justify-between gap-1">
														<p class="text-sm font-medium text-gray-900 truncate flex-1">{ticket.subject}</p>
														<span class="text-[10px] text-gray-400 shrink-0">{ticketAge(ticket.created_at)}</span>
													</div>
													<p class="text-xs text-gray-500 truncate mt-0.5">
														{ticket.profiles?.first_name ?? ''} {ticket.profiles?.last_name ?? ''} · {ticket.profiles?.email ?? ''}
													</p>
													<div class="mt-1.5 flex gap-1 flex-wrap">
														<span class={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
															ticket.priority === 'urgent' ? 'bg-red-100 text-red-700'
															: ticket.priority === 'high' ? 'bg-orange-100 text-orange-700'
															: ticket.priority === 'normal' ? 'bg-blue-100 text-blue-700'
															: 'bg-gray-100 text-gray-600'
														}`}>
															{ticket.priority}
														</span>
														<span class={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
															ticket.status === 'open' ? 'bg-yellow-100 text-yellow-700'
															: ticket.status === 'in_progress' ? 'bg-indigo-100 text-indigo-700'
															: ticket.status === 'resolved' ? 'bg-green-100 text-green-700'
															: 'bg-gray-100 text-gray-600'
														}`}>
															{ticket.status.replace('_', ' ')}
														</span>
													</div>
												</button>
											{/each}
										</div>
									{/if}
								</div>

								<!-- Conversation panel -->
								<div class="lg:col-span-2 border border-gray-200 rounded-xl overflow-hidden flex flex-col">
									{#if !selectedSupportTicket}
										<div class="flex items-center justify-center h-64 text-sm text-gray-400">Select a ticket to view the conversation.</div>
									{:else}
										<div class="bg-gray-50 px-4 py-3 border-b border-gray-200 space-y-2">
											<div class="flex items-start justify-between gap-2">
												<div class="flex-1 min-w-0">
													<p class="text-sm font-semibold text-gray-900 truncate">{selectedSupportTicket.subject}</p>
													<p class="text-xs text-gray-500 mt-0.5">
														{selectedSupportTicket.profiles?.first_name ?? ''} {selectedSupportTicket.profiles?.last_name ?? ''} ·
														{selectedSupportTicket.profiles?.email ?? '—'} ·
														opened {ticketAge(selectedSupportTicket.created_at)}
													</p>
												</div>
												<button
													disabled={supportDeletingTicket}
													on:click={() => deleteSupportTicket(selectedSupportTicket!)}
													class="shrink-0 px-2 py-1 rounded text-xs border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
													title="Delete ticket and all messages"
												>Delete</button>
											</div>
											<div class="flex gap-2 flex-wrap items-center">
												<div class="flex items-center gap-1">
													<span class="text-xs text-gray-500">Status:</span>
													<select
														disabled={supportUpdatingStatus}
														class="px-2 py-0.5 border border-gray-300 rounded text-xs"
														value={selectedSupportTicket.status}
														on:change={(e) => updateSupportTicketStatus((e.currentTarget as HTMLSelectElement).value as SupportTicket['status'])}
													>
														<option value="open">Open</option>
														<option value="in_progress">In progress</option>
														<option value="resolved">Resolved</option>
														<option value="closed">Closed</option>
													</select>
												</div>
												<div class="flex items-center gap-1">
													<span class="text-xs text-gray-500">Priority:</span>
													<select
														disabled={supportUpdatingStatus}
														class="px-2 py-0.5 border border-gray-300 rounded text-xs"
														value={selectedSupportTicket.priority}
														on:change={(e) => updateSupportTicketPriority((e.currentTarget as HTMLSelectElement).value as SupportTicket['priority'])}
													>
														<option value="low">Low</option>
														<option value="normal">Normal</option>
														<option value="high">High</option>
														<option value="urgent">Urgent</option>
													</select>
												</div>
												<div class="flex gap-1 ml-auto">
													<button
														disabled={supportUpdatingStatus || selectedSupportTicket.status === 'resolved'}
														on:click={() => updateSupportTicketStatus('resolved')}
														class="px-2 py-0.5 rounded text-xs border border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-50"
													>✓ Resolve</button>
													<button
														disabled={supportUpdatingStatus || selectedSupportTicket.status === 'closed'}
														on:click={() => updateSupportTicketStatus('closed')}
														class="px-2 py-0.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
													>Close</button>
													{#if selectedSupportTicket.status === 'closed' || selectedSupportTicket.status === 'resolved'}
														<button
															disabled={supportUpdatingStatus}
															on:click={() => updateSupportTicketStatus('open')}
															class="px-2 py-0.5 rounded text-xs border border-yellow-200 text-yellow-700 hover:bg-yellow-50 disabled:opacity-50"
														>Reopen</button>
													{/if}
												</div>
											</div>
										</div>

										<div class="flex-1 p-4 space-y-3 max-h-95 overflow-y-auto bg-gray-50">
											{#if supportMessagesLoading}
												<p class="text-sm text-gray-500">Loading conversation...</p>
											{:else if supportMessages.length === 0}
												<p class="text-sm text-gray-500">No messages yet.</p>
											{:else}
												{#each supportMessages as msg}
													<div class="{msg.sender_role === 'admin' ? 'text-right' : 'text-left'}">
														<div class="inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm {msg.sender_role === 'admin' ? 'bg-green-100 text-green-900' : 'bg-white border border-gray-200 text-gray-800'}">
															<p class="text-[11px] opacity-60 mb-1">
																{msg.sender_role === 'admin' ? 'Admin' : (msg.profiles ? `${msg.profiles.first_name ?? ''} ${msg.profiles.last_name ?? ''}`.trim() || 'User' : 'User')} · {new Date(msg.created_at).toLocaleString('en-US')}
															</p>
															<div class="whitespace-pre-wrap">{@html msg.message}</div>
														</div>
													</div>
												{/each}
											{/if}
										</div>

										<div class="p-4 border-t border-gray-200 bg-white space-y-2">
											<textarea
												rows="3"
												bind:value={supportReplyMessage}
												placeholder="Write a reply to the user..."
												class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
											></textarea>
											<div class="flex items-center justify-between gap-2">
												<label class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
													<input type="checkbox" bind:checked={supportReplyAndResolve} class="rounded" />
													Mark as resolved after sending
												</label>
												<button
													disabled={supportSendingReply || !supportReplyMessage.trim()}
													on:click={sendSupportReply}
													class="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
												>
													{supportSendingReply ? 'Sending...' : 'Reply'}
												</button>
											</div>
										</div>
									{/if}
								</div>
								<div class="rounded-xl border p-5 {stats.alerts.supportTickets > 0 ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-gray-50'}">
									<div class="flex items-center justify-between mb-2">
										<p class="text-sm font-semibold {stats.alerts.supportTickets > 0 ? 'text-indigo-800' : 'text-gray-600'}">Support tickets</p>
										<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold {stats.alerts.supportTickets > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-600'}">{stats.alerts.supportTickets}</span>
									</div>
									{#if stats.alerts.supportTickets === 0}
										<p class="text-xs text-gray-500">No open support tickets.</p>
									{:else}
										<p class="text-xs text-indigo-700 mb-2">New or active support requests need attention.</p>
										<button type="button" on:click={() => setTab('support')} class="text-xs font-medium text-indigo-700 underline hover:text-indigo-900 cursor-pointer">
											View support ->
										</button>
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
						<p class="text-sm text-gray-500">{selectedRideForBookings.city_from} -> {selectedRideForBookings.city_to}</p>
					</div>
					<button
						on:click={closeRideBookingsModal}
						class="text-gray-400 hover:text-gray-600 text-xl font-semibold p-1"
						aria-label="Close"
						title="Close modal"
					>
						X
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
						X
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
								{selectedBooking.status === 'Confirmed' ? 'Confirmed' : selectedBooking.status === 'Pending' ? 'Pending' : 'Cancelled'}
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
										<p class="text-xs text-gray-500">Name</p>
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
										<p class="text-xs text-gray-500">Average rating</p>
										<p class="text-sm font-medium text-gray-900">{selectedBookingRider.average_rating ? `${selectedBookingRider.average_rating}/5` : 'No reviews'}</p>
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
									<p class="text-sm font-medium text-gray-900">{selectedBooking.rides?.city_from} -> {selectedBooking.rides?.city_to}</p>
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
									<p class="text-xs text-gray-500">Price per seat</p>
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
						X
					</button>
				</div>
				<div class="p-6 space-y-4 text-sm">
					<div class="rounded-lg border border-gray-200 p-4">
						<p class="text-gray-500">Type</p>
						<p class="font-medium text-gray-900">{reportTypeLabel(selectedReportHistory.type)}</p>
					</div>
					<div class="rounded-lg border border-gray-200 p-4">
						<p class="text-gray-500">Description</p>
						<p class="font-medium text-gray-900">{selectedReportHistory.description || 'No description'}</p>
					</div>
					{#if selectedReportHistory.reporter_profile}
						<div class="rounded-lg border border-blue-100 bg-blue-50 p-4">
							<p class="text-blue-600 font-medium mb-1">Reporter</p>
							<p class="font-medium text-gray-900">{selectedReportHistory.reporter_profile.first_name} {selectedReportHistory.reporter_profile.last_name}</p>
							<p class="text-gray-500 text-xs">{selectedReportHistory.reporter_profile.email || '—'}</p>
						</div>
					{/if}
					{#if selectedReportHistory.reported_profile ?? selectedReportHistory.profiles}
						{@const rp = selectedReportHistory.reported_profile ?? selectedReportHistory.profiles}
						<div class="rounded-lg border border-orange-100 bg-orange-50 p-4">
							<p class="text-orange-600 font-medium mb-1">Reported user</p>
							<p class="font-medium text-gray-900">{rp?.first_name} {rp?.last_name}</p>
							<p class="text-gray-500 text-xs">{rp?.email || '—'}</p>
						</div>
					{/if}
					{#if selectedReportHistory.rides}
						<div class="rounded-lg border border-indigo-100 bg-indigo-50 p-4">
							<p class="text-indigo-600 font-medium mb-1">Ride</p>
							<p class="font-medium text-gray-900">{selectedReportHistory.rides.city_from} → {selectedReportHistory.rides.city_to}</p>
							<p class="text-gray-500 text-xs">{selectedReportHistory.rides.ride_date ? new Date(selectedReportHistory.rides.ride_date).toLocaleDateString('en-US') : ''}</p>
						</div>
					{/if}
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
						<p class="text-gray-500">Action taken</p>
						<p class="font-medium text-gray-900">{actionTakenLabel(selectedReportHistory.action_taken)}</p>
					</div>
					<div class="rounded-lg border border-gray-200 p-4">
						<p class="text-gray-500">Admin note</p>
						<p class="font-medium text-gray-900">{selectedReportHistory.admin_note || 'No note'}</p>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Export Data Section -->
	<div class="mt-8 bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
		<div class="flex items-center justify-between mb-4">
			<div>
				<h3 class="text-base font-semibold text-gray-900">Export platform data</h3>
				<p class="text-sm text-gray-500 mt-1">Download your platform data for backup or analysis.</p>
			</div>
		</div>

		{#if exportError}
			<div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
				{exportError}
			</div>
		{/if}

		<div class="space-y-4">
			<div>
				<p class="text-sm font-medium text-gray-700 mb-3">Selected period: <span class="font-semibold capitalize">{selectedPeriod}</span></p>
				<div class="flex flex-wrap gap-2">
					<button
						on:click={() => exportData('json', 'all')}
						disabled={exportLoading}
						class="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 cursor-pointer"
					>
						{#if exportLoading}
							Exporting...
						{:else}
							Export all (JSON)
						{/if}
					</button>
					<button
						on:click={() => exportData('csv', 'all')}
						disabled={exportLoading}
						class="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 cursor-pointer"
					>
						{#if exportLoading}
							Exporting...
						{:else}
							Export all (CSV)
						{/if}
					</button>
					<button
						on:click={() => exportData('json', 'rides')}
						disabled={exportLoading}
						class="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
					>
						Rides (JSON)
					</button>
					<button
						on:click={() => exportData('csv', 'rides')}
						disabled={exportLoading}
						class="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
					>
						Rides (CSV)
					</button>
					<button
						on:click={() => exportData('json', 'bookings')}
						disabled={exportLoading}
						class="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 cursor-pointer"
					>
						Bookings (JSON)
					</button>
					<button
						on:click={() => exportData('csv', 'bookings')}
						disabled={exportLoading}
						class="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 cursor-pointer"
					>
						Bookings (CSV)
					</button>
				</div>
			</div>
		</div>
	</div>
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
								<p class="text-gray-500">Gender</p>
								<div class="flex items-center gap-2 mt-1">
									<select
										bind:value={selectedProfile.gender}
										on:change={(e) => updateSelectedProfileGender(e.currentTarget.value)}
										disabled={actionUserId === selectedProfile.id}
										class="px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 disabled:opacity-50"
									>
										<option value="male">Male</option>
										<option value="female">Female</option>
									</select>
								</div>
							</div>
							<div>
								<p class="text-gray-500">Average rating</p>
								<p class="font-medium text-gray-900">{selectedProfile.average_rating ? selectedProfile.average_rating.toFixed(1) + '/5' : '-'}</p>
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

					<div>
						<h3 class="text-sm font-semibold text-gray-900 mb-3">Private profile (admin only)</h3>
						{#if privateProfileLoading}
							<p class="text-sm text-gray-500 mb-2">Loading private profile...</p>
						{/if}
						{#if privateProfileError}
							<p class="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 mb-2">{privateProfileError}</p>
						{/if}
						{#if privateProfile && !privateProfileLoading && !privateProfileError}
							<div class="rounded-lg border border-gray-200 bg-gray-50 p-3 mb-3">
								<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
									<div>
										<p class="text-xs text-gray-500">Name</p>
										<p class="font-medium text-gray-900">{privateProfileSummary.firstName || '-'} {privateProfileSummary.lastName || ''}</p>
									</div>
									<div>
										<p class="text-xs text-gray-500">Email</p>
										<p class="font-medium text-gray-900 break-all">{privateProfileSummary.email || '-'}</p>
									</div>
									<div>
										<p class="text-xs text-gray-500">Phone</p>
										<p class="font-medium text-gray-900">{privateProfileSummary.phone || '-'}</p>
									</div>
									<div>
										<p class="text-xs text-gray-500">Verification status</p>
										<p class="font-medium {privateProfileSummary.isVerified ? 'text-emerald-700' : 'text-amber-700'}">
											{privateProfileSummary.status || (privateProfileSummary.isVerified ? 'Verified' : 'Unverified')}
										</p>
									</div>
									<div>
										<p class="text-xs text-gray-500">Auth provider</p>
										<p class="font-medium text-gray-900">{privateProfileSummary.provider || '-'}</p>
									</div>
									<div>
										<p class="text-xs text-gray-500">Last sign-in</p>
										<p class="font-medium text-gray-900">
											{privateProfileSummary.lastSignInAt ? new Date(privateProfileSummary.lastSignInAt).toLocaleString('en-US') : '-'}
										</p>
									</div>
								</div>
							</div>

						{/if}
						<button
							type="button"
							disabled={privateProfileOpenInProgress || !selectedProfile}
							on:click={() => selectedProfile && openPrivateProfileJson(selectedProfile.id)}
							class="px-3 py-2 rounded-lg border border-blue-300 text-blue-700 bg-blue-50 text-xs font-medium hover:bg-blue-100 disabled:opacity-50"
						>
							{privateProfileOpenInProgress ? 'Opening...' : 'Open full profile in new window'}
						</button>
					</div>

					<!-- Status Actions -->
					<div>
						<h3 class="text-sm font-semibold text-gray-900 mb-3">Account management</h3>
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
							<div class="rounded-lg border border-gray-200 px-3 py-2">
								<p class="text-xs text-gray-500">Email confirmation</p>
								<p class="text-sm font-medium {selectedProfile.email_confirmed ? 'text-blue-700' : 'text-gray-700'}">
									{selectedProfile.email_confirmed ? 'Confirmed' : 'Not confirmed'}
								</p>
							</div>
							<div class="rounded-lg border border-gray-200 px-3 py-2">
								<p class="text-xs text-gray-500">Profile verification</p>
								<p class="text-sm font-medium {selectedProfile.is_verified ? 'text-indigo-700' : 'text-gray-700'}">
									{selectedProfile.is_verified ? 'Verified' : 'Not verified'}
								</p>
							</div>
						</div>
						<div class="rounded-lg border border-gray-200 px-3 py-2 mb-3">
							<p class="text-xs text-gray-500">Account badge</p>
							<p class="text-sm font-semibold {selectedProfile.account_verified ? 'text-emerald-700' : 'text-amber-700'}">
								{selectedProfile.account_verified ? 'Verified' : 'Not verified'}
							</p>
							<p class="text-xs text-gray-500 mt-1">This badge is verified only when both email confirmation and profile verification are complete.</p>
						</div>
						{#if statusActionMessage}
							<p class="text-sm bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 mb-3">{statusActionMessage}</p>
						{/if}
						{#if usersActionMessage}
							<p class="text-sm bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-2 mb-3">{usersActionMessage}</p>
						{/if}
						<div class="space-y-3">
							<div class="rounded-lg border border-gray-200 p-3">
								<p class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Verification actions</p>
								<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
									<button
										type="button"
										disabled={actionUserId === selectedProfile.id || selectedProfile.is_verified === true}
										on:click={() => updateSelectedProfileVerification(true)}
										class="w-full px-3 py-2 rounded-lg border border-indigo-300 text-indigo-700 bg-indigo-50 text-sm font-medium hover:bg-indigo-100 disabled:opacity-50"
									>
										Verify profile
									</button>
									<button
										type="button"
										disabled={actionUserId === selectedProfile.id || selectedProfile.is_verified !== true}
										on:click={() => updateSelectedProfileVerification(false)}
										class="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
									>
										Set unverified
									</button>
									<button
										type="button"
										disabled={actionUserId === selectedProfile.id || selectedProfile.email_confirmed === true}
										on:click={markSelectedProfileEmailConfirmed}
										class="w-full px-3 py-2 rounded-lg border border-blue-300 text-blue-700 bg-blue-50 text-sm font-medium hover:bg-blue-100 disabled:opacity-50"
									>
										Confirm email
									</button>
								</div>
							</div>

							<div class="rounded-lg border border-gray-200 p-3">
								<p class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Account status</p>
								<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
									<button
										type="button"
										disabled={statusActionInProgress}
										on:click={() => changeUserStatus('active')}
										class="w-full px-3 py-2 rounded-lg border text-sm font-medium {selectedProfile.user_status === 'active' ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'} disabled:opacity-50"
									>
										{selectedProfile.user_status === 'active' ? '[Current] ' : ''}Active
									</button>
									<button
										type="button"
										disabled={statusActionInProgress}
										on:click={() => changeUserStatus('suspended')}
										class="w-full px-3 py-2 rounded-lg border text-sm font-medium {selectedProfile.user_status === 'suspended' ? 'border-yellow-300 bg-yellow-50 text-yellow-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'} disabled:opacity-50"
									>
										{selectedProfile.user_status === 'suspended' ? '[Current] ' : ''}Suspended
									</button>
									<button
										type="button"
										disabled={statusActionInProgress}
										on:click={() => changeUserStatus('banned')}
										class="w-full px-3 py-2 rounded-lg border text-sm font-medium {selectedProfile.user_status === 'banned' ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'} disabled:opacity-50"
									>
										{selectedProfile.user_status === 'banned' ? '[Current] ' : ''}Banned
									</button>
								</div>
							</div>

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
													<p class="text-xs text-gray-500">{doc.file_name} | {new Date(doc.created_at).toLocaleDateString('en-US')}</p>
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
												<p><strong>{ride.city_from}</strong> -> <strong>{ride.city_to}</strong></p>
												<p class="text-gray-600">{new Date(ride.ride_date).toLocaleDateString('en-US')} | {ride.available_seats} seats | ${ride.price}</p>
											</div>
										{/each}
									</div>
								{/if}
								{#if profileBookings.length > 0}
									<div>
										<p class="text-xs font-medium text-gray-600 mb-2">Booked rides</p>
										{#each profileBookings as booking}
											<div class="text-xs border border-gray-200 rounded p-2 mb-2">
												<p>{booking.ride?.[0]?.city_from || '-'} -> {booking.ride?.[0]?.city_to || '-'} ({booking.seats_booked} seats)</p>
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
