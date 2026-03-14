<script lang="ts">
	import { supabase } from '$lib/supabaseClient';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	onMount(async () => {
		const { data, error } = await supabase.auth.getSession();

		if (error) {
			console.error('Error getting session:', error);
			goto('/auth/login');
		} else if (data.session) {
			goto('/profile');
		} else {
			goto('/auth/login');
		}
	});
</script>

<div class="min-h-screen flex items-center justify-center">
	<div class="text-center">
		<div class="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
		<p class="mt-4 text-gray-600">Completing sign in...</p>
	</div>
</div>