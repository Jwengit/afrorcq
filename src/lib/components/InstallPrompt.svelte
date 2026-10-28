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
	const IOS_ACKNOWLEDGED_KEY_PREFIX = 'pwa-prompt-ios-acknowledged';
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
		return (
			getStoredFlag(INSTALLED_KEY_PREFIX, scope) ||
			getStoredFlag(IOS_ACKNOWLEDGED_KEY_PREFIX, scope) ||
			isRemindLaterActive(scope)
		);
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

	function acknowledgeIOS() {
		// On iOS, there is no automatic install. The user just follows the
		// manual steps (Share > Add to Home Screen) when they choose to.
		// We remember they saw the instructions so we don't nag them again.
		setStoredFlag(IOS_ACKNOWLEDGED_KEY_PREFIX, getStorageScope());
		showBanner = false;
		dismissed = true;
	}
</script>

{#if showBanner && !dismissed}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
		<div class="relative w-full max-w-md rounded-2xl border border-green-200 bg-white p-6 shadow-2xl ring-1 ring-black/5">
			<button on:click={showIOSInstructions ? acknowledgeIOS : dismiss} class="absolute right-3 top-3 text-gray-400 hover:text-gray-600" aria-label="Close">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
				</svg>
			</button>

			<div class="mb-4 flex items-center gap-3">
				<img src="/Logo sans phrase.png" alt="Hizli Carpooling" class="h-12 w-12 rounded-xl border border-gray-100 object-contain p-1" />
				<div>
					<p class="text-lg font-bold text-gray-900">Install Hizli Web-app</p>
					<p class="text-sm text-gray-500">Get quick access and a smoother experience.</p>
				</div>
			</div>

			{#if showIOSInstructions}
				<div class="rounded-lg bg-green-50 p-4 text-sm text-green-900 space-y-3">
					<p class="font-semibold">Install on your iPad or iPhone:</p>
					<ol class="list-decimal list-inside space-y-1.5">
						<li>Open this website in <strong>Safari</strong>.</li>
						<li>
							Tap the <strong>Share</strong> button
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block h-4 w-4 align-text-bottom mx-0.5">
								<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
								<polyline points="16 6 12 2 8 6"/>
								<line x1="12" x2="12" y1="2" y2="15"/>
							</svg>
							(the square with an arrow pointing up).
						</li>
						<li>Scroll down and choose <strong>Add to Home Screen</strong>.</li>
						<li>Tap <strong>Add</strong> to confirm.</li>
					</ol>
				</div>
			{/if}

			<div class="mt-5 grid grid-cols-1 gap-2 {showIOSInstructions ? '' : 'sm:grid-cols-2'}">
				{#if showIOSInstructions}
					<button
						on:click={acknowledgeIOS}
						class="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
					>
						Got it
					</button>
				{:else}
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
				{/if}
			</div>
		</div>
	</div>
{/if}