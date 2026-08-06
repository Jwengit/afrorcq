<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { supabase } from '$lib/supabaseClient';

	let loading = true;
	let profileLoading = true;
	let firstName = '';
	let lastName = '';
	let memberNumber: number | null = null;
	let subject = '';
	let message = '';
	let error = '';
	let success = '';
	let submitting = false;

	async function getSessionAccessToken(): Promise<string | null> {
		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (session?.access_token) {
			const expiresAt = session.expires_at ?? 0;
			const nowSec = Math.floor(Date.now() / 1000);
			if (expiresAt - nowSec > 60) {
				return session.access_token;
			}
		}

		const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
		if (refreshError || !refreshed.session?.access_token) return null;
		return refreshed.session.access_token;
	}

	onMount(async () => {
		const { data, error: sessionError } = await supabase.auth.getSession();
		if (sessionError || !data.session) {
			goto(resolve('/auth/login'));
			return;
		}

		const userId = data.session.user.id;
		const { data: profile, error: profileError } = await supabase
			.from('profiles')
			.select('first_name, last_name, public_id')
			.eq('id', userId)
			.single();

		if (profileError) {
			error = 'Unable to load your profile information. Please try again.';
		} else {
			firstName = profile?.first_name ?? '';
			lastName = profile?.last_name ?? '';
			memberNumber = profile?.public_id ?? null;
		}

		profileLoading = false;
		loading = false;
	});

	async function submitSupportForm() {
		error = '';
		success = '';
		subject = subject.trim();
		message = message.trim();

		if (!subject) {
			error = 'Please provide a subject for your support request.';
			return;
		}

		if (!message) {
			error = 'Please describe your issue so support can help you.';
			return;
		}

		submitting = true;

		try {
			const token = await getSessionAccessToken();
			if (!token) {
				error = 'Session expired. Please sign in again.';
				goto(resolve('/auth/login'));
				return;
			}

			const formattedMessage =
				`Name: ${firstName} ${lastName}` +
				`\nMember number: #${memberNumber ?? '—'}` +
				`\n\n${message}`;

			const response = await fetch('/api/support/tickets', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ subject, message: formattedMessage })
			});

			const payload = await response.json();
			if (!response.ok) {
				error = payload?.error || 'Unable to submit your request. Please try again.';
				return;
			}

			success = 'Your support request has been submitted. Our team will get back to you soon.';
			subject = '';
			message = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Network error. Please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<section class="min-h-screen bg-slate-50 py-12 px-4">
	<div class="mx-auto w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
		<h1 class="text-3xl font-semibold text-gray-900">Contact Support</h1>
		<p class="mt-3 text-sm text-gray-600">Use this form to send a support request directly to our admin team.</p>

		{#if loading}
			<div class="mt-8 text-sm text-gray-500">Loading your profile…</div>
		{:else}
			<form class="mt-8 space-y-6" on:submit|preventDefault={submitSupportForm}>
				<div class="grid gap-4 sm:grid-cols-2">
					<label class="block">
						<span class="text-sm font-medium text-gray-700">First name</span>
						<input type="text" class="mt-1 w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-gray-900" value={firstName} readonly />
					</label>
					<label class="block">
						<span class="text-sm font-medium text-gray-700">Last name</span>
						<input type="text" class="mt-1 w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-gray-900" value={lastName} readonly />
					</label>
				</div>

				<label class="block">
					<span class="text-sm font-medium text-gray-700">Member number</span>
					<input type="text" class="mt-1 w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-gray-900" value={memberNumber ? `#${memberNumber}` : '—'} readonly />
				</label>

				<label class="block">
					<span class="text-sm font-medium text-gray-700">Subject</span>
					<input type="text" bind:value={subject} class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-gray-900" placeholder="Subject" required />
				</label>

				<label class="block">
					<span class="text-sm font-medium text-gray-700">Message</span>
					<textarea bind:value={message} rows="6" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-gray-900" placeholder="Describe your issue" required></textarea>
				</label>

				{#if error}
					<p class="text-sm text-red-600">{error}</p>
				{/if}
				{#if success}
					<p class="text-sm text-emerald-700">{success}</p>
				{/if}

				<div class="flex justify-end">
					<button type="submit" class="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60" disabled={submitting}>
						{submitting ? 'Sending…' : 'Send request'}
					</button>
				</div>
			</form>
		{/if}
	</div>
</section>
