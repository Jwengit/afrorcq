<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { supabase } from '$lib/supabaseClient';
	import type { User } from '@supabase/supabase-js';

	type BeforeInstallPromptEvent = Event & {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
	};

	let deferredPrompt: BeforeInstallPromptEvent | null = null;
	let showBanner = false;
	let dismissed = false;
	let showIOSInstructions = false;
	let isMember = false;
	let currentUserId: string | null = null;

	const REMIND_UNTIL_KEY_PREFIX = 'pwa-prompt-remind-until';
	const INSTALLED_KEY_PREFIX = 'pwa-prompt-installed';
	const REMIND_LATER_DAYS = 30;
	const REMIND_LATER_MS = REMIND_LATER_DAYS * 24 * 60 * 60 * 1000;

	function userScopedKey(prefix: string, userId: string) {
		return `${prefix}:${userId}`;
	}

	function getStoredFlag(prefix: string, userId: string): boolean {
		try {
			return localStorage.getItem(userScopedKey(prefix, userId)) === '1';
		} catch {
			return false;
		}
	}

	function getStoredTimestamp(prefix: string, userId: string): number | null {
		try {
			const raw = localStorage.getItem(userScopedKey(prefix, userId));
			if (!raw) return null;
			const ts = Number(raw);
			return Number.isFinite(ts) ? ts : null;
		} catch {
			return null;
		}
	}

	function setStoredFlag(prefix: string, userId: string): void {
		try {
			localStorage.setItem(userScopedKey(prefix, userId), '1');
		} catch {
			// Ignore storage errors to keep the prompt usable.
		}
	}

	function setRemindLater(userId: string): void {
		try {
			localStorage.setItem(
				userScopedKey(REMIND_UNTIL_KEY_PREFIX, userId),
				String(Date.now() + REMIND_LATER_MS)
			);
		} catch {
			// Ignore storage errors to keep the prompt usable.
		}
	}

	function isRemindLaterActive(userId: string): boolean {
		const remindUntil = getStoredTimestamp(REMIND_UNTIL_KEY_PREFIX, userId);
		if (!remindUntil) return false;
		return remindUntil > Date.now();
	}

	function isDoneForCurrentUser() {
		if (!currentUserId) return true;
		return getStoredFlag(INSTALLED_KEY_PREFIX, currentUserId) || isRemindLaterActive(currentUserId);
	}

	function isStandaloneMode() {
		return (
			window.matchMedia('(display-mode: standalone)').matches ||
			(window.navigator as Navigator & { standalone?: boolean }).standalone === true
		);
	}

	function updatePromptVisibility() {
		if (!browser) return;

		if (!isMember || !currentUserId) {
			showBanner = false;
			return;
		}

		if (isStandaloneMode()) {
			setStoredFlag(INSTALLED_KEY_PREFIX, currentUserId);
			showBanner = false;
			return;
		}

		if (isDoneForCurrentUser()) {
			showBanner = false;
			return;
		}

		if (showIOSInstructions) {
			showBanner = true;
			return;
		}

		showBanner = Boolean(deferredPrompt);
	}

	function setAuthUser(user: User | null) {
		isMember = Boolean(user);
		currentUserId = user?.id ?? null;
		dismissed = false;
		updatePromptVisibility();
	}

	function isIOSDevice() {
		const ua = window.navigator.userAgent.toLowerCase();
		const platform = window.navigator.platform;
		const touchPoints = window.navigator.maxTouchPoints || 0;

		return /iphone|ipod|ipad/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
	}

	onMount(() => {
		if (!browser) return;

		supabase.auth.getUser().then(({ data: { user } }) => {
			setAuthUser(user);
		});

		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange((_event, session) => {
			setAuthUser(session?.user ?? null);
		});

		if (isIOSDevice()) {
			showIOSInstructions = true;
			updatePromptVisibility();
		}

		const onBeforeInstallPrompt = (e: Event) => {
			e.preventDefault();
			deferredPrompt = e as BeforeInstallPromptEvent;
			updatePromptVisibility();
		};

		const onAppInstalled = () => {
			if (currentUserId) {
				setStoredFlag(INSTALLED_KEY_PREFIX, currentUserId);
			}
			deferredPrompt = null;
			showBanner = false;
		};

		window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
		window.addEventListener('appinstalled', onAppInstalled);

		return () => {
			window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
			window.removeEventListener('appinstalled', onAppInstalled);
			subscription.unsubscribe();
		};
	});

	async function install() {
		if (!deferredPrompt) return;
		deferredPrompt.prompt();
		const { outcome } = await deferredPrompt.userChoice;
		deferredPrompt = null;
		showBanner = false;
		if (currentUserId && outcome === 'accepted') {
			setStoredFlag(INSTALLED_KEY_PREFIX, currentUserId);
		}
		if (currentUserId && outcome === 'dismissed') {
			setRemindLater(currentUserId);
		}
	}

	function dismiss() {
		showBanner = false;
		dismissed = true;
		if (currentUserId) {
			setRemindLater(currentUserId);
		}
	}
</script>

{#if showBanner && !dismissed && isMember}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
		<div class="relative w-full max-w-md rounded-2xl border border-green-200 bg-white p-6 shadow-2xl ring-1 ring-black/5">
			<button on:click={dismiss} class="absolute right-3 top-3 text-gray-400 hover:text-gray-600" aria-label="Fermer">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
				</svg>
			</button>

			<div class="mb-4 flex items-center gap-3">
				<img src="/Logo sans phrase.png" alt="Hizli Carpooling" class="h-12 w-12 rounded-xl border border-gray-100 object-contain p-1" />
				<div>
					<p class="text-lg font-bold text-gray-900">Installer Hizli Carpooling</p>
					{#if showIOSInstructions}
						<p class="text-sm text-gray-500">Sur iPhone/iPad, l'installation se fait depuis Safari.</p>
					{:else}
						<p class="text-sm text-gray-500">Ajoute l'app comme raccourci sur ton appareil.</p>
					{/if}
				</div>
			</div>

			{#if showIOSInstructions}
				<div class="rounded-lg bg-green-50 p-3 text-sm text-green-900">
					<p class="font-semibold">Etapes iPhone/iPad:</p>
					<p class="mt-1">1. Appuie sur le bouton Partager de Safari.</p>
					<p>2. Choisis Ajouter a l'ecran d'accueil.</p>
				</div>
			{:else}
				<div class="rounded-lg bg-green-50 p-3 text-sm text-green-900">
					Ouverture plus rapide, experience plein ecran et acces en un clic.
				</div>
			{/if}

			<div class="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
				{#if showIOSInstructions}
					<button
						on:click={dismiss}
						class="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
					>
						J'ai compris
					</button>
				{:else}
					<button
						on:click={install}
						class="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
					>
						Installer maintenant
					</button>
				{/if}
				<button
					on:click={dismiss}
					class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
				>
					Plus tard
				</button>
			</div>
		</div>
	</div>
{/if}
