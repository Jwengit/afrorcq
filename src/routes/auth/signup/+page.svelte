<script lang="ts">
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let email = '';
	let password = '';
	let confirmPassword = '';
	let loading = false;
	let error = '';
	let recaptchaToken = '';

	// reCAPTCHA callback
	function onRecaptchaCallback(token: string) {
		recaptchaToken = token;
	}

	function onRecaptchaExpired() {
		recaptchaToken = '';
	}

	onMount(() => {
		// Expose callbacks globally for reCAPTCHA
		(window as any).onRecaptchaCallback = onRecaptchaCallback;
		(window as any).onRecaptchaExpired = onRecaptchaExpired;
	});

	async function signUp() {
		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		if (!recaptchaToken) {
			error = 'Please complete the reCAPTCHA verification';
			return;
		}

		loading = true;
		error = '';

		const { data, error: signUpError } = await supabase.auth.signUp({
			email,
			password,
			options: {
				data: {
					status: 'Unverified',
					recaptcha_token: recaptchaToken
				}
			}
		});

		if (signUpError) {
			error = signUpError.message;
		} else {
			// Redirect to profile after signup
			goto('/profile');
		}

		loading = false;
	}

	async function signUpWithGoogle() {
		try {
			const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
				provider: 'google',
				options: {
					redirectTo: `${window.location.origin}/auth/callback`
				}
			});

			if (oauthError) {
				error = `Google OAuth error: ${oauthError.message}`;
				console.error('Google OAuth error:', oauthError);
			} else if (!data) {
				error = 'Google OAuth is not configured. Please check your Supabase dashboard.';
			}
		} catch (err) {
			error = 'Failed to initialize Google OAuth. Make sure Google provider is enabled in Supabase.';
			console.error('Google OAuth setup error:', err);
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
	<div class="max-w-md w-full space-y-8">
		<div>
			<h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
				Create your account
			</h2>
		</div>
		<form class="mt-8 space-y-6" on:submit|preventDefault={signUp}>
			<div class="rounded-md shadow-sm -space-y-px">
				<div>
					<label for="email" class="sr-only">Email address</label>
					<input
						id="email"
						name="email"
						type="email"
						autocomplete="email"
						required
						class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
						placeholder="Email address"
						bind:value={email}
					/>
				</div>
				<div>
					<label for="password" class="sr-only">Password</label>
					<input
						id="password"
						name="password"
						type="password"
						autocomplete="new-password"
						required
						class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
						placeholder="Password"
						bind:value={password}
					/>
				</div>
				<div>
					<label for="confirm-password" class="sr-only">Confirm Password</label>
					<input
						id="confirm-password"
						name="confirm-password"
						type="password"
						autocomplete="new-password"
						required
						class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
						placeholder="Confirm Password"
						bind:value={confirmPassword}
					/>
				</div>
			</div>

			{#if error}
				<div class="text-red-600 text-sm">{error}</div>
			{/if}

			<!-- reCAPTCHA -->
			<div class="flex justify-center">
				<div class="g-recaptcha" data-sitekey="6LdQr38pAAAAANn80cqDW86qzuS6xbveg0b57scK" data-callback="onRecaptchaCallback" data-expired-callback="onRecaptchaExpired"></div>
			</div>

			<div>
				<button
					type="submit"
					disabled={loading}
					class="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
				>
					{loading ? 'Signing up...' : 'Sign up'}
				</button>
			</div>

			<div class="mt-6">
				<div class="relative">
					<div class="absolute inset-0 flex items-center">
						<div class="w-full border-t border-gray-300" />
					</div>
					<div class="relative flex justify-center text-sm">
						<span class="px-2 bg-gray-50 text-gray-500">Or</span>
					</div>
				</div>

				<div class="mt-6">
					<button
						type="button"
						on:click={signUpWithGoogle}
						class="w-full inline-flex justify-center py-3 px-4 border-2 border-gray-300 rounded-lg shadow-md bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all duration-200 hover:shadow-lg"
					>
						<svg class="w-5 h-5 mr-3" viewBox="0 0 24 24">
							<path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
							<path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
							<path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
							<path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
						</svg>
						Sign up with Google
					</button>
					<p class="mt-2 text-xs text-gray-500 text-center">
						Google OAuth must be configured in Supabase dashboard
					</p>
				</div>
			</div>

			<div class="text-center">
				<a href="/auth/login" class="font-medium text-primary hover:text-green-700 transition-colors">
					Already have an account? Sign in
				</a>
			</div>
		</form>
	</div>
</div>