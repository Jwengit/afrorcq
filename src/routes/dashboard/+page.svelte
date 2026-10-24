<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ReviewForm from '$lib/components/ReviewForm.svelte';
	import ReviewsSection from '$lib/components/ReviewsSection.svelte';
	import { onDestroy, onMount, tick } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import {
		resolveMemberStatus,
		canUseVerifiedFeatures,
		hasPendingReviewBlock,
		type MemberStatus
	} from '$lib/membershipAccess';
	import {
		areRequiredMembershipDocumentsApproved,
		isMembershipVerificationReady,
		type VerificationDocument
	} from '$lib/membershipVerification';
	import type { User } from '@supabase/supabase-js';

	type DriverProfile = {
		gender?: string | null;
		status?: string | null;
		is_verified?: boolean | null;
		membership_paid?: boolean | null;
		membership_expires_at?: string | null;
		review_pending?: boolean | null;
		review_pending_ride_id?: string | null;
		user_status?: string | null;
		suspended_until?: string | null;
		status_reason?: string | null;
		membership_plan?: string | null;
		profile_photo_url?: string | null;
		car_make?: string | null;
		color?: string | null;
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
		initiated_by_admin?: boolean;
		archived_at?: string | null;
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
		archivedAt?: string | null;
		notificationType?: string;
	};

	type InboxConversation = {
		key: string;
		ticketId: string;
		subject: string;
		status: string;
		messages: AdminInboxMessage[];
		latestAt: string;
		notificationType?: string;
		archivedAt: string | null;
	};

	type MemberNotification = {
		id: string;
		type: string;
		title: string;
		message: string;
		created_at: string;
	};

	type ActivityItem = {
		id: string;
		title: string;
		details: string;
		createdAtIso: string;
		sectionHref:
			| '/dashboard#my-bookings'
			| '/dashboard#ride-requests'
			| '/dashboard#archive'
			| '/dashboard#admin-messages';
		type: 'booking' | 'request' | 'admin' | 'review';
	};

	let currentUser: User | null = null;
	let isFemaleDriver = false;
	let memberStatus: MemberStatus = 'free';
	let verificationReviewState: 'ready' | 'approved' | 'review' | 'unknown' = 'unknown';
	let isCurrentUserVerified = false;
	let hasActiveMembership = false;
	let membershipExpiresAt: string | null = null;
	let reviewPendingBlocked = false;
	let reviewPendingRideId: string | null = null;
	let accountUserStatus: string = 'active';
	let accountSuspendedUntil: string | null = null;
	let accountStatusReason: string | null = null;	let loading = true;
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
	let bookingToReject: DriverBookingRequest | null = null;
	let rejectionReason = '';
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
	let memberNotifications: AdminInboxMessage[] = [];
	let deletingAdminMessageId: string | null = null;
	let supportReplyDrafts: Record<string, string> = {};
	let supportReplySendingTicketId: string | null = null;
	let supportReplyError = '';
	let supportReplySuccess = '';
	let activityFeed: ActivityItem[] = [];
	let visibleActivityFeed: ActivityItem[] = [];
	let activitySeenAt = 0;
	let newActivityCount = 0;

	const ACTIVITY_SEEN_KEY_PREFIX = 'dashboard-activity-seen-at';

	let editRideForm = {
		departure: '',
		arrival: '',
		rideDate: '',
		seats: 1,
		price: 0,
		girlsOnly: false
	};

	let currentAccessToken: string | null = null;

	function refreshEligibilityOnFocus() {
		if (currentUser) {
			void loadDriverEligibility(currentUser.id);
			void loadAdminInboxMessages();
			void loadMemberNotifications();
		}
	}

	onMount(async () => {
		const {
			data: { user }
		} = await supabase.auth.getUser();

		currentUser = user;
		if (browser) {
			window.addEventListener('focus', refreshEligibilityOnFocus);
		}
		loadActivitySeenAt();

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
		if (browser && window.location.hash === '#archive') {
			showArchive = true;
			if (reviewPendingBlocked) {
				await goToPendingReview();
			}
		}
		await loadAdminInboxMessages();
		await loadMemberNotifications();
		loading = false;
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('focus', refreshEligibilityOnFocus);
		}
	});

	$: activityFeed = [
		...myBookings
			.filter((booking) => booking.status !== 'Pending')
			.map((booking) => ({
				id: `booking:${booking.id}`,
				title:
					booking.status === 'Confirmed'
						? 'Booking confirmed'
						: booking.status === 'Rejected'
							? 'Booking request rejected'
							: 'Booking status updated',
				details: `${booking.ride.departure} -> ${booking.ride.arrival}`,
				createdAtIso: booking.updated_at,
				sectionHref: '/dashboard#my-bookings' as const,
				type: 'booking' as const
			})),
		...incomingRequests
			.filter((request) => request.status !== 'Pending')
			.map((request) => ({
				id: `request:${request.id}`,
				title:
					request.status === 'Confirmed'
						? 'Passenger confirmed on your ride'
						: request.status === 'Rejected'
							? 'Passenger request rejected'
							: 'Request status updated',
				details: `${request.ride.departure} -> ${request.ride.arrival}`,
				createdAtIso: request.updated_at,
				sectionHref: '/dashboard#ride-requests' as const,
				type: 'request' as const
			})),
		...activeAdminInboxConversations
			.filter((conversation) => conversation.messages.some((message) => message.senderRole === 'admin'))
			.map((conversation) => ({
				id: `admin:${conversation.key}`,
				title: conversation.notificationType === 'review_rejected' ? 'Review needs an update' : 'New admin message',
				details: conversation.notificationType === 'review_rejected'
						? 'Your review was rejected. Update it and submit it again.'
						: conversation.subject,
				createdAtIso: conversation.latestAt,
				sectionHref:
					conversation.notificationType === 'review_rejected'
						? ('/dashboard#archive' as const)
						: ('/dashboard#admin-messages' as const),
				type: conversation.notificationType === 'review_rejected' ? ('review' as const) : ('admin' as const)
			}))
	]
		.sort((a, b) => new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime())
		.slice(0, 20);

	$: visibleActivityFeed = activityFeed.filter((item) => {
		const timestamp = Date.parse(item.createdAtIso);
		if (Number.isNaN(timestamp)) return false;
		return timestamp > activitySeenAt;
	});
	$: newActivityCount = visibleActivityFeed.length;

	$: adminInboxConversations = (() => {
		const conversations: Record<string, InboxConversation> = {};
		for (const message of adminInboxMessages) {
			const key = message.ticketId ? `ticket:${message.ticketId}` : `notification:${message.id}`;
			const existing = conversations[key];
			if (existing) {
				existing.messages.push(message);
				if (new Date(message.createdAt).getTime() > new Date(existing.latestAt).getTime()) {
					existing.latestAt = message.createdAt;
				}
				continue;
			}

			conversations[key] = {
				key,
				ticketId: message.ticketId,
				subject: message.subject,
				status: message.status,
				messages: [message],
				latestAt: message.createdAt,
				notificationType: message.notificationType,
				archivedAt: message.archivedAt ?? null
			};
		}

		const groupedConversations = Object.values(conversations);
		for (const conversation of groupedConversations) {
			conversation.messages.sort(
				(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
			);
		}

		return groupedConversations.sort(
			(a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime()
		);
	})();
	$: activeAdminInboxConversations = adminInboxConversations.filter(
		(conversation) => !conversation.archivedAt
	);
	$: archivedAdminInboxConversations = adminInboxConversations.filter(
		(conversation) => Boolean(conversation.archivedAt)
	);

	function activitySeenStorageKey() {
		return currentUser ? `${ACTIVITY_SEEN_KEY_PREFIX}:${currentUser.id}` : ACTIVITY_SEEN_KEY_PREFIX;
	}

	function loadActivitySeenAt() {
		if (!browser) return;
		try {
			const raw = localStorage.getItem(activitySeenStorageKey());
			activitySeenAt = raw ? Number(raw) || 0 : 0;
		} catch {
			activitySeenAt = 0;
		}
	}

	function markActivityAsSeen() {
		const latestTimestamp = activityFeed
			.map((item) => Date.parse(item.createdAtIso))
			.filter((value) => Number.isFinite(value))
			.reduce((maxValue, currentValue) => Math.max(maxValue, currentValue), 0);

		activitySeenAt = Math.max(activitySeenAt, latestTimestamp, Date.now());

		if (!browser) return;
		try {
			localStorage.setItem(activitySeenStorageKey(), String(activitySeenAt));
		} catch {
			// Ignore storage errors.
		}
	}

	function activityBadgeClass(type: ActivityItem['type']) {
		if (type === 'booking') return 'bg-sky-100 text-sky-700';
		if (type === 'request') return 'bg-amber-100 text-amber-700';
		return 'bg-indigo-100 text-indigo-700';
	}

	function activityTypeLabel(type: ActivityItem['type']) {
		if (type === 'booking') return 'Booking';
		if (type === 'request') return 'Request';
		if (type === 'review') return 'Review';
		return 'Admin';
	}

	function handleActivityClick(item: ActivityItem, event: MouseEvent) {
		if (item.type === 'review') {
			event.preventDefault();
			void goToPendingReview();
		}
	}

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

			const tickets = (ticketsPayload?.tickets ?? []) as SupportTicket[];
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

			adminInboxMessages = (ticketConversations
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
							createdAt: msg.created_at,
							archivedAt: ticket.archived_at ?? null
						}))
				) as AdminInboxMessage[])
				.concat(memberNotifications)
				.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
		} catch (error) {
			adminInboxError = error instanceof Error ? error.message : 'Unable to load admin messages.';
			adminInboxMessages = [];
		} finally {
			adminInboxLoading = false;
		}
	}

	async function loadMemberNotifications() {
		if (!currentUser) return;

		try {
			const token = await getSessionAccessToken();
			if (!token) return;

			const response = await fetch('/api/member-notifications', {
				headers: {
					Authorization: `Bearer ${token}`
				}
			});
			if (!response.ok) return;

			const payload = await response.json();
			memberNotifications = ((payload?.notifications ?? []) as MemberNotification[]).map((notification) => ({
				id: notification.id,
				ticketId: '',
				subject: notification.title,
				status: 'notification',
				senderRole: 'admin' as const,
				message: notification.message,
				createdAt: notification.created_at,
				notificationType: notification.type
			}));
			adminInboxMessages = [...adminInboxMessages.filter((message) => message.ticketId), ...memberNotifications]
				.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
		} catch {
			memberNotifications = [];
		}
	}

	function getReviewRejectionNote(message: string): string {
		const legacyHtmlNote = message.match(/<strong>Admin note:<\/strong>\s*([\s\S]*?)<\/p>/i)?.[1];
		if (legacyHtmlNote !== undefined) {
			return legacyHtmlNote
				.replace(/&lt;/g, '<')
				.replace(/&gt;/g, '>')
				.replace(/&quot;/g, '"')
				.replace(/&#39;/g, "'")
				.replace(/&amp;/g, '&');
		}

		return message.match(/^Admin note:\s*(.+)$/m)?.[1]?.trim() ?? '';
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

			const message = adminInboxMessages.find((item) => item.id === messageId);
			const response = await fetch(
				message?.ticketId
					? `/api/support/tickets?messageId=${encodeURIComponent(messageId)}`
					: `/api/member-notifications?notificationId=${encodeURIComponent(messageId)}`,
				{
				method: 'DELETE',
				headers: {
					Authorization: `Bearer ${token}`
				}
				}
			);

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
			if (payload?.emailSent === false) {
				supportReplyError = payload?.warning || 'Your reply was saved, but the administrator email notification failed.';
			} else {
				supportReplySuccess = 'Your reply has been sent.';
			}
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

		const seen: string[] = [];
		return targets.filter((target) => {
			const key = `${target.rideId}:${target.revieweeId}`;
			if (seen.includes(key)) return false;
			seen.push(key);
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
			.select('ride_id,reviewee_id,status')
			.eq('reviewer_id', currentUser.id);

		if (error) {
			console.error('Pending reviews count error:', error);
			pendingArchiveReviewsCount = targets.length;
			return;
		}

		const reviewedTargets = new Set(
			((data ?? []) as Array<{ ride_id: string; reviewee_id: string; status: string }>).filter(
				(item) => item.status !== 'rejected'
			).map((item) =>
				`${item.ride_id}:${item.reviewee_id}`
			)
		);

		pendingArchiveReviewsCount = targets.filter(
			(target) => !reviewedTargets.has(`${target.rideId}:${target.revieweeId}`)
		).length;
	}

	async function handleReviewSubmitted() {
		await refreshPendingArchiveReviewsCount();
		if (currentUser) {
			await loadDriverEligibility(currentUser.id);
		}
	}

	async function loadDriverEligibility(userId: string) {
		verificationReviewState = 'unknown';
		await supabase.rpc('refresh_review_pending_for_member', { p_user_id: userId });

		const { data, error } = await supabase
			.from('profiles')
			.select('gender, status, is_verified, membership_paid, membership_expires_at, review_pending, review_pending_ride_id, membership_plan, profile_photo_url, car_make, color')
			.eq('id', userId)
			.maybeSingle();

		if (error) {
			const fallback = await supabase
				.from('profiles')
				.select('gender, status, is_verified, membership_paid, membership_expires_at, review_pending, review_pending_ride_id, user_status, suspended_until, status_reason, membership_plan, profile_photo_url, car_make, color')
				.eq('id', userId)
				.maybeSingle();

			if (fallback.error) {
				console.error('Profile eligibility load error:', fallback.error);
				isFemaleDriver = false;
				isCurrentUserVerified = false;
				hasActiveMembership = false;
				membershipExpiresAt = null;
				reviewPendingBlocked = false;
				reviewPendingRideId = null;
				return;
			}

			const fallbackProfile = (fallback.data as DriverProfile | null) ?? null;
			await loadVerificationReviewState(userId, fallbackProfile);
			isFemaleDriver = (fallbackProfile?.gender ?? '').toLowerCase() === 'female';
			memberStatus = resolveMemberStatus({
				status: fallbackProfile?.status,
				isVerified: fallbackProfile?.is_verified,
				membershipPaid: fallbackProfile?.membership_paid,
				membershipExpiresAt: fallbackProfile?.membership_expires_at
			});
			isCurrentUserVerified = Boolean(fallbackProfile?.is_verified);
			hasActiveMembership = false;
			membershipExpiresAt = null;
			reviewPendingBlocked = hasPendingReviewBlock({
				status: fallbackProfile?.status,
				isVerified: fallbackProfile?.is_verified,
				membershipPaid: fallbackProfile?.membership_paid,
				membershipExpiresAt: fallbackProfile?.membership_expires_at,
				reviewPending: fallbackProfile?.review_pending
			});
			reviewPendingRideId = fallbackProfile?.review_pending_ride_id ?? null;
			return;
		}

		const profile = (data as DriverProfile | null) ?? null;
		await loadVerificationReviewState(userId, profile);
		const expiresAt = profile?.membership_expires_at ? Date.parse(profile.membership_expires_at) : NaN;
		const isMembershipPaid = Boolean(profile?.membership_paid);
		const isMembershipNotExpired = Number.isFinite(expiresAt) && expiresAt > Date.now();

		isFemaleDriver = (profile?.gender ?? '').toLowerCase() === 'female';
		memberStatus = resolveMemberStatus({
			status: profile?.status,
			isVerified: profile?.is_verified,
			membershipPaid: profile?.membership_paid,
			membershipExpiresAt: profile?.membership_expires_at
		});
		isCurrentUserVerified = Boolean(profile?.is_verified);
		hasActiveMembership = isMembershipPaid && isMembershipNotExpired;
		membershipExpiresAt = profile?.membership_expires_at ?? null;
		reviewPendingBlocked = hasPendingReviewBlock({
			status: profile?.status,
			isVerified: profile?.is_verified,
			membershipPaid: profile?.membership_paid,
			membershipExpiresAt: profile?.membership_expires_at,
			reviewPending: profile?.review_pending
		});
		reviewPendingRideId = profile?.review_pending_ride_id ?? null;
		accountUserStatus = profile?.user_status ?? 'active';
		accountSuspendedUntil = profile?.suspended_until ?? null;
		accountStatusReason = profile?.status_reason ?? null;
	}

	async function loadVerificationReviewState(userId: string, profile: DriverProfile | null) {
		const { data: documents, error } = await supabase
			.from('verification_documents')
			.select('document_type, status, created_at')
			.eq('user_id', userId);

		if (error) {
			console.error('Membership verification documents load error:', error);
			verificationReviewState = 'unknown';
			return;
		}

		const typedDocuments = (documents ?? []) as VerificationDocument[];
		verificationReviewState = isMembershipVerificationReady(profile, typedDocuments)
			? 'ready'
			: areRequiredMembershipDocumentsApproved(profile, typedDocuments)
				? 'approved'
				: 'review';
	}

	async function goToPendingReview() {
		if (!reviewPendingRideId) {
			showArchive = true;
			await tick();
			document.getElementById('archive')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			return;
		}

		const activeRequest = incomingRequests.find(
			(request) =>
				request.status === 'Confirmed' &&
				request.ride.id === reviewPendingRideId &&
				hasRideEnded(request.ride.ride_date)
		);
		if (activeRequest) {
			showArchive = false;
			openReviewFormId = `active-request:${activeRequest.id}`;
			await tick();
			document
				.getElementById(`pending-review-active-request-${activeRequest.id}`)
				?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			return;
		}

		const activeBooking = myBookings.find(
			(booking) =>
				booking.status === 'Confirmed' &&
				booking.ride_id === reviewPendingRideId &&
				Boolean(booking.ride.driver_id) &&
				hasRideEnded(booking.ride.ride_date)
		);
		if (activeBooking) {
			showArchive = false;
			openReviewFormId = `active-booking:${activeBooking.id}`;
			await tick();
			document
				.getElementById(`pending-review-active-booking-${activeBooking.id}`)
				?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			return;
		}

		showArchive = true;
		const archivedRequest = archivedRequests.find(
			(request) => request.status === 'Confirmed' && request.ride.id === reviewPendingRideId
		);
		if (archivedRequest) {
			openReviewFormId = `request:${archivedRequest.id}`;
			await tick();
			document.getElementById(`pending-review-request-${archivedRequest.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			return;
		}

		const archivedBooking = myArchivedBookings.find(
			(booking) => booking.status === 'Confirmed' && booking.ride_id === reviewPendingRideId
		);
		if (archivedBooking) {
			openReviewFormId = `booking:${archivedBooking.id}`;
			await tick();
			document.getElementById(`pending-review-booking-${archivedBooking.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			return;
		}

		await tick();
		document.getElementById('archive')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function goToBecomeAMember() {
		if (memberStatus === 'pending') {
			goto(resolve('/profile#verification-documents'));
		} else {
			goto(resolve('/pricing'));
		}
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
		status: 'Confirmed' | 'Rejected',
		rejection?: { reason: string }
	): Promise<boolean> {
		requestActionBookingId = bookingId;
		requestActionMessage = '';

		const token = await getSessionAccessToken();
		if (!token) {
			requestActionMessage = 'Session expired. Please sign in again.';
			requestActionBookingId = null;
			return false;
		}

		const response = await fetch('/api/bookings', {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			},
			body: JSON.stringify({
				bookingId,
				status,
				rejectionReason: rejection?.reason
			})
		});
		const payload = await response.json().catch(() => null);

		if (!response.ok) {
			console.error('Incoming request update error:', payload?.error);
			requestActionMessage = payload?.error || 'Could not update this booking request. Please try again.';
			requestActionBookingId = null;
			return false;
		}

		incomingRequests = incomingRequests.map((request) =>
			request.id === bookingId ? { ...request, status } : request
		);
		requestActionBookingId = null;
		requestActionMessage =
			status === 'Confirmed'
				? 'Booking request confirmed.'
				: 'Booking request rejected.';
		return true;
	}

	function openBookingRejection(request: DriverBookingRequest) {
		bookingToReject = request;
		rejectionReason = '';
		requestActionMessage = '';
	}

	function closeBookingRejection() {
		if (requestActionBookingId) return;
		bookingToReject = null;
		rejectionReason = '';
	}

	async function submitBookingRejection() {
		if (!bookingToReject) return;
		const reason = rejectionReason.trim();
		if (!reason) {
			requestActionMessage = 'Please explain why you are declining this booking.';
			return;
		}
		const didReject = await updateIncomingRequestStatus(bookingToReject.id, 'Rejected', {
			reason
		});
		if (didReject) {
			bookingToReject = null;
			rejectionReason = '';
		}
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
				{#if accountUserStatus === 'suspended' || accountUserStatus === 'banned'}
				<section class="rounded-lg border {accountUserStatus === 'banned' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'} px-4 py-3">
					<p class="text-sm font-semibold {accountUserStatus === 'banned' ? 'text-red-900' : 'text-amber-900'}">
						{accountUserStatus === 'banned'
							? 'Your account has been banned.'
							: `Your account is suspended${accountSuspendedUntil ? ` until ${new Date(accountSuspendedUntil).toLocaleDateString()}` : ''}.`}
					</p>
					{#if accountStatusReason}
						<p class="text-sm mt-1 {accountUserStatus === 'banned' ? 'text-red-800' : 'text-amber-800'}">Reason: {accountStatusReason}</p>
					{/if}
					<p class="text-sm mt-1 {accountUserStatus === 'banned' ? 'text-red-800' : 'text-amber-800'}">You cannot publish or book rides while this status is active. Contact support if you believe this is a mistake.</p>
				</section>
			{/if}
				{#if reviewPendingBlocked}
				<section class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<p class="text-sm text-amber-900">You have a pending review. Please rate your last trip before booking or posting a new ride.</p>
						<button
							type="button"
							on:click={goToPendingReview}
							class="inline-flex items-center rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
						>
							Leave a review
						</button>
					</div>
				</section>
			{/if}


			{#if memberStatus === 'free'}
				<section class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<p class="text-sm text-amber-900">You're on the free plan. Click on "Become a member" to start the verification process..</p>
					</div>
				</section>
			{:else if memberStatus === 'pending'}
				<section class="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-4 shadow-sm">
					<div class="flex items-start gap-3">
						<span class="mt-0.5 text-2xl">✅</span>
						<div>
							{#if verificationReviewState === 'ready'}
								<p class="font-semibold text-emerald-900">Your documents have been approved.</p>
								<p class="mt-1 text-sm text-emerald-800">
									Complete your membership payment to activate your verified account.
									<a href={resolve('/pricing')} class="font-semibold underline">Complete payment</a>
								</p>
							{:else if verificationReviewState === 'approved'}
								<p class="font-semibold text-emerald-900">Your documents have been approved.</p>
								<p class="mt-1 text-sm text-emerald-800">
									Add your profile photo to complete the verification requirements.
								</p>
							{:else if verificationReviewState === 'review'}
								<p class="font-semibold text-emerald-900">Your documents are under review.</p>
								<p class="mt-1 text-sm text-emerald-800">
									We'll notify you once your account is verified. This usually takes 24–48 hours.
									In the meantime, you can continue using your free account.
								</p>
							{:else}
								<p class="font-semibold text-emerald-900">Your verification status is unavailable.</p>
								<p class="mt-1 text-sm text-emerald-800">Refresh the page to check your latest document status.</p>
							{/if}
						</div>
					</div>
				</section>
			{/if}
			<p class="text-sm text-emerald-50/90">Connected as {currentUser.email}</p>
			<h1 class="text-3xl font-bold mt-1 tracking-tight">Dashboard</h1>

			<nav class="mt-6 border-t border-white/30 pt-4" aria-label="User dashboard navigation">
					<ul class="flex flex-wrap gap-2">
						<li>
							<a href="#activity-center" class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/90 text-violet-700 text-sm font-semibold hover:bg-white transition-colors">
								Activity
								{#if newActivityCount > 0}
									<span class="inline-flex min-w-5 items-center justify-center rounded-full bg-violet-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
										{newActivityCount}
									</span>
								{/if}
							</a>
						</li>
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
						<button type="button" class="inline-flex items-center px-4 py-2 rounded-full bg-white/90 text-indigo-700 text-sm font-semibold hover:bg-white transition-colors" on:click={() => goto(resolve('/support'))}>
							Contact Support
						</button>
					</li>
					</ul>
					<button type="button" on:click={showArchive ? closeArchive : openArchive} class="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-50/90 hover:text-white">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
						{showArchive
							? 'Back to dashboard'
							: `View archive (${myArchivedRides.length + myArchivedBookings.length + archivedRequests.length + archivedAdminInboxConversations.length})${pendingArchiveReviewsCount > 0 ? ` · ${pendingArchiveReviewsCount} review${pendingArchiveReviewsCount > 1 ? 's' : ''} left` : ''}`}
					</button>
				</nav>

		{#if !showArchive}
			<section id="become-member" class="dashboard-card p-6 scroll-mt-28 {isCurrentUserVerified && hasActiveMembership ? 'opacity-80 border-slate-200' : ''}">
				<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
					<div>
						<h2 class="text-xl font-semibold text-gray-900">Become a member</h2>
						{#if isCurrentUserVerified && hasActiveMembership}
							<p class="text-sm text-gray-600 mt-1">Your profile is verified and your membership is active. You can still review your submitted documents in your profile.</p>
						{:else if isCurrentUserVerified && !hasActiveMembership}
							<p class="text-sm text-gray-600 mt-1">Your profile is verified but your membership is not active. Complete renewal and review your documents to keep full member access.</p>
							{#if membershipExpiresAt}
								<p class="text-xs text-gray-500 mt-1">Last membership expiry: {new Date(membershipExpiresAt).toLocaleDateString()}</p>
							{/if}
						{:else if memberStatus === 'pending' && verificationReviewState === 'ready'}
							<p class="text-sm text-gray-600 mt-1">Your documents are approved. Complete your membership payment to unlock verified member features.</p>
						{:else if memberStatus === 'pending' && verificationReviewState === 'approved'}
							<p class="text-sm text-gray-600 mt-1">Your documents are approved. Add your profile photo to complete verification.</p>
						{:else}
							<p class="text-sm text-gray-600 mt-1">Upload your documents to get validated and unlock verified member features.</p>
						{/if}
					</div>
					{#if isCurrentUserVerified && hasActiveMembership}
						<button
							type="button"
							disabled
							class="inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold text-white cursor-not-allowed"
							style="background-color: #9CA3AF;"
						>
							Already verified
						</button>
					{:else if memberStatus === 'pending'}
						{#if verificationReviewState === 'ready'}
							<a
								href={resolve('/pricing')}
								class="inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold text-white hover:opacity-90 transition cursor-pointer"
								style="background-color: #F59E0B;"
							>
								Complete payment
							</a>
						{:else}
							<button
								type="button"
								on:click={goToBecomeAMember}
								class="inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold text-white hover:opacity-90 transition cursor-pointer"
								style="background-color: #F59E0B;"
							>
								View my documents
							</button>
						{/if}
					{:else}
						<button
							type="button"
							on:click={goToBecomeAMember}
							class="inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold text-white hover:opacity-90 transition cursor-pointer"
							style="background-color: #00B050;"
						>
							{isCurrentUserVerified ? 'Renew membership' : 'Become a member'}
						</button>
					{/if}
				</div>
			</section>

			<section id="activity-center" class="dashboard-card p-6 scroll-mt-28">
				<div class="flex items-center justify-between gap-3 mb-3">
					<div>
						<h2 class="text-xl font-semibold text-gray-900">Activity center</h2>
						<p class="text-sm text-gray-500">Everything stays in-app. Check here to follow recent activity.</p>
					</div>
					<button
						type="button"
						on:click={markActivityAsSeen}
						disabled={activityFeed.length === 0 || newActivityCount === 0}
						class="px-3 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
					>
						Mark as seen
					</button>
				</div>

				{#if newActivityCount > 0}
					<p class="mb-3 inline-flex items-center rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
						You have {newActivityCount} new activity update{newActivityCount > 1 ? 's' : ''}. Click an item to review details.
					</p>
				{/if}

				{#if visibleActivityFeed.length === 0}
					<p class="text-sm text-gray-500">No new activity. Seen updates remain available in their sections.</p>
				{:else}
					<div class="space-y-2">
						{#each visibleActivityFeed as item (item.id)}
							<a
								href={resolve(item.sectionHref)}
								on:click={(event) => handleActivityClick(item, event)}
								class="surface-card flex items-start justify-between gap-3 p-3 hover:border-emerald-300 transition-colors"
							>
								<div>
									<div class="flex items-center gap-2">
										<p class="text-sm font-semibold text-gray-900">{item.title}</p>
										<span class={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${activityBadgeClass(item.type)}`}>
											{activityTypeLabel(item.type)}
										</span>
										{#if Date.parse(item.createdAtIso) > activitySeenAt}
											<span class="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">New</span>
										{/if}
									</div>
									<p class="text-sm text-gray-600 mt-1">{item.details}</p>
								</div>
								<p class="text-xs text-gray-400 whitespace-nowrap">{new Date(item.createdAtIso).toLocaleString()}</p>
							</a>
						{/each}
					</div>
				{/if}
			</section>

			<section id="admin-messages" class="dashboard-card p-6 scroll-mt-28">
				<div class="flex items-center justify-between gap-3 mb-3">
					<div>
						<h2 class="text-xl font-semibold text-gray-900">Admin messages</h2>
						<p class="text-sm text-gray-500">Private moderation and support messages visible only to your account.</p>
					</div>
					<button
						type="button"
						on:click={async () => {
							await loadAdminInboxMessages();
							await loadMemberNotifications();
						}}
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
				{:else}
					{#if activeAdminInboxConversations.length === 0}
						<p class="text-sm text-gray-500">No active admin messages for now.</p>
					{:else}
						<div class="space-y-4">
							{#each activeAdminInboxConversations as conversation (conversation.key)}
							<article class="surface-card p-4">
								<div class="flex flex-wrap items-center justify-between gap-2">
									<p class="text-sm font-semibold text-gray-900">{conversation.subject}</p>
									{#if conversation.ticketId}
										<span class={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
											conversation.status === 'open'
												? 'bg-yellow-100 text-yellow-700'
												: conversation.status === 'in_progress'
													? 'bg-blue-100 text-blue-700'
													: conversation.status === 'resolved'
														? 'bg-green-100 text-green-700'
														: 'bg-gray-100 text-gray-700'
										}`}>{conversation.status.replace('_', ' ')}</span>
									{/if}
								</div>

								{#if conversation.ticketId}
									<div class="mt-4 max-h-96 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3">
										{#each conversation.messages as msg (msg.id)}
											<div class={`flex ${msg.senderRole === 'user' ? 'justify-end' : 'justify-start'}`}>
												<div class={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
													msg.senderRole === 'user'
														? 'rounded-br-sm bg-indigo-600 text-white'
														: 'rounded-bl-sm border border-slate-200 bg-white text-gray-800'
												}`}>
													<p class="mb-1 text-[11px] font-semibold opacity-75">{msg.senderRole === 'admin' ? 'Hizli Support' : 'You'}</p>
													<p class="whitespace-pre-wrap text-sm">{msg.message}</p>
													<div class="mt-1 flex items-center justify-between gap-4">
														<p class="text-[10px] opacity-70">{new Date(msg.createdAt).toLocaleString()}</p>
														<button
															type="button"
															on:click={() => deleteAdminInboxMessage(msg.id)}
															disabled={deletingAdminMessageId === msg.id}
															class="text-[10px] underline opacity-70 hover:opacity-100 disabled:opacity-40"
														>
															{deletingAdminMessageId === msg.id ? 'Deleting...' : 'Delete'}
														</button>
													</div>
												</div>
											</div>
										{/each}
									</div>

									{#if isReplyBlocked(conversation.status)}
										<p class="mt-3 text-xs text-gray-500">This conversation is {conversation.status}; replies are disabled.</p>
									{:else}
										<div class="mt-3 space-y-2">
											<label class="text-xs font-medium text-gray-600" for={`reply-${conversation.ticketId}`}>Reply</label>
											<textarea
												id={`reply-${conversation.ticketId}`}
												rows="3"
												class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
												placeholder="Write your reply"
												bind:value={supportReplyDrafts[conversation.ticketId]}
											></textarea>
											<div class="flex justify-end">
												<button
													type="button"
													on:click={() => sendSupportReply(conversation.ticketId, conversation.status)}
													disabled={supportReplySendingTicketId === conversation.ticketId}
													class="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60"
												>
													{supportReplySendingTicketId === conversation.ticketId ? 'Sending...' : 'Send reply'}
												</button>
											</div>
										</div>
									{/if}
								{:else}
									{#if conversation.notificationType === 'review_rejected'}
										<div class="mt-2 space-y-2 text-sm text-gray-700">
											<p>Your review was not approved. Please update it and submit it again.</p>
											{#if getReviewRejectionNote(conversation.messages[0].message)}
												<p><strong>Admin note:</strong> {getReviewRejectionNote(conversation.messages[0].message)}</p>
											{/if}
											<a href={resolve('/dashboard#archive')} class="inline-flex font-medium text-indigo-700 underline hover:text-indigo-900">Update my review</a>
										</div>
									{:else}
										<p class="mt-2 whitespace-pre-wrap text-sm text-gray-700">{conversation.messages[0].message}</p>
										<p class="mt-2 text-xs text-gray-500">This is an informational notification.</p>
									{/if}
									<div class="mt-2 flex items-center justify-between gap-2">
										<p class="text-xs text-gray-400">{new Date(conversation.latestAt).toLocaleString()}</p>
										<button
											type="button"
											on:click={() => deleteAdminInboxMessage(conversation.messages[0].id)}
											disabled={deletingAdminMessageId === conversation.messages[0].id}
											class="px-2 py-1 rounded-md border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
										>
											{deletingAdminMessageId === conversation.messages[0].id ? 'Deleting...' : 'Delete'}
										</button>
									</div>
								{/if}
							</article>
							{/each}
						</div>
					{/if}

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
							<article id={`pending-review-active-request-${request.id}`} class="surface-card p-4 flex flex-wrap flex-col md:flex-row md:items-center md:justify-between gap-3">
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
										{#if request.passenger.public_id}
											<a
												href={resolve(`/profile/public?pid=${request.passenger.public_id}`)}
												class="inline-flex items-center font-medium text-green-700 hover:text-green-800"
											>
												View public profile
											</a>
										{:else}
											<span class="inline-flex items-center font-medium text-gray-500">Public profile unavailable</span>
										{/if}
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
											on:click={() => openBookingRejection(request)}
											disabled={requestActionBookingId === request.id}
											class="px-3 py-2 rounded-md border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-60"
										>
											Reject
										</button>
									{/if}
									{#if request.status === 'Confirmed' && hasRideEnded(request.ride.ride_date) && canUseVerifiedFeatures(memberStatus)}
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
								{#if request.status === 'Confirmed' && hasRideEnded(request.ride.ride_date) && canUseVerifiedFeatures(memberStatus) && openReviewFormId === `active-request:${request.id}`}
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
							<article id={`pending-review-active-booking-${booking.id}`} class="surface-card p-4 flex flex-wrap flex-col md:flex-row md:items-center md:justify-between gap-3">
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
								{#if booking.status === 'Confirmed' && hasRideEnded(booking.ride.ride_date) && booking.ride.driver_id && canUseVerifiedFeatures(memberStatus)}
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
							{#if booking.status === 'Confirmed' && hasRideEnded(booking.ride.ride_date) && booking.ride.driver_id && canUseVerifiedFeatures(memberStatus) && openReviewFormId === `active-booking:${booking.id}`}
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

			{#if memberStatus === 'verified' && currentUser}
				<section class="rounded-lg border border-slate-200 bg-white px-4 py-4">
					<ReviewsSection userId={currentUser.id} />
				</section>
			{/if}
			{/if}

		{#if showArchive}
		<section id="archive" class="dashboard-card p-6">
			<div class="flex items-center justify-between">
				<h2 class="text-xl font-semibold text-gray-900 flex items-center gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
					Archive
					<span class="text-sm font-normal text-gray-400">({myArchivedRides.length + myArchivedBookings.length + archivedRequests.length + archivedAdminInboxConversations.length})</span>
					{#if pendingArchiveReviewsCount > 0}
						<span class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
							{pendingArchiveReviewsCount} review{pendingArchiveReviewsCount > 1 ? 's' : ''} left to post
						</span>
					{/if}
				</h2>
			</div>

			{#if myArchivedRides.length === 0 && myArchivedBookings.length === 0 && archivedRequests.length === 0 && archivedAdminInboxConversations.length === 0}
				<p class="mt-4 text-sm text-gray-500">
					No archived items yet. Rides appear here 24 hours after they end, and conversations after you sign out.
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
								<article id={`pending-review-request-${request.id}`} class="subtle-card p-4 opacity-75">
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
											{#if request.passenger.public_id}
												<a
													href={resolve(`/profile/public?pid=${request.passenger.public_id}`)}
													class="text-sm font-medium text-green-700 hover:text-green-800"
												>
													View passenger profile
												</a>
											{:else}
												<span class="text-sm font-medium text-gray-500">Passenger profile unavailable</span>
											{/if}
											{#if request.status === 'Confirmed' && canUseVerifiedFeatures(memberStatus)}
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
										{#if request.status === 'Confirmed' && canUseVerifiedFeatures(memberStatus) && openReviewFormId === `request:${request.id}`}
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
								<article id={`pending-review-booking-${booking.id}`} class="subtle-card p-4 opacity-75">
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
												{#if booking.ride.driver_public_id}
													<a
														href={resolve(`/profile/public?pid=${booking.ride.driver_public_id}`)}
														class="text-sm font-medium text-green-700 hover:text-green-800"
													>
														View driver profile
													</a>
												{:else}
													<span class="text-sm font-medium text-gray-500">Driver profile unavailable</span>
												{/if}
											{/if}
											{#if booking.status === 'Confirmed' && booking.ride.driver_id && canUseVerifiedFeatures(memberStatus)}
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
										{#if booking.status === 'Confirmed' && booking.ride.driver_id && canUseVerifiedFeatures(memberStatus) && openReviewFormId === `booking:${booking.id}`}
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

			{#if archivedAdminInboxConversations.length > 0}
				<div class="mt-5">
					<h3 class="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Conversations</h3>
					<p class="mb-3 text-xs text-gray-500">Conversations are retained for 30 days after sign-out.</p>
					<div class="space-y-3">
						{#each archivedAdminInboxConversations as conversation (conversation.key)}
							<article class="subtle-card p-4 opacity-90">
								<div class="flex flex-wrap items-center justify-between gap-2">
									<h4 class="text-base font-semibold text-gray-700">{conversation.subject}</h4>
									<p class="text-xs text-gray-500">
										Archived {conversation.archivedAt ? new Date(conversation.archivedAt).toLocaleDateString() : ''}
									</p>
								</div>
								<div class="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
									{#each conversation.messages as msg (msg.id)}
										<div class={`flex ${msg.senderRole === 'user' ? 'justify-end' : 'justify-start'}`}>
											<div class={`max-w-[85%] rounded-2xl px-3 py-2 ${
												msg.senderRole === 'user'
													? 'rounded-br-sm bg-indigo-600 text-white'
													: 'rounded-bl-sm border border-slate-200 bg-white text-gray-800'
											}`}>
												<p class="mb-1 text-[11px] font-semibold opacity-75">{msg.senderRole === 'admin' ? 'Hizli Support' : 'You'}</p>
												<p class="whitespace-pre-wrap text-sm">{msg.message}</p>
												<p class="mt-1 text-[10px] opacity-70">{new Date(msg.createdAt).toLocaleString()}</p>
											</div>
										</div>
									{/each}
								</div>
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

{#if bookingToReject}
	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
		on:click|self={closeBookingRejection}
	>
		<form
			class="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
			on:submit|preventDefault={submitBookingRejection}
		>
			<h2 class="text-lg font-semibold text-gray-900">Decline booking request</h2>
			<p class="mt-1 text-sm text-gray-600">
				Please explain briefly why you are declining this booking. Your explanation will be shared with the passenger.
			</p>

			<label for="booking-rejection-reason" class="mt-4 block text-sm font-medium text-gray-800">
				Reason for declining <span class="text-red-600" aria-hidden="true">*</span>
			</label>
			<textarea
				id="booking-rejection-reason"
				bind:value={rejectionReason}
				maxlength="500"
				rows="3"
				required
				placeholder="Write a brief explanation for the passenger"
				disabled={requestActionBookingId === bookingToReject.id}
				class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50"
			></textarea>
			<p class="mt-1 text-right text-xs text-gray-500">{rejectionReason.length}/500</p>

			{#if requestActionMessage}
				<p class="mt-3 text-sm text-red-600">{requestActionMessage}</p>
			{/if}

			<div class="mt-5 flex justify-end gap-3">
				<button
					type="button"
					on:click={closeBookingRejection}
					disabled={requestActionBookingId === bookingToReject.id}
					class="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={requestActionBookingId === bookingToReject.id}
					class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
				>
					{requestActionBookingId === bookingToReject.id ? 'Declining...' : 'Confirm decline'}
				</button>
			</div>
		</form>
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