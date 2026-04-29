import type { PageServerLoad } from './$types';

const DEFAULTS = {
	title: 'Terms of Service',
	content:
		'By using Hizli Carpooling, you agree to respect other members, provide accurate information, and follow platform rules.'
};

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const response = await fetch('/api/platform-settings');
		if (!response.ok) return DEFAULTS;
		const payload = await response.json();
		const s = payload?.settings;
		if (!s) return DEFAULTS;
		return {
			title: String(s.terms_page_title ?? DEFAULTS.title),
			content: String(s.terms_page_content ?? DEFAULTS.content)
		};
	} catch {
		return DEFAULTS;
	}
};
