<script lang="ts">
	import { onMount } from 'svelte';

	let title = 'Privacy Policy';
	let content =
		'We collect only the data needed to operate Hizli Carpooling and keep the platform safe. We do not sell personal data.';

	onMount(async () => {
		try {
			const response = await fetch('/api/platform-settings');
			if (!response.ok) return;
			const payload = await response.json();
			const s = payload?.settings;
			if (!s) return;
			title = String(s.privacy_page_title ?? title);
			content = String(s.privacy_page_content ?? content);
		} catch {
			// Keep defaults when settings endpoint is unavailable.
		}
	});
</script>

<section class="min-h-screen bg-gray-50 py-14 px-4 sm:px-6 lg:px-8">
	<div class="max-w-4xl mx-auto bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
		<h1 class="text-3xl font-bold text-gray-900">{title}</h1>
		<p class="mt-4 text-gray-700 whitespace-pre-line leading-7">{content}</p>
	</div>
</section>
