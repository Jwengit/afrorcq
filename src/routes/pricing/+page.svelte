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
	};

	let selectedPlan: 'annual' = 'annual';
	let loading = true;
	let processing = false;
	let message = '';
	let errorMessage = '';
	let memberStatus: MemberStatus = 'free';
	let membershipExpiresAt: string | null = null;

	function formatDate(value: string | null): string {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return date.toLocaleDateString();
	}

	onMount(async () => {
		const checkoutState = new URLSearchParams(window.location.search).get('checkout');
		if (checkoutState === 'success') {
			message = 'Payment successful. Your verified-member access is being activated.';
		}
		if (checkoutState === 'cancel') {
			errorMessage = 'Checkout was canceled. You can try again anytime.';
		}

		const {
			data: { user }
		} = await supabase.auth.getUser();

		if (!user) {
			goto('/auth/login');
			return;
		}

		const { data: profile } = await supabase
			.from('profiles')
			.select('status, is_verified, membership_paid, membership_expires_at')
			.eq('id', user.id)
			.maybeSingle();

		const typedProfile = (profile as ProfileLite | null) ?? null;
		memberStatus = resolveMemberStatus({
			status: typedProfile?.status,
			isVerified: typedProfile?.is_verified,
			membershipPaid: typedProfile?.membership_paid,
			membershipExpiresAt: typedProfile?.membership_expires_at
		});
		membershipExpiresAt = typedProfile?.membership_expires_at ?? null;
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
				errorMessage = payload?.error || 'Unable to start checkout right now.';
				return;
			}

			window.location.href = payload.url;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unexpected network error.';
		} finally {
			processing = false;
		}
	}
</script>

<section class="min-h-[70vh] bg-linear-to-b from-emerald-50 via-white to-lime-50 px-4 py-12 md:px-8">
	<div class="mx-auto max-w-4xl">
		<div class="mb-8 text-center">
			<h1 class="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">Membership plans</h1>
			<p class="mt-3 text-gray-600">
				Unlock verified-member access for a safer carpooling experience.
			</p>
		</div>

		{#if message}
			<div class="mb-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-800">
				{message}
			</div>
		{/if}

		{#if errorMessage}
			<div class="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
				{errorMessage}
			</div>
		{/if}

		{#if !loading}
			<div class="mb-8 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">
				<div class="flex flex-wrap items-center gap-2">
					<span class="font-semibold text-gray-900">Current membership status:</span>
					<span class="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-700">
						{memberStatus}
					</span>
					{#if membershipExpiresAt}
						<span>• valid until {formatDate(membershipExpiresAt)}</span>
					{/if}
				</div>
			</div>

			<div class="grid gap-6 md:grid-cols-1">
				<label class="cursor-pointer rounded-2xl border-2 border-emerald-400 bg-white p-6 shadow-sm transition hover:shadow-md">
					<div class="flex items-start justify-between gap-4">
						<div>
							<div class="mb-2 inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
								Annual
							</div>
							<h2 class="text-2xl font-bold text-gray-900">Verified Membership</h2>
							<p class="mt-2 text-gray-600">Full access to verified profiles and premium safety filters.</p>
							<ul class="mt-4 space-y-2 text-sm text-gray-700">
								<li>• Access to verified-only interactions</li>
								<li>• Priority trust and safety visibility</li>
								<li>• Auto-renew every year via Stripe</li>
							</ul>
						</div>
						<div class="text-right">
							<div class="text-3xl font-extrabold text-gray-900">Yearly</div>
							<p class="text-xs text-gray-500">Amount shown in Stripe checkout</p>
						</div>
					</div>
					<input
						type="radio"
						name="membership-plan"
						class="sr-only"
						bind:group={selectedPlan}
						value="annual"
					/>
				</label>
			</div>

			<div class="mt-8 flex flex-wrap items-center gap-3">
				<button
					type="button"
					on:click={startCheckout}
					disabled={processing}
					class="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
				>
					{processing ? 'Redirecting to Stripe...' : 'Continue to secure payment'}
				</button>
				<a href="/dashboard" class="rounded-xl border border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50">
					Back to dashboard
				</a>
			</div>
		{/if}
	</div>
</section>
