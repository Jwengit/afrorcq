import { writable, type Writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { browser } from '$app/environment';
import type { User } from '@supabase/supabase-js';

export const user: Writable<User | null> = writable(null);

// Configuration de l'inactivité (15 minutes en millisecondes)
const INACTIVITY_TIMEOUT = 15 * 60 * 1000;
let inactivityTimer: NodeJS.Timeout | null = null;

// Fonction pour réinitialiser le timer d'inactivité
function resetInactivityTimer() {
	// Effacer le timer existant
	if (inactivityTimer) {
		clearTimeout(inactivityTimer);
	}

	// Créer un nouveau timer
	inactivityTimer = setTimeout(async () => {
		console.log('Déconnexion pour inactivité');
		await supabase.auth.signOut();
		user.set(null);
	}, INACTIVITY_TIMEOUT);
}

// Fonction pour configurer les écouteurs d'activité
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

	// Démarrer le timer initial
	resetInactivityTimer();
}

if (browser) {
	supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
		user.set(currentUser);
		// Configurer les écouteurs d'activité si l'utilisateur est connecté
		if (currentUser) {
			setupActivityListeners();
		}
	});

	supabase.auth.onAuthStateChange((event, session) => {
		user.set(session?.user ?? null);
		
		// Configurer les écouteurs d'activité si l'utilisateur se connecte
		if (session?.user) {
			setupActivityListeners();
		} else {
			// Arrêter le timer si l'utilisateur se déconnecte
			if (inactivityTimer) {
				clearTimeout(inactivityTimer);
				inactivityTimer = null;
			}
		}
	});
}