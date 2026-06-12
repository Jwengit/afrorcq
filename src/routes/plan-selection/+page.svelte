<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { user as userStore } from '$lib/authStore';
	import { supabase } from '$lib/supabaseClient';

	interface Plan {
		code: string;
		name: string;
		price: number;
		trialDays: number;
		features: string[];
	}

	let plans: Plan[] = [];
	let isVerified = false;
	let plansLoading = true;
	let selectedPlan: string | null = null;
	let checkingOut = false;
	let error = '';

	onMount(async () => {
		if (!$userStore) {
			await goto('/auth/login');
			return;
		}

		// Check if user is verified
		const { data: profile } = await supabase
			.from('profiles')
			.select('is_verified, verification_status')
			.eq('id', $userStore.id)
			.maybeSingle();

		isVerified = profile?.is_verified === true || profile?.verification_status === 'verified';
		if (!isVerified) {
			await goto('/profile');
			return;
		}

		// Load plans
		try {
			const response = await fetch('/api/plans', {
				headers: {
					Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`
				}
			});

			if (!response.ok) {
				error = 'Failed to load plans';
				return;
			}

			const data = await response.json();
			plans = data.plans || [];
		} catch (err) {
			error = 'Failed to load plans';
		} finally {
			plansLoading = false;
		}
	});

	async function selectPlan(planCode: string) {
		selectedPlan = planCode;
		checkingOut = true;
		error = '';

		try {
			const session = await supabase.auth.getSession();
			const token = session.data.session?.access_token;

			if (!token) {
				error = 'Authentication error';
				return;
			}

			const response = await fetch('/api/subscriptions/checkout-session', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ planCode })
			});

			if (!response.ok) {
				const data = await response.json();
				error = data.error || 'Failed to create checkout session';
				return;
			}

			const data = await response.json();
			if (!data.checkoutUrl) {
				error = 'Failed to create checkout session';
				return;
			}

			// Redirect to Stripe Checkout
			window.location.href = data.checkoutUrl;
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred';
		} finally {
			checkingOut = false;
		}
	}
</script>

<div class="min-h-screen bg-linear-to-b from-slate-50 to-slate-100 py-12 px-4 sm:px-6 lg:px-8">
	<div class="max-w-6xl mx-auto">
		<!-- Header -->
		<div class="text-center mb-12">
			<h1 class="text-4xl font-bold text-slate-900 mb-4">Choose Your Plan</h1>
			<p class="text-xl text-slate-600">
				Congratulations on verifying your account! Unlock premium features with a 30-day free trial.
			</p>
		</div>

		<!-- Loading State -->
		{#if plansLoading}
			<div class="flex items-center justify-center py-12">
				<div class="inline-flex items-center space-x-2">
					<div class="w-4 h-4 bg-emerald-600 rounded-full animate-pulse"></div>
					<span class="text-slate-600">Loading plans...</span>
				</div>
			</div>
		{/if}

		<!-- Error State -->
		{#if error && !plansLoading}
			<div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
				<p class="text-red-700 font-semibold">{error}</p>
			</div>
		{/if}

		<!-- Plans Grid -->
		{#if !plansLoading && plans.length > 0}
			<div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
				{#each plans as plan (plan.code)}
					<div
						class="relative rounded-xl border-2 transition-all {selectedPlan === plan.code
							? 'border-emerald-600 bg-white shadow-xl'
							: 'border-slate-200 bg-white shadow-md hover:shadow-lg'}"
					>
						<!-- Ribbon for popular -->
						{#if plan.code === 'standard'}
							<div
								class="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-emerald-600 text-white px-4 py-1 rounded-full text-sm font-semibold"
							>
								Most Popular
							</div>
						{/if}

						<div class="p-8">
							<h2 class="text-2xl font-bold text-slate-900 mb-2">{plan.name}</h2>

							<!-- Price -->
							<div class="mb-6">
								<div class="flex items-baseline gap-1">
									<span class="text-5xl font-bold text-slate-900">${plan.price}</span>
									<span class="text-slate-600">/month</span>
								</div>
								<p class="text-sm text-slate-500 mt-2">
									First 30 days free, then billed monthly
								</p>
							</div>

							<!-- Features -->
							<div class="mb-8">
								<ul class="space-y-3">
									{#each plan.features as feature (feature)}
										<li class="flex items-start gap-3">
											<svg
												class="w-5 h-5 text-emerald-600 shrink-0 mt-0.5"
												fill="currentColor"
												viewBox="0 0 20 20"
											>
												<path
													fill-rule="evenodd"
													d="M16.704 5.29a1 1 0 010 1.42l-7.02 7.02a1 1 0 01-1.415 0L4.29 9.752a1 1 0 111.415-1.415l3.271 3.272 6.313-6.313a1 1 0 011.415-.006z"
													clip-rule="evenodd"
												/>
											</svg>
											<span class="text-slate-700 capitalize">{feature.replace(/_/g, ' ')}</span>
										</li>
									{/each}
								</ul>
							</div>

							<!-- CTA Button -->
							<button
								on:click={() => selectPlan(plan.code)}
								disabled={checkingOut}
								class="w-full py-3 px-4 rounded-lg font-semibold transition-all {selectedPlan === plan.code
									? 'bg-emerald-600 text-white hover:bg-emerald-700'
									: 'bg-slate-100 text-slate-900 hover:bg-slate-200'} disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{checkingOut && selectedPlan === plan.code ? 'Processing...' : 'Start Free Trial'}
							</button>
						</div>
					</div>
				{/each}
			</div>

			<!-- Info Box -->
			<div class="bg-blue-50 border border-blue-200 rounded-lg p-6">
				<div class="flex gap-4">
					<svg class="w-6 h-6 text-blue-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
						<path
							fill-rule="evenodd"
							d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zm-11-1a1 1 0 100 2h3a1 1 0 100-2H7zm3 4a1 1 0 100 2H7a1 1 0 100-2h3z"
							clip-rule="evenodd"
						/>
					</svg>
					<div>
						<h3 class="font-semibold text-blue-900 mb-1">30-Day Free Trial</h3>
						<p class="text-blue-800 text-sm">
							No credit card required for the first 30 days. Cancel anytime before your trial ends to avoid
							charges.
						</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- No Plans Available -->
		{#if !plansLoading && plans.length === 0}
			<div class="text-center py-12">
				<p class="text-slate-600 text-lg">No plans available at the moment. Please contact support.</p>
			</div>
		{/if}
	</div>
</div>

<style>
	:global(body) {
		background-color: #f8fafc;
	}
</style>
