import type { PageServerLoad } from './$types';

const DEFAULTS = {
	title: 'FAQ',
	content:
		'Q: How do I book a ride?\nA: Search your route, open ride details, and book your seat.\n\nQ: Is payment secure?\nA: Yes, payments are processed through secure providers.'
};

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const response = await fetch('/api/platform-settings');
		if (!response.ok) return DEFAULTS;
		const payload = await response.json();
		const s = payload?.settings;
		if (!s) return DEFAULTS;
		return {
			title: String(s.faq_page_title ?? DEFAULTS.title),
			content: String(s.faq_page_content ?? DEFAULTS.content)
		};
	} catch {
		return DEFAULTS;
	}
};
