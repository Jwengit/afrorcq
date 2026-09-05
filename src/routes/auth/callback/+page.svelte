<script lang="ts">
	import { supabase } from '$lib/supabaseClient';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	onMount(async () => {
		const params = new URLSearchParams(window.location.search);
		const oauthError = params.get('error_description') || params.get('error');

		if (oauthError) {
			goto(resolve('/auth/signup?googleError=1'));
			return;
		}

		const { data, error } = await supabase.auth.getSession();

		if (error) {
			console.error('Error getting session:', error);
			goto(resolve('/auth/login'));
		} else if (data.session) {
			// Check if user is new (created within last 5 minutes)
			const user = data.session.user;

			if (!user.email) {
				await supabase.auth.signOut();
				goto(resolve('/auth/signup?googleError=1'));
				return;
			}

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

			// Backend endpoint is idempotent and creates the internal welcome message only once.
			try {
				await fetch('/api/welcome', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						userId: user.id,
						email: user.email,
						name: user.user_metadata?.full_name || ''
					})
				});
			} catch (welcomeErr) {
				console.error('Error creating welcome message:', welcomeErr);
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