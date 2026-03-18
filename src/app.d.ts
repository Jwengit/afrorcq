// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace NodeJS {
		interface ProcessEnv {
			VITE_PUBLIC_SUPABASE_URL?: string;
			VITE_PUBLIC_SUPABASE_ANON_KEY?: string;
		}
	}

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
