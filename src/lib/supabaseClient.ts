import { browser } from '$app/environment'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL!
const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY!
const rememberSession = import.meta.env.VITE_SUPABASE_PERSIST_SESSION === 'true'

type SupabaseStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function getAuthStorage(): SupabaseStorage | undefined {
	if (!browser) {
		return undefined
	}

	return rememberSession ? window.localStorage : window.sessionStorage
}


if (browser && !rememberSession) {
	for (const key of Object.keys(window.localStorage)) {
		if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
			window.localStorage.removeItem(key)
		}
	}
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
	auth: {
		persistSession: true,
		storage: getAuthStorage(),
		autoRefreshToken: true,
		detectSessionInUrl: true
	}
})
