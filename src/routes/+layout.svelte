<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import './layout.css';
	import Header from '$lib/components/Header.svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';

	let { children } = $props();

	onMount(() => {
		if (!browser || !('serviceWorker' in navigator)) return;

		navigator.serviceWorker.register('/sw.js').catch((error) => {
			console.error('Service worker registration failed:', error);
		});
	});
</script>

<svelte:head>
	<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
	<link rel="preconnect" href="https://www.google.com" />
	<link rel="preconnect" href="https://www.gstatic.com" crossorigin="anonymous" />
	<script src="https://www.google.com/recaptcha/api.js?render=explicit" async defer></script>
</svelte:head>

<Header />

<main class="flex-1">
	{@render children()}
</main>

<InstallPrompt />
