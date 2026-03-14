<script lang="ts">
	import { supabase } from '$lib/supabaseClient';
	import { user } from '$lib/authStore';
	import { goto } from '$app/navigation';
	import type { User } from '@supabase/supabase-js';

	let currentUser: User | null = null;

	user.subscribe((u) => {
		currentUser = u;
		if (!u) {
			goto('/auth/login');
		}
	});

	async function signOut() {
		await supabase.auth.signOut();
		goto('/auth/login');
	}
</script>

{#if !currentUser}
	<div class="min-h-screen flex items-center justify-center">
		<div class="text-center">
			<div class="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
			<p class="mt-4 text-gray-600">Loading...</p>
		</div>
	</div>
{:else}
	<div class="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
		<div class="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
			<div class="text-center">
				<h1 class="text-2xl font-bold text-gray-900 mb-4">Profile</h1>
				<div class="mb-6">
					<p class="text-gray-600">Welcome back!</p>
					<p class="text-sm text-gray-500 mt-2">Email: {currentUser.email}</p>
					<p class="text-sm text-gray-500">Status: {currentUser.user_metadata?.status || 'Verified'}</p>
				</div>
				<button
					on:click={signOut}
					class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
				>
					Sign Out
				</button>
			</div>
		</div>
	</div>
{/if}