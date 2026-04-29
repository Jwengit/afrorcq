import type { PageServerLoad } from './$types';

const DEFAULTS = {
	title: 'How it works',
	content:
		'1. Search your route.\n2. Pick a ride that matches your needs.\n3. Book and travel together.'
};

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const response = await fetch('/api/platform-settings');
		if (!response.ok) return DEFAULTS;
		const payload = await response.json();
		const s = payload?.settings;
		if (!s) return DEFAULTS;
		return {
			title: String(s.how_it_works_page_title ?? DEFAULTS.title),
			content: String(s.how_it_works_page_content ?? DEFAULTS.content)
		};
	} catch {
		return DEFAULTS;
	}
};
