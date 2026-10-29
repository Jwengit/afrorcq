<script lang="ts">
	// VERSION: AdminTransactions membership 2026-10-29
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';

	// Set to false when Stripe is switched to live mode (only used for the "Stripe" link)
	const STRIPE_TEST_MODE = true;

	type Tx = {
		id: string;
		amount: number;
		currency: string | null;
		status: string;
		refund_status: string;
		refunded_amount: number;
		refund_method: string | null;
		refund_note: string | null;
		refunded_at: string | null;
		created_at: string;
		period_end: string | null;
		plan_name: string | null;
		member_name: string | null;
		member_email: string | null;
		account_closed_at: string | null;
		external_reference: string | null;
		provider: string | null;
		remaining_refundable: number;
		unused_part: number;
		fee_estimate: number;
		suggested_refund: number;
	};

	let transactions: Tx[] = [];
	let loading = true;
	let loadError = '';
	let message = '';
	let filter: 'due' | 'all' | 'refunded' = 'due';
	let showOldPayments = false;
	let stripeRefundEnabled = false;
	let search = '';

	$: visibleTransactions = transactions.filter((tx) => {
		const query = search.trim().toLowerCase();
		if (!query) return true;
		return [tx.member_name, tx.member_email, tx.plan_name]
			.filter(Boolean)
			.join(' ')
			.toLowerCase()
			.includes(query);
	});

	let selected: Tx | null = null;
	let refundAmount = '';
	let refundMode: 'stripe' | 'manual' = 'manual';
	let manualMethod = '';
	let refundNote = '';
	let submitting = false;
	let modalError = '';

	async function getToken(): Promise<string | null> {
		const {
			data: { session }
		} = await supabase.auth.getSession();
		return session?.access_token ?? null;
	}

	async function loadTransactions() {
		loading = true;
		loadError = '';
		try {
			const token = await getToken();
			if (!token) {
				loadError = 'Session expired. Please sign in again.';
				return;
			}
			const params = new URLSearchParams({ filter });
			if (showOldPayments) params.set('scope', 'all');
			const response = await fetch(`/api/admin/transactions?${params.toString()}`, {
				headers: { Authorization: `Bearer ${token}` }
			});
			const text = await response.text();
			let payload: any = null;
			try {
				payload = JSON.parse(text);
			} catch {
				payload = null;
			}
			if (!response.ok || !payload) {
				loadError = payload?.error || 'Unable to load payments.';
				transactions = [];
				return;
			}
			transactions = payload.transactions ?? [];
			stripeRefundEnabled = Boolean(payload.stripe_refund_enabled);
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Unable to load payments.';
			transactions = [];
		} finally {
			loading = false;
		}
	}

	function setFilter(next: 'due' | 'all' | 'refunded') {
		filter = next;
		void loadTransactions();
	}

	async function downloadCsv() {
		const token = await getToken();
		if (!token) return;
		const params = new URLSearchParams({ filter, format: 'csv' });
		if (showOldPayments) params.set('scope', 'all');
		const response = await fetch(`/api/admin/transactions?${params.toString()}`, {
			headers: { Authorization: `Bearer ${token}` }
		});
		if (!response.ok) {
			loadError = 'Unable to export payments.';
			return;
		}
		const blob = await response.blob();
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
		link.click();
		URL.revokeObjectURL(link.href);
	}

	function money(value: number | null | undefined): string {
		return `$${Number(value ?? 0).toFixed(2)}`;
	}

	function fmtDate(iso: string | null | undefined): string {
		if (!iso) return '—';
		const date = new Date(iso);
		if (Number.isNaN(date.getTime())) return '—';
		return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function statusLabel(tx: Tx): string {
		if (tx.status !== 'succeeded') return tx.status === 'canceled' ? 'Canceled' : tx.status === 'failed' ? 'Failed' : 'Pending';
		if (tx.refund_status === 'refunded' || tx.refund_status === 'partial') {
			return tx.refunded_amount >= tx.amount - 0.005
				? 'Refunded'
				: `Partially refunded (${money(tx.refunded_amount)})`;
		}
		if (tx.refund_status === 'pending') return 'Refund due';
		return 'Paid';
	}

	function statusClass(tx: Tx): string {
		if (tx.status !== 'succeeded') return 'bg-gray-100 text-gray-700';
		if (tx.refund_status === 'refunded' || tx.refund_status === 'partial') return 'bg-sky-100 text-sky-800';
		if (tx.refund_status === 'pending') return 'bg-amber-100 text-amber-800';
		return 'bg-emerald-100 text-emerald-800';
	}

	function canRefund(tx: Tx): boolean {
		return tx.provider === 'stripe' && tx.status === 'succeeded' && tx.remaining_refundable > 0.005;
	}

	function stripeLink(tx: Tx): string | null {
		if (!tx.external_reference || !tx.external_reference.startsWith('in_')) return null;
		return `https://dashboard.stripe.com${STRIPE_TEST_MODE ? '/test' : ''}/invoices/${tx.external_reference}`;
	}

	function openRefund(tx: Tx) {
		selected = tx;
		refundAmount = tx.suggested_refund.toFixed(2);
		refundMode = 'manual';
		manualMethod = '';
		refundNote = '';
		modalError = '';
	}

	function closeRefund() {
		selected = null;
		modalError = '';
	}

	async function submitRefund() {
		if (!selected) return;
		const amount = Number(refundAmount);
		if (!Number.isFinite(amount) || amount <= 0) {
			modalError = 'Enter a valid amount.';
			return;
		}
		if (amount > selected.remaining_refundable + 0.005) {
			modalError = `The maximum refundable amount is ${money(selected.remaining_refundable)}.`;
			return;
		}
		if (refundMode === 'manual' && !manualMethod.trim()) {
			modalError = 'Tell us how you refunded the member (Zelle, check...).';
			return;
		}
		if (refundMode === 'stripe' && !confirm(`Send ${money(amount)} back to the member's card now?`)) {
			return;
		}

		submitting = true;
		modalError = '';
		try {
			const token = await getToken();
			if (!token) {
				modalError = 'Session expired. Please sign in again.';
				return;
			}
			const response = await fetch('/api/admin/transactions', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({
					action: refundMode === 'stripe' ? 'refund_stripe' : 'refund_manual',
					transactionId: selected.id,
					amount,
					method: manualMethod.trim(),
					note: refundNote.trim()
				})
			});
			const text = await response.text();
			let payload: any = null;
			try {
				payload = JSON.parse(text);
			} catch {
				payload = null;
			}
			if (!response.ok || !payload?.success) {
				modalError = payload?.error || 'The refund could not be recorded.';
				return;
			}
			message =
				refundMode === 'stripe'
					? `${money(amount)} refunded to the card via Stripe.`
					: `${money(amount)} recorded as refunded (${manualMethod.trim()}).`;
			closeRefund();
			await loadTransactions();
		} catch (error) {
			modalError = error instanceof Error ? error.message : 'The refund could not be recorded.';
		} finally {
			submitting = false;
		}
	}

	onMount(loadTransactions);
