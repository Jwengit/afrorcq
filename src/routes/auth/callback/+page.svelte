<script lang="ts">
	import { supabase } from '$lib/supabaseClient';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	let isRecovery = false;
	let newPassword = '';
	let confirmPassword = '';
	let updatingPassword = false;
	let passwordUpdateError = '';
	let passwordUpdateSuccess = false;

	function linkIsPasswordRecovery(): boolean {
		const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
		const searchParams = new URLSearchParams(window.location.search);
		return hashParams.get('type') === 'recovery' || searchParams.get('type') === 'recovery';
	}

	async function submitNewPassword() {
		passwordUpdateError = '';

		if (!newPassword || newPassword.length < 6) {
			passwordUpdateError = 'Password must be at least 6 characters.';
			return;
		}

		if (newPassword !== confirmPassword) {
			passwordUpdateError = 'Passwords do not match.';
			return;
		}

		updatingPassword = true;

		try {
			const { error } = await supabase.auth.updateUser({ password: newPassword });

			if (error) {
				passwordUpdateError = error.message;
				return;
			}

			passwordUpdateSuccess = true;
			setTimeout(() => goto(resolve('/profile')), 1500);
		} catch (err) {
			passwordUpdateError = err instanceof Error ? err.message : 'Unable to update password. Please try again.';
		} finally {
			updatingPassword = false;
		}
	}

	onMount(async () => {
		// Read this FIRST, synchronously, before any await. Supabase-js can
		// process and strip the recovery info from the URL hash as soon as it
		// detects a session — if we check after an `await`, we're often too
		// late and the info is already gone.
		const cameFromRecoveryLink = linkIsPasswordRecovery();

		// Belt-and-suspenders: Supabase also fires a dedicated PASSWORD_RECOVERY
		// event when a session comes from a recovery link. Registering this
		// listener synchronously, before any await, means we won't miss it
		// even if the URL was already stripped by the time we read it above.
		const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
			if (event === 'PASSWORD_RECOVERY') {
				isRecovery = true;
			}
		});

		const params = new URLSearchParams(window.location.search);
		const oauthError = params.get('error_description') || params.get('error');

		if (oauthError) {
			authListener.subscription.unsubscribe();
			goto(resolve('/auth/signup?googleError=1'));
			return;
		}

		const { data, error } = await supabase.auth.getSession();

		if (error) {
			console.error('Error getting session:', error);
			authListener.subscription.unsubscribe();
			goto(resolve('/auth/login'));
			return;
		}

		if (!data.session) {
			authListener.subscription.unsubscribe();
			goto(resolve('/auth/login'));
			return;
		}

		// Password-reset links land here too. Instead of signing the person
		// straight into their profile, ask them to set a new password first.
		if (cameFromRecoveryLink || isRecovery) {
			isRecovery = true;
			authListener.subscription.unsubscribe();
			return;
		}

		authListener.subscription.unsubscribe();

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
				first_name: fallbackFirstName,
				membership_plan: null
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
	});
</script>

{#if isRecovery}
	<div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
		<div class="max-w-md w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-7">
			<h1 class="text-xl font-bold text-slate-900 mb-1">Set a new password</h1>
			<p class="text-slate-600 text-sm mb-5">Choose a new password for your account.</p>

			{#if passwordUpdateSuccess}
				<p class="text-emerald-700 text-sm bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
					Password updated. Redirecting to your profile...
				</p>
			{:else}
				<form on:submit|preventDefault={submitNewPassword} class="space-y-4">
					<div>
						<label for="new_password" class="block text-sm font-medium text-slate-700 mb-1">New password</label>
						<input
							id="new_password"
							type="password"
							autocomplete="new-password"
							bind:value={newPassword}
							class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
							placeholder="At least 6 characters"
						/>
					</div>
					<div>
						<label for="confirm_password" class="block text-sm font-medium text-slate-700 mb-1">Confirm new password</label>
						<input
							id="confirm_password"
							type="password"
							autocomplete="new-password"
							bind:value={confirmPassword}
							class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
							placeholder="Re-enter the new password"
						/>
					</div>

					{#if passwordUpdateError}
						<p class="text-red-600 text-sm">{passwordUpdateError}</p>
					{/if}

					<button
						type="submit"
						disabled={updatingPassword}
						class="w-full px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
					>
						{updatingPassword ? 'Updating...' : 'Update password'}
					</button>
				</form>
			{/if}
		</div>
	</div>
{:else}
	<div class="min-h-screen flex items-center justify-center">
		<div class="text-center">
			<div class="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
			<p class="mt-4 text-gray-600">Completing sign in...</p>
		</div>
	</div>
{/if}