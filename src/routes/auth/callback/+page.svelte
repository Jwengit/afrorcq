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
			// Check if user is new (created within last 5 minutes)
			const user = data.session.user;
			const createdAt = new Date(user.created_at);
			const now = new Date();
			const diffMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);

			if (diffMinutes < 5) {
				// Send welcome email for new user
				try {
					await fetch('/api/welcome', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ email: user.email, name: user.user_metadata?.full_name || '' })
					});
				} catch (emailErr) {
					console.error('Error sending welcome email:', emailErr);
				}
			}
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