</script>

<div class="space-y-4">
	<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
		<div>
			<h2 class="text-xl font-semibold text-slate-900">Membership payments</h2>
			<p class="text-sm text-slate-600">
				Annual memberships paid through Stripe. Refund = unused part of the year, minus the payment processing fee.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				on:click={() => setFilter('due')}
				class="rounded-lg border px-3 py-1.5 text-sm font-medium {filter === 'due' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}"
			>
				Refunds to do
			</button>
			<button
				type="button"
				on:click={() => setFilter('all')}
				class="rounded-lg border px-3 py-1.5 text-sm font-medium {filter === 'all' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}"
			>
				All payments
			</button>
			<button
				type="button"
				on:click={() => setFilter('refunded')}
				class="rounded-lg border px-3 py-1.5 text-sm font-medium {filter === 'refunded' ? 'border-sky-300 bg-sky-50 text-sky-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}"
			>
				Refunded
			</button>
			<button
				type="button"
				on:click={downloadCsv}
				class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
			>
				Export CSV
			</button>
		</div>
	</div>

	<input
		type="search"
		placeholder="Search by name, email or plan..."
		bind:value={search}
		class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:w-80"
	/>

	<label class="flex items-center gap-2 text-xs text-slate-500">
		<input type="checkbox" bind:checked={showOldPayments} on:change={loadTransactions} />
		Also show old ride payments (previous business model)
	</label>

	{#if message}
		<p class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
	{/if}
	{#if loadError}
		<p class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
	{/if}

	<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
		{#if loading}
			<p class="px-4 py-6 text-sm text-slate-500">Loading payments...</p>
		{:else if transactions.length === 0}
			<p class="px-4 py-6 text-sm text-slate-500">
				{filter === 'due' ? 'No refund to do.' : 'No payment found.'}
			</p>
		{:else}
			<table class="w-full text-sm">
				<thead class="bg-slate-50 text-left text-slate-600">
					<tr>
						<th class="px-4 py-3 font-medium">Paid on</th>
						<th class="px-4 py-3 font-medium">Member</th>
						<th class="px-4 py-3 font-medium">Plan</th>
						<th class="px-4 py-3 font-medium">Amount</th>
						<th class="px-4 py-3 font-medium">Period ends</th>
						<th class="px-4 py-3 font-medium">Status</th>
						<th class="px-4 py-3 font-medium">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					{#each visibleTransactions as tx (tx.id)}
						<tr class="align-top">
							<td class="px-4 py-3 whitespace-nowrap">{fmtDate(tx.created_at)}</td>
							<td class="px-4 py-3">
								<p class="font-medium text-slate-900">{tx.member_name || 'No name'}</p>
								<p class="text-xs text-slate-500">{tx.member_email || 'No email'}</p>
								{#if tx.account_closed_at}
									<span class="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
										Account closed {fmtDate(tx.account_closed_at)}
									</span>
								{/if}
							</td>
							<td class="px-4 py-3 capitalize">{tx.plan_name || '—'}</td>
							<td class="px-4 py-3 whitespace-nowrap">{money(tx.amount)}</td>
							<td class="px-4 py-3 whitespace-nowrap">{fmtDate(tx.period_end)}</td>
							<td class="px-4 py-3">
								<span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold {statusClass(tx)}">
									{statusLabel(tx)}
								</span>
								{#if tx.refund_status === 'refunded' || tx.refund_status === 'partial'}
									<p class="mt-1 text-xs text-slate-500">
										{fmtDate(tx.refunded_at)} · {tx.refund_method || 'method not recorded'}
									</p>
								{/if}
								{#if tx.refund_note}
									<p class="mt-1 whitespace-pre-line text-xs text-slate-500">{tx.refund_note}</p>
								{/if}
							</td>
							<td class="px-4 py-3">
								<div class="flex flex-wrap items-center gap-2">
									{#if canRefund(tx)}
										<button
											type="button"
											on:click={() => openRefund(tx)}
											class="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
										>
											Refund
										</button>
									{/if}
									{#if stripeLink(tx)}
										<a
											href={stripeLink(tx)}
											target="_blank"
											rel="noopener noreferrer"
											class="text-xs font-medium text-blue-700 hover:underline"
										>
											Stripe
										</a>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>

{#if selected}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
		on:click|self={closeRefund}
	>
		<div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
			<h3 class="text-lg font-semibold text-slate-900">Refund {selected.member_name || selected.member_email || 'member'}</h3>

			<dl class="mt-4 space-y-1 text-sm">
				<div class="flex justify-between"><dt class="text-slate-600">Paid</dt><dd>{money(selected.amount)}</dd></div>
				{#if selected.refunded_amount > 0}
					<div class="flex justify-between"><dt class="text-slate-600">Already refunded</dt><dd>{money(selected.refunded_amount)}</dd></div>
				{/if}
				<div class="flex justify-between"><dt class="text-slate-600">Period ends</dt><dd>{fmtDate(selected.period_end)}</dd></div>
				<div class="flex justify-between"><dt class="text-slate-600">Unused part of the year</dt><dd>{money(selected.unused_part)}</dd></div>
				<div class="flex justify-between"><dt class="text-slate-600">Processing fee (estimate)</dt><dd>− {money(selected.fee_estimate)}</dd></div>
				<div class="flex justify-between border-t border-slate-200 pt-1 font-semibold">
					<dt>Suggested refund</dt><dd>{money(selected.suggested_refund)}</dd>
				</div>
			</dl>
			<p class="mt-2 text-xs text-slate-500">
				Estimate based on the amount paid. Check the real fee in Stripe if needed.
			</p>

			<label for="refund-amount" class="mt-4 block text-sm font-medium text-slate-700">Amount to refund ($)</label>
			<input
				id="refund-amount"
				type="number"
				min="0"
				step="0.01"
				bind:value={refundAmount}
				class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
			/>

			<fieldset class="mt-4 space-y-2">
				<legend class="text-sm font-medium text-slate-700">How is it refunded?</legend>
				<label class="flex items-start gap-2 text-sm text-slate-700">
					<input type="radio" bind:group={refundMode} value="manual" class="mt-1" />
					<span>I refunded another way (Zelle, check...)</span>
				</label>
				{#if refundMode === 'manual'}
					<input
						type="text"
						placeholder="Zelle, check, cash..."
						bind:value={manualMethod}
						class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
					/>
				{/if}
				<label class="flex items-start gap-2 text-sm text-slate-700">
					<input type="radio" bind:group={refundMode} value="stripe" class="mt-1" />
					<span>Refund to the member's card through Stripe (the money leaves now)</span>
				</label>
			</fieldset>

			<label for="refund-note" class="mt-4 block text-sm font-medium text-slate-700">Note (optional)</label>
			<textarea
				id="refund-note"
				rows="2"
				bind:value={refundNote}
				class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
			></textarea>

			{#if modalError}
				<p class="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{modalError}</p>
			{/if}

			<div class="mt-5 flex gap-3">
				<button
					type="button"
					on:click={closeRefund}
					disabled={submitting}
					class="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
				>
					Cancel
				</button>
				<button
					type="button"
					on:click={submitRefund}
					disabled={submitting}
					class="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
				>
					{submitting ? 'Saving...' : 'Confirm refund'}
				</button>
			</div>
		</div>
	</div>
{/if}