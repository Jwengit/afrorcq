<script lang="ts">
	import { user } from '$lib/authStore';
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	let isMenuOpen = false;
	let currentUser: any = null;
	let hasAdminAccess = false;
	let profilePhotoUrl: string | null = null;
	type HeaderRoute = '/' | '/auth/login' | '/publish-ride' | '/dashboard' | '/profile' | '/admin';

	async function updateAdminAccess(userId: string, email?: string | null) {
		if (!userId) {
			hasAdminAccess = false;
			profilePhotoUrl = null;
			return;
		}

		const isTargetEmail = (email ?? '').toLowerCase() === 'hizli.carpooling@gmail.com';
		const { data: profile, error } = await supabase
			.from('profiles')
			.select('is_admin, profile_photo_url')
			.eq('id', userId)
			.single();

		hasAdminAccess = isTargetEmail || (!error && Boolean(profile?.is_admin));
		profilePhotoUrl = !error ? (profile?.profile_photo_url ?? null) : null;
	}

	// Subscribe to user store
	user.subscribe((u) => {
		currentUser = u;
		if (u?.id) {
			updateAdminAccess(u.id, u.email);
		} else {
			hasAdminAccess = false;
			profilePhotoUrl = null;
		}
	});

	function toggleMenu() {
		isMenuOpen = !isMenuOpen;
	}

	function navigateTo(path: HeaderRoute) {
		isMenuOpen = false;
		goto(resolve(path));
	}

	function handlePublishClick() {
		if (!currentUser) {
			navigateTo('/auth/login');
			return;
		}
		navigateTo('/publish-ride');
	}

	async function signOut() {
		await supabase.auth.signOut();
		navigateTo('/');
	}

</script>

<!-- Navbar -->
<nav class="fixed inset-x-0 top-0 bg-white shadow-sm" style="z-index: 2147483647; pointer-events: auto; isolation: isolate;">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		<div class="flex items-center justify-between h-24">
			<div class="flex items-center">
				<button type="button" on:click={() => navigateTo('/')} class="flex items-center gap-3 font-bold cursor-pointer" style="color: #2BB573; margin-left: -1cm;">
					<!-- Logo: Assurez-vous d'avoir un fichier "Logo sans phrase.png" dans le dossier 'static' -->
					<img src="/Logo sans phrase.png" alt="Hizli Logo" class="h-20 w-auto object-contain" />
				</button>
			</div>

			<!-- Desktop Menu -->
			<div class="hidden md:flex items-center space-x-8">
				<button
					type="button"
					on:click={handlePublishClick}
					class="transition font-medium text-left cursor-pointer"
					style="color: #2BB573;"
				>
					Publish a ride
				</button>

				{#if currentUser}
					<!-- User is logged in -->
					<button type="button" on:click={() => navigateTo('/dashboard')} class="text-gray-600 hover:text-gray-900 transition-colors cursor-pointer">
						Dashboard
					</button>
					<button type="button" on:click={() => navigateTo('/profile')} class="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors cursor-pointer">
						{#if profilePhotoUrl}
							<img
								src={profilePhotoUrl}
								alt="Profile"
								class="w-9 h-9 rounded-full object-cover border border-gray-200"
							/>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
								<circle cx="12" cy="7" r="4"/>
							</svg>
						{/if}
						<span class="sr-only">Profile</span>
					</button>
					{#if hasAdminAccess}
						<button
							type="button"
							on:click={() => navigateTo('/admin')}
							class="text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
						>
							Acces admin
						</button>
					{/if}
					<button
						on:click={signOut}
						class="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors cursor-pointer"
					>
						Sign Out
					</button>
				{:else}
					<!-- User is not logged in -->
					<button type="button" on:click={() => navigateTo('/auth/login')} class="flex items-center gap-2 p-2 rounded-full hover:bg-gray-100 transition-colors cursor-pointer">
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-600">
							<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
							<circle cx="12" cy="7" r="4"/>
						</svg>
						Login
					</button>
				{/if}
			</div>

			<!-- Mobile Menu Button -->
			<div class="md:hidden flex items-center">
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
		<div class="md:hidden bg-white border-t">
			<div class="px-2 pt-2 pb-3 space-y-1 sm:px-3">
				<button
					type="button"
					on:click={handlePublishClick}
					class="block w-full text-left px-3 py-2 rounded-md hover:bg-gray-50 cursor-pointer"
					style="color: #2BB573;"
				>
					Publish a ride
				</button>

				{#if currentUser}
					<!-- User is logged in -->
					<button
						type="button"
						on:click={() => navigateTo('/dashboard')}
						class="block w-full text-left px-3 py-2 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-md cursor-pointer"
					>
						Dashboard
					</button>
					<button
						type="button"
						on:click={() => navigateTo('/profile')}
						class="flex w-full items-center gap-2 px-3 py-2 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-md cursor-pointer"
					>
						{#if profilePhotoUrl}
							<img
								src={profilePhotoUrl}
								alt="Profile"
								class="w-7 h-7 rounded-full object-cover border border-gray-200"
							/>
						{/if}
						<span>Profile</span>
					</button>
					{#if hasAdminAccess}
						<button
							type="button"
							on:click={() => navigateTo('/admin')}
							class="block w-full text-left px-3 py-2 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-md cursor-pointer"
						>
							Acces admin
						</button>
					{/if}
					<button
						on:click={signOut}
						class="block w-full text-left px-3 py-2 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-md cursor-pointer"
					>
						Sign Out
					</button>
				{:else}
					<!-- User is not logged in -->
					<button
						type="button"
						on:click={() => navigateTo('/auth/login')}
						class="block w-full text-left px-3 py-2 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-md cursor-pointer"
					>
						Login / Sign Up
					</button>
				{/if}
			</div>
		</div>
	{/if}
</nav>