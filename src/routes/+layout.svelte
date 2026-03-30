<script lang="ts">
	import './layout.css';
	import Header from '$lib/components/Header.svelte';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://www.google.com" />
	<link rel="preconnect" href="https://www.gstatic.com" crossorigin="anonymous" />
	<script src="https://www.google.com/recaptcha/api.js?render=explicit" async defer></script>
</svelte:head>

<Header />

<main class="flex-1">
	{@render children()}
</main>
