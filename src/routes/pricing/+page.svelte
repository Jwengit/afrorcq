<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { resolveMemberStatus, type MemberStatus } from '$lib/membershipAccess';

	type ProfileLite = {
		status?: string | null;
		is_verified?: boolean | null;
		membership_paid?: boolean | null;
		membership_expires_at?: string | null;
		membership_plan?: string | null;
	};

	let selectedPlan: 'student' | 'standard' = 'student';
	let loading = true;
	let processing = false;
	let message = '';
	let errorMessage = '';
	let memberStatus: MemberStatus = 'free';
	let rawProfileStatus: string = '';

	$: isApproved = rawProfileStatus === 'approved';

	onMount(async () => {
		const params = new URLSearchParams(window.location.search);
		const planParam = params.get('plan');

		const {
			data: { user }
		} = await supabase.auth.getUser();

		if (!user) {
			goto('/auth/login');
			return;
		}

		const { data: profile } = await supabase
			.from('profiles')
			.select('status, is_verified, membership_paid, membership_expires_at, membership_plan')
			.eq('id', user.id)
			.maybeSingle();

		const typedProfile = (profile as ProfileLite | null) ?? null;
		memberStatus = resolveMemberStatus({
			status: typedProfile?.status,
			isVerified: typedProfile?.is_verified,
			membershipPaid: typedProfile?.membership_paid,
			membershipExpiresAt: typedProfile?.membership_expires_at
		});
		rawProfileStatus = (typedProfile?.status ?? '').toLowerCase();

		// Priority: URL param > saved plan in DB > default 'student'
		if (planParam === 'student' || planParam === 'standard') {
			selectedPlan = planParam;
		} else if (typedProfile?.membership_plan === 'student' || typedProfile?.membership_plan === 'standard') {
			selectedPlan = typedProfile.membership_plan as 'student' | 'standard';
		}

		loading = false;
	});

	async function startCheckout() {
		processing = true;
		errorMessage = '';
		message = '';

		try {
			const {
				data: { session }
			} = await supabase.auth.getSession();

			const token = session?.access_token;
			if (!token) {
				goto('/auth/login');
				return;
			}

			const response = await fetch('/api/membership/checkout', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ plan: selectedPlan })
			});

			const payload = await response.json();
			if (!response.ok || !payload?.url) {
				errorMessage = payload?.error || 'Unable to start checkout right now. Please try again.';
				return;
			}

			window.location.href = payload.url;
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Unexpected error.';
		} finally {
			processing = false;
		}
	}

	async function savePlanAndContinue() {
		processing = true;
		errorMessage = '';
		message = '';

		try {
			const {
				data: { user }
			} = await supabase.auth.getUser();

			if (!user) {
				goto('/auth/login');
				return;
			}

			const { error } = await supabase
				.from('profiles')
				.update({ membership_plan: selectedPlan })
				.eq('id', user.id);

			if (error) {
				errorMessage = 'Unable to save your plan selection. Please try again.';
				return;
			}

			goto('/profile#verification-documents');
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Unexpected error.';
		} finally {
			processing = false;
		}
	}
</script>

<section class="min-h-[70vh] bg-linear-to-b from-emerald-50 via-white to-lime-50 px-4 py-12 md:px-8">
	<div class="mx-auto max-w-2xl">
		<div class="mb-8 text-center">
			<h1 class="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
				{isApproved ? 'Complete your membership' : 'Choose your plan'}
			</h1>
			<p class="mt-3 text-gray-600">
				{#if isApproved}
					Your documents have been verified. Complete your membership to unlock full access.
				{:else}
					Select the plan that fits you. You'll upload your documents in the next step.
				{/if}
			</p>
		</div>

		{#if errorMessage}
			<div class="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
				{errorMessage}
			</div>
		{/if}

		{#if !loading}
			<div class="grid gap-6 md:grid-cols-2">
				<label class="rounded-2xl border-2 p-6 shadow-sm transition {isApproved ? 'cursor-default' : 'cursor-pointer hover:shadow-md'} {selectedPlan === 'student' ? 'border-emerald-400 bg-white' : 'border-gray-200 bg-gray-50'}">
					<div class="flex items-start justify-between gap-4">
						<div>
							<div class="mb-2 inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
								Student Plan ⭐
							</div>
							<h2 class="text-2xl font-bold text-gray-900">$25 <span class="text-sm font-normal text-gray-500">/year</span></h2>
							<p class="mt-2 text-gray-600">For students. Same verified access, built for student budgets.</p>
							<ul class="mt-4 space-y-2 text-sm text-gray-700">
								<li>• Access to verified-only interactions</li>
								<li>• Priority trust and safety visibility</li>
								<li>• Requires valid student ID</li>
								<li>• Auto-renew every year via Stripe</li>
							</ul>
						</div>
					</div>
					<input
						type="radio"
						name="membership-plan"
						class="sr-only"
						bind:group={selectedPlan}
						value="student"
						disabled={isApproved}
					/>
				</label>

				<label class="rounded-2xl border-2 p-6 shadow-sm transition {isApproved ? 'cursor-default' : 'cursor-pointer hover:shadow-md'} {selectedPlan === 'standard' ? 'border-emerald-400 bg-white' : 'border-gray-200 bg-gray-50'}">
					<div class="flex items-start justify-between gap-4">
						<div>
							<div class="mb-2 inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-700">
								Standard Plan
							</div>
							<h2 class="text-2xl font-bold text-gray-900">$35 <span class="text-sm font-normal text-gray-500">/year</span></h2>
							<p class="mt-2 text-gray-600">For non-student members. Same safety, no student ID required.</p>
							<ul class="mt-4 space-y-2 text-sm text-gray-700">
								<li>• Access to verified-only interactions</li>
								<li>• Priority trust and safety visibility</li>
								<li>• No student ID required</li>
								<li>• Auto-renew every year via Stripe</li>
							</ul>
						</div>
					</div>
					<input
						type="radio"
						name="membership-plan"
						class="sr-only"
						bind:group={selectedPlan}
						value="standard"
						disabled={isApproved}
					/>
				</label>
			</div>

			<div class="mt-8 flex flex-wrap items-center gap-3">
				{#if isApproved}
					<button
						type="button"
						on:click={startCheckout}
						disabled={processing}
						class="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
					>
						{processing ? 'Redirecting to Stripe...' : 'Pay & unlock my account'}
					</button>
				{:else}
					<button
						type="button"
						on:click={savePlanAndContinue}
						disabled={processing}
						class="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
					>
						{processing ? 'Saving...' : 'Continue to document upload'}
					</button>
				{/if}
				<a href="/dashboard" class="rounded-xl border border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50">
					Back to dashboard
				</a>
			</div>
		{/if}
	</div>
</section>
