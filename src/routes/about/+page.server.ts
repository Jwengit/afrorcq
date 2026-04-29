import type { PageServerLoad } from './$types';

const DEFAULTS = {
	title: 'About Us',
	content:
		'Hizli Carpooling is a community-first carpooling platform focused on safety, simplicity, and fair prices.'
};

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const response = await fetch('/api/platform-settings');
		if (!response.ok) return DEFAULTS;
		const payload = await response.json();
		const s = payload?.settings;
		if (!s) return DEFAULTS;
		return {
			title: String(s.about_page_title ?? DEFAULTS.title),
			content: String(s.about_page_content ?? DEFAULTS.content)
		};
	} catch {
		return DEFAULTS;
	}
};
