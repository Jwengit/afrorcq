import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL!
const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY!
const persistSession = import.meta.env.DEV
	? true
	: import.meta.env.VITE_SUPABASE_PERSIST_SESSION === 'true'

if (typeof window !== 'undefined' && !persistSession) {
	for (const key of Object.keys(window.localStorage)) {
		if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
			window.localStorage.removeItem(key)
		}
	}
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
	auth: {
		persistSession,
		autoRefreshToken: true,
		detectSessionInUrl: true
	}
})
