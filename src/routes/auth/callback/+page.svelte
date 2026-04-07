<script lang="ts">
	import { supabase } from '$lib/supabaseClient';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	onMount(async () => {
		const { data, error } = await supabase.auth.getSession();

		if (error) {
			console.error('Error getting session:', error);
			goto(resolve('/auth/login'));
		} else if (data.session) {
			// Check if user is new (created within last 5 minutes)
			const user = data.session.user;
			const fullName =
				(user.user_metadata?.full_name as string | undefined) ||
				(user.user_metadata?.name as string | undefined) ||
				'';
			const fallbackFirstName =
				fullName.trim().split(' ').filter(Boolean)[0] ||
				user.email?.split('@')[0] ||
				'User';

			// Ensure a profile row exists for OAuth users.
			const { data: existingProfile } = await supabase
				.from('profiles')
				.select('id')
				.eq('id', user.id)
				.maybeSingle();

			if (!existingProfile) {
				const { error: profileInsertError } = await supabase.from('profiles').insert({
					id: user.id,
					first_name: fallbackFirstName
				});

				if (profileInsertError) {
					console.error('Error creating profile on callback:', profileInsertError);
				}
			}

			const createdAt = new Date(user.created_at);
			const now = new Date();
			const diffMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);
			const provider = user.app_metadata?.provider;

			if (diffMinutes < 5 && provider === 'google') {
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
			goto(resolve('/profile'));
		} else {
			goto(resolve('/auth/login'));
		}
	});
</script>

<div class="min-h-screen flex items-center justify-center">
	<div class="text-center">
		<div class="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
		<p class="mt-4 text-gray-600">Completing sign in...</p>
	</div>
</div>