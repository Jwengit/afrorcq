<script lang="ts">
	import { user } from '$lib/authStore';
	import { archiveResolvedMemberConversations } from '$lib/memberConversations';
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';
	import { hasPendingReviewBlock } from '$lib/membershipAccess';

	let isMenuOpen = false;
	let currentUser: any = null;
	let hasAdminAccess = false;
	let profilePhotoUrl: string | null = null;
	let reviewPendingBlocked = false;

	async function updateAdminAccess(userId: string, email?: string | null) {
		if (!userId) {
			hasAdminAccess = false;
			profilePhotoUrl = null;
			reviewPendingBlocked = false;
			return;
		}

		const isTargetEmail = (email ?? '').toLowerCase() === 'hizli.carpooling@gmail.com';
		const { data: profile, error } = await supabase
			.from('profiles')
			.select(
				'is_admin, profile_photo_url, status, is_verified, membership_paid, membership_expires_at, review_pending'
			)
			.eq('id', userId)
			.single();

		hasAdminAccess = isTargetEmail || (!error && Boolean(profile?.is_admin));
		profilePhotoUrl = !error ? (profile?.profile_photo_url ?? null) : null;
		reviewPendingBlocked = !error
			? hasPendingReviewBlock({
					status: profile?.status,
					isVerified: profile?.is_verified,
					membershipPaid: profile?.membership_paid,
					membershipExpiresAt: profile?.membership_expires_at,
					reviewPending: profile?.review_pending
				})
			: false;
	}

	// Subscribe to user store
	user.subscribe((u) => {
		currentUser = u;
		if (u?.id) {
			updateAdminAccess(u.id, u.email);
		} else {
			hasAdminAccess = false;
			profilePhotoUrl = null;
			reviewPendingBlocked = false;
		}
	});

	function toggleMenu() {
		isMenuOpen = !isMenuOpen;
	}

	function handlePublishClick() {
		if (!currentUser) {
			goto('/auth/login');
			return;
		}

		if (reviewPendingBlocked) {
			goto('/dashboard#archive');
			return;
		}
		goto('/publish-ride');
	}

	async function signOut() {
		const archiveResult = await archiveResolvedMemberConversations();
		if (!archiveResult.success) {
			console.error(
				'Unable to archive resolved conversations before sign-out:',
				archiveResult.error
			);
			alert('We could not archive your resolved conversations, but you will still be signed out.');
		}
		await supabase.auth.signOut();
		goto('/');
	}
</script>

<!-- Navbar -->
<nav class="sticky top-0 z-50 bg-white shadow-sm">
	<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="flex h-24 items-center justify-between">
			<div class="flex items-center">
				<a
					href="/"
					class="flex items-center gap-3 font-bold"
					style="color: #2BB573; margin-left: -1cm;"
				>
					<!-- Logo: Assurez-vous d'avoir un fichier "Logo sans phrase.png" dans le dossier 'static' -->
					<img src="/Logo sans phrase.png" alt="Hizli Logo" class="h-20 w-auto object-contain" />
				</a>
			</div>

			<!-- Desktop Menu -->
			<div class="hidden items-center space-x-8 lg:flex">
				<button
					type="button"
					on:click={handlePublishClick}
					disabled={reviewPendingBlocked}
					class="cursor-pointer text-left font-medium transition"
					style="color: #2BB573;"
					title={reviewPendingBlocked
						? 'You have a pending review. Please rate your last trip before posting a new ride.'
						: undefined}
				>
					Publish a ride
				</button>

				{#if currentUser}
					<!-- User is logged in -->
					<a href="/dashboard" class="text-gray-600 transition-colors hover:text-gray-900">
						Dashboard
					</a>
					<a
						href="/profile"
						class="flex items-center gap-2 text-gray-600 transition-colors hover:text-gray-900"
					>
						{#if profilePhotoUrl}
							<img
								src={profilePhotoUrl}
								alt="Profile"
								class="h-9 w-9 rounded-full border border-gray-200 object-cover"
							/>
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
								<circle cx="12" cy="7" r="4" />
							</svg>
						{/if}
						<span class="sr-only">Profile</span>
					</a>
					{#if hasAdminAccess}
						<a href="/admin" class="text-gray-600 transition-colors hover:text-gray-900">
							Acces admin
						</a>
					{/if}
					<button
						on:click={signOut}
						class="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:text-gray-900"
					>
						Sign Out
					</button>
				{:else}
					<!-- User is not logged in -->
					<a
						href="/auth/login"
						class="flex items-center gap-2 rounded-full p-2 transition-colors hover:bg-gray-100"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="text-gray-600"
						>
							<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
							<circle cx="12" cy="7" r="4" />
						</svg>
						Login
					</a>
				{/if}
			</div>

			<!-- Mobile Menu Button -->
			<div class="flex items-center lg:hidden">
				<button on:click={toggleMenu} class="text-gray-600 hover:text-gray-900 focus:outline-none">
					<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						{#if isMenuOpen}
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						{:else}
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 6h16M4 12h16M4 18h16"
							/>
						{/if}
					</svg>
				</button>
			</div>
		</div>
	</div>

	<!-- Mobile Menu -->
	{#if isMenuOpen}
		<div class="border-t bg-white lg:hidden">
			<div class="space-y-1 px-2 pt-2 pb-3 sm:px-3">
				<button
					type="button"
					on:click={handlePublishClick}
					disabled={reviewPendingBlocked}
					class="block w-full cursor-pointer rounded-md px-3 py-2 text-left hover:bg-gray-50"
					title={reviewPendingBlocked
						? 'You have a pending review. Please rate your last trip before posting a new ride.'
						: undefined}
					style="color: #2BB573;"
				>
					Publish a ride
				</button>

				{#if currentUser}
					<!-- User is logged in -->
					<a
						href="/dashboard"
						class="hover:text-primary block rounded-md px-3 py-2 text-gray-600 hover:bg-gray-50"
						>Dashboard</a
					>
					<a
						href="/profile"
						class="hover:text-primary flex items-center gap-2 rounded-md px-3 py-2 text-gray-600 hover:bg-gray-50"
					>
						{#if profilePhotoUrl}
							<img
								src={profilePhotoUrl}
								alt="Profile"
								class="h-7 w-7 rounded-full border border-gray-200 object-cover"
							/>
						{/if}
						<span>Profile</span>
					</a>
					{#if hasAdminAccess}
						<a
							href="/admin"
							class="hover:text-primary block rounded-md px-3 py-2 text-gray-600 hover:bg-gray-50"
							>Acces admin</a
						>
					{/if}
					<button
						on:click={signOut}
						class="hover:text-primary block w-full cursor-pointer rounded-md px-3 py-2 text-left text-gray-600 hover:bg-gray-50"
					>
						Sign Out
					</button>
				{:else}
					<!-- User is not logged in -->
					<a
						href="/auth/login"
						class="hover:text-primary block rounded-md px-3 py-2 text-gray-600 hover:bg-gray-50"
						>Login / Sign Up</a
					>
				{/if}
			</div>
		</div>
	{/if}
</nav>
