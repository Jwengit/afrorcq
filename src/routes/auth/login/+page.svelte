<script lang="ts">
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let email = '';
	let password = '';
	let showPassword = false;
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

	async function signIn() {
		if (!recaptchaToken) {
			error = 'Please complete the reCAPTCHA verification';
			return;
		}

		loading = true;
		error = '';

		try {
			const { data, error: signInError } = await supabase.auth.signInWithPassword({
				email,
				password
			});

			console.log('Supabase signIn response:', { data, signInError });

			if (signInError) {
				error = signInError.message;
			} else {
				// Redirect to profile or home
				goto('/profile');
			}
		} catch (err) {
			console.error('Unexpected signIn error:', err);
			error = 'Unexpected error during sign in. Check browser console.';
		} finally {
			loading = false;
		}
	}

	async function signInWithGoogle() {
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

	async function resendConfirmation() {
		if (!email) {
			error = 'Please enter your email address first';
			return;
		}

		try {
			const { error: resendError } = await supabase.auth.resend({
				type: 'signup',
				email
			});

			if (resendError) {
				error = resendError.message;
			} else {
				error = 'Confirmation email resent. Check your inbox.';
			}
		} catch (err) {
			error = 'Failed to resend confirmation email.';
			console.error('Resend error:', err);
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
	<div class="max-w-md w-full space-y-8">
		<div>
			<h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
				Sign in to your account
			</h2>
		</div>
		<form class="mt-8 space-y-6" on:submit|preventDefault={signIn}>
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
					<div class="relative">
						<input
							id="password"
							name="password"
							type={showPassword ? 'text' : 'password'}
							autocomplete="current-password"
							required
							class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
							placeholder="Password"
							bind:value={password}
						/>
						<button
							type="button"
							on:click|preventDefault|stopPropagation={() => {
								showPassword = !showPassword;
								console.log('toggle showPassword', showPassword);
							}}
							on:mousedown|preventDefault
							class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none z-50 pointer-events-auto"
							aria-label={showPassword ? 'Hide password' : 'Show password'}
						>
							{#if showPassword}
								<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M17.94 17.94A10.97 10.97 0 0 1 12 20c-5.52 0-10-3.58-12-8 1.1-2.44 2.8-4.53 4.86-5.94"/>
									<path d="M1 1l22 22"/>
									<path d="M9.53 9.53a3.5 3.5 0 0 0 4.94 4.94"/>
									<path d="M14.12 14.12a3.5 3.5 0 0 0-4.94-4.94"/>
								</svg>
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
									<circle cx="12" cy="12" r="3"/>
								</svg>
							{/if}
						</button>
					</div>
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
					{loading ? 'Signing in...' : 'Sign in'}
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
						on:click={signInWithGoogle}
						class="w-full inline-flex justify-center py-3 px-4 border-2 border-gray-300 rounded-lg shadow-md bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all duration-200 hover:shadow-lg"
					>
						<svg class="w-5 h-5 mr-3" viewBox="0 0 24 24">
						<path fill="#4285F4" d="M21.35 11.1h-9.17v2.92h5.27c-.23 1.3-1.33 3.82-5.27 3.82-3.17 0-5.75-2.62-5.75-5.84s2.58-5.84 5.75-5.84c1.81 0 3.02.78 3.72 1.45l2.55-2.47C17.47 2.3 14.73 1 12 1 6.48 1 2 5.48 2 11s4.48 10 10 10c5.76 0 9.5-4.03 9.5-9.69 0-.65-.07-1.14-.15-1.46z"/>
						<path fill="#34A853" d="M7.58 14.59c-.49-1.44-.49-2.98 0-4.42V7.39H4.01C3.25 8.94 2.86 10.92 2.86 12.97s.39 4.03 1.15 5.58l3.57-3.96z"/>
						<path fill="#FBBC05" d="M12 22c2.7 0 4.95-.89 6.6-2.41l-3.15-2.86c-.88.61-2.01.97-3.45.97-2.64 0-4.88-1.77-5.68-4.14H4.01v2.6C5.64 20.9 8.56 22 12 22z"/>
						<path fill="#EA4335" d="M19.6 6.56l-3.05 2.82c-.86-.82-1.95-1.31-3.12-1.31-1.51 0-2.84.81-3.55 2.02L8.23 8.39C9.41 6.45 10.62 5 12 5c1.5 0 2.78.62 3.65 1.56z"/>
					</svg>
					Sign in with Google
				</button>
				</div>
			</div>

			<div class="text-center">
				<a href="/auth/signup" class="font-medium text-primary hover:text-green-700 transition-colors">
					Don't have an account? Sign up
				</a>
			</div>
		</form>
	</div>
</div>