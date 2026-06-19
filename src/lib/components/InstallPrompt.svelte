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
	let showFallbackInstructions = false;
	let isMember = false;
	let currentUserId: string | null = null;

	const REMIND_UNTIL_KEY_PREFIX = 'pwa-prompt-remind-until';
	const INSTALLED_KEY_PREFIX = 'pwa-prompt-installed';
	const REMIND_LATER_DAYS = 30;
	const REMIND_LATER_MS = REMIND_LATER_DAYS * 24 * 60 * 60 * 1000;
	const GUEST_STORAGE_SCOPE = 'guest';
	const FALLBACK_BANNER_DELAY_MS = 2500;

	function userScopedKey(prefix: string, userId: string) {
		return `${prefix}:${userId}`;
	}

	function getStorageScope(): string {
		return currentUserId ?? GUEST_STORAGE_SCOPE;
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
		const scope = getStorageScope();
		return getStoredFlag(INSTALLED_KEY_PREFIX, scope) || isRemindLaterActive(scope);
	}

	function isStandaloneMode() {
		return (
			window.matchMedia('(display-mode: standalone)').matches ||
			(window.navigator as Navigator & { standalone?: boolean }).standalone === true
		);
	}

	function updatePromptVisibility() {
		if (!browser) return;

		const scope = getStorageScope();

		if (isStandaloneMode()) {
			setStoredFlag(INSTALLED_KEY_PREFIX, scope);
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

		showBanner = Boolean(deferredPrompt) || showFallbackInstructions;
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
		let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

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
		} else {
			fallbackTimer = setTimeout(() => {
				if (isStandaloneMode() || isDoneForCurrentUser() || deferredPrompt) return;
				showFallbackInstructions = true;
				updatePromptVisibility();
			}, FALLBACK_BANNER_DELAY_MS);
		}

		const onBeforeInstallPrompt = (e: Event) => {
			e.preventDefault();
			deferredPrompt = e as BeforeInstallPromptEvent;
			showFallbackInstructions = false;
			updatePromptVisibility();
		};

		const onAppInstalled = () => {
			setStoredFlag(INSTALLED_KEY_PREFIX, getStorageScope());
			showFallbackInstructions = false;
			deferredPrompt = null;
			showBanner = false;
		};

		window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
		window.addEventListener('appinstalled', onAppInstalled);

		return () => {
			if (fallbackTimer) {
				clearTimeout(fallbackTimer);
			}
			window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
			window.removeEventListener('appinstalled', onAppInstalled);
			subscription.unsubscribe();
		};
	});

	async function install() {
		if (!deferredPrompt) {
			showFallbackInstructions = true;
			updatePromptVisibility();
			return;
		}
		deferredPrompt.prompt();
		const { outcome } = await deferredPrompt.userChoice;
		deferredPrompt = null;
		showBanner = false;
		if (outcome === 'accepted') {
			setStoredFlag(INSTALLED_KEY_PREFIX, getStorageScope());
		}
		if (outcome === 'dismissed') {
			setRemindLater(getStorageScope());
		}
	}

	function dismiss() {
		showBanner = false;
		dismissed = true;
		showFallbackInstructions = false;
		setRemindLater(getStorageScope());
	}
</script>

{#if showBanner && !dismissed}
	<div class="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pointer-events-none">
		<div class="relative w-full max-w-md rounded-2xl border border-green-200 bg-white p-6 shadow-2xl ring-1 ring-black/5 pointer-events-auto">
			<button on:click={dismiss} class="absolute right-3 top-3 text-gray-400 hover:text-gray-600" aria-label="Close">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
				</svg>
			</button>

			<div class="mb-4 flex items-center gap-3">
				<img src="/Logo sans phrase.png" alt="Hizli Carpooling" class="h-12 w-12 rounded-xl border border-gray-100 object-contain p-1" />
				<div>
					<p class="text-lg font-bold text-gray-900">Install Hizli Carpooling</p>
					{#if showIOSInstructions}
						<p class="text-sm text-gray-500">Tap Install, then follow Safari steps to add the app.</p>
					{/if}
				</div>
			</div>

			{#if showIOSInstructions}
				<div class="rounded-lg bg-green-50 p-3 text-sm text-green-900">
					<p class="font-semibold">iPhone/iPad Steps:</p>
					<p class="mt-1">1. Tap Safari's Share button.</p>
					<p>2. Choose Add to Home Screen.</p>
				</div>
			{:else if !deferredPrompt}
				<div class="rounded-lg bg-green-50 p-3 text-sm text-green-900">
					<p class="text-center">Click Install to add the app, or Later to be reminded.</p>
				</div>
			{:else}
				<div class="rounded-lg bg-green-50 p-3 text-sm text-green-900">
					Faster opening, full-screen experience, and quick access.
				</div>
			{/if}

			<div class="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
				<button
					on:click={install}
					class="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
				>
					Install
				</button>
				<button
					on:click={dismiss}
					class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
				>
					Later
				</button>
			</div>
		</div>
	</div>
{/if}
