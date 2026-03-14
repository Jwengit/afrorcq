import { writable, type Writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { browser } from '$app/environment';
import type { User } from '@supabase/supabase-js';

export const user: Writable<User | null> = writable(null);

if (browser) {
	supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
		user.set(currentUser);
	});

	supabase.auth.onAuthStateChange((event, session) => {
		user.set(session?.user ?? null);
	});
}