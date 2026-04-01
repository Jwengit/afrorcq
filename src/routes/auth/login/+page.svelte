<script lang="ts">
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { loadRecaptchaScript, type RecaptchaApi } from '$lib/recaptcha';

	let email = '';
	let password = '';
	let showPassword = false;
	let loading = false;
	let error = '';
	let recaptchaToken = '';
	let recaptchaContainer: HTMLDivElement;
	let recaptchaWidgetId: number | null = null;

	const RECAPTCHA_SITE_KEY =
		import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6LdQr38pAAAAANn80cqDW86qzuS6xbveg0b57scK';

	// reCAPTCHA callback
	function onRecaptchaCallback(token: string) {
		recaptchaToken = token;
	}

	function onRecaptchaExpired() {
		recaptchaToken = '';
	}

	function getAuthCallbackUrl() {
		return `${window.location.origin}/auth/callback`;
	}

	function renderRecaptchaWidget(recaptchaApi: RecaptchaApi) {
		if (!recaptchaContainer) {
			return;
		}

		recaptchaApi.ready(() => {
			if (recaptchaWidgetId === null) {
				recaptchaWidgetId = recaptchaApi.render(recaptchaContainer, {
					sitekey: RECAPTCHA_SITE_KEY,
					callback: onRecaptchaCallback,
					'expired-callback': onRecaptchaExpired
				});
			} else {
				recaptchaApi.reset(recaptchaWidgetId);
			}
		});
	}

	onMount(() => {
		if (!RECAPTCHA_SITE_KEY) {
			error = 'reCAPTCHA is not configured. Please contact support.';
			return;
		}

		// Expose callbacks globally for reCAPTCHA
		const recaptchaWindow = window as Window & {
			onRecaptchaCallback?: (token: string) => void;
			onRecaptchaExpired?: () => void;
		};
		recaptchaWindow.onRecaptchaCallback = onRecaptchaCallback;
		recaptchaWindow.onRecaptchaExpired = onRecaptchaExpired;

		loadRecaptchaScript()
			.then((recaptchaApi) => {
				renderRecaptchaWidget(recaptchaApi);
			})
			.catch((err) => {
				console.error('reCAPTCHA load error:', err);
				error = 'Failed to load reCAPTCHA. Please refresh the page.';
			});

		return () => {
			recaptchaToken = '';
		};
	});

	async function signIn() {
		error = '';

		// reCAPTCHA check
		if (!recaptchaToken) {
			error = 'Please complete the reCAPTCHA verification';
			return;
		}

		if (!email || !password) {
			error = 'Please enter email and password';
			return;
		}

		loading = true;

		try {
			// Ensure Supabase client is ready
			const { data: sessionData } = await supabase.auth.getSession();
			console.log('Session check:', sessionData);

			const { data, error: signInError } = await supabase.auth.signInWithPassword({
				email,
				password
			});

			console.log('Supabase signIn response:', { data, signInError });

			if (signInError) {
				error = signInError.message;
			} else if (data?.session) {
				// Redirect to profile or home
				goto(resolve('/profile'));
			} else {
				error = 'Sign in successful but no session created. Please try again.';
			}
		} catch (err) {
			console.error('Unexpected signIn error:', err);
			error = err instanceof Error ? err.message : 'Unexpected error during sign in. Check browser console.';
		} finally {
			loading = false;
		}
	}

	async function signInWithGoogle() {
		try {
			const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
				provider: 'google',
				options: {
					redirectTo: getAuthCallbackUrl()
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
				<div bind:this={recaptchaContainer}></div>
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
						<div class="w-full border-t border-gray-300"></div>
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
						<svg class="w-5 h-5 mr-3" viewBox="0 0 24 24" aria-hidden="true">
							<path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.15 3.57-8.85z"/>
							<path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.87-3a7.17 7.17 0 0 1-10.68-3.77H1.4v3.09A12 12 0 0 0 12 24z"/>
							<path fill="#FBBC05" d="M5.4 14.32a7.2 7.2 0 0 1 0-4.64V6.59H1.4a12 12 0 0 0 0 10.82l4-3.09z"/>
							<path fill="#EA4335" d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.08 15.24 0 12 0 7.3 0 3.2 2.69 1.4 6.59l4 3.09A7.2 7.2 0 0 1 12 4.77z"/>
						</svg>
					Sign in with Google
				</button>
				</div>
			</div>

			<div class="text-center">
				<a href={resolve('/auth/signup')} class="font-medium text-primary hover:text-green-700 transition-colors">
					Don't have an account? Sign up
				</a>
			</div>
		</form>
	</div>
</div>