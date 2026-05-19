import { writable, type Writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { browser } from '$app/environment';
import type { User } from '@supabase/supabase-js';

export const user: Writable<User | null> = writable(null);

// Inactivity timeout configuration (15 minutes in milliseconds)
const INACTIVITY_TIMEOUT = 15 * 60 * 1000;
let inactivityTimer: NodeJS.Timeout | null = null;

// Reset inactivity timer
function resetInactivityTimer() {
	// Effacer le timer existant
	if (inactivityTimer) {
		clearTimeout(inactivityTimer);
	}

	// Create a new timer
	inactivityTimer = setTimeout(async () => {
		console.log('Auto sign-out due to inactivity');
		await supabase.auth.signOut();
		user.set(null);
	}, INACTIVITY_TIMEOUT);
}

// Setup activity listeners
function setupActivityListeners() {
	if (!browser) return;

	const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

	events.forEach((event) => {
		document.addEventListener(
			event,
			() => {
				resetInactivityTimer();
			},
			true
		);
	});

	// Start initial timer
	resetInactivityTimer();
}

if (browser) {
	supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
		user.set(currentUser);
		// Setup activity listeners when user is already authenticated
		if (currentUser) {
			setupActivityListeners();
		}
	});

	supabase.auth.onAuthStateChange((event, session) => {
		user.set(session?.user ?? null);
		
		// Setup activity listeners when user signs in
		if (session?.user) {
			setupActivityListeners();
		} else {
			// Stop timer when user signs out
			if (inactivityTimer) {
				clearTimeout(inactivityTimer);
				inactivityTimer = null;
			}
		}
	});
}