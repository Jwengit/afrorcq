<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<script src="https://www.google.com/recaptcha/api.js" async defer></script>
</svelte:head>

{@render children()}
