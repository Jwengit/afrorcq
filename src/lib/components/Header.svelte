<script lang="ts">
	import { user } from '$lib/authStore';
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';

	let isMenuOpen = false;
	let currentUser: any = null;

	// Subscribe to user store
	user.subscribe((u) => {
		currentUser = u;
	});

	function toggleMenu() {
		isMenuOpen = !isMenuOpen;
	}

	function handlePublishClick() {
		if (!currentUser) {
			goto('/auth/login');
			return;
		}
		goto('/publish-ride');
	}

	async function signOut() {
		await supabase.auth.signOut();
		goto('/');
	}
</script>

<!-- Navbar -->
<nav class="bg-white shadow-sm sticky top-0 z-50">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		<div class="flex items-center justify-between h-24">
			<div class="flex items-center">
				<a href="/" class="flex items-center gap-3 font-bold" style="color: #2BB573; margin-left: -1cm;">
					<!-- Logo: Assurez-vous d'avoir un fichier "Logo sans phrase.png" dans le dossier 'static' -->
					<img src="/Logo sans phrase.png" alt="Hizli Logo" class="h-20 w-auto object-contain" />
				</a>
			</div>

			<!-- Desktop Menu -->
			<div class="hidden md:flex items-center space-x-8">
				<a href="/search" class="transition font-medium text-gray-600 hover:text-gray-900">
					Find a ride
				</a>
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
					<a href="/dashboard" class="text-gray-600 hover:text-gray-900 transition-colors">
						Dashboard
					</a>
					<a href="/profile" class="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
							<circle cx="12" cy="7" r="4"/>
						</svg>
						Profile
					</a>
					<button
						on:click={signOut}
						class="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors cursor-pointer"
					>
						Sign Out
					</button>
				{:else}
					<!-- User is not logged in -->
					<a href="/auth/login" class="flex items-center gap-2 p-2 rounded-full hover:bg-gray-100 transition-colors">
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-600">
							<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
							<circle cx="12" cy="7" r="4"/>
						</svg>
						Login
					</a>
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

				<a
					href="/search"
					class="block px-3 py-2 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-md"
					>Find a ride</a
				>

				{#if currentUser}
					<!-- User is logged in -->
					<a
						href="/dashboard"
						class="block px-3 py-2 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-md"
						>Dashboard</a
					>
					<a
						href="/profile"
						class="block px-3 py-2 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-md"
						>Profile</a
					>
					<button
						on:click={signOut}
						class="block w-full text-left px-3 py-2 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-md cursor-pointer"
					>
						Sign Out
					</button>
				{:else}
					<!-- User is not logged in -->
					<a
						href="/auth/login"
						class="block px-3 py-2 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-md"
						>Login / Sign Up</a
					>
				{/if}
			</div>
		</div>
	{/if}
</nav>