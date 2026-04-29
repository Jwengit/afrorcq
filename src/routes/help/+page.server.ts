import type { PageServerLoad } from './$types';

const DEFAULTS = {
	title: 'Help Center',
	content:
		'Need help? Contact our support team and include your ride ID and account email for faster resolution.'
};

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const response = await fetch('/api/platform-settings');
		if (!response.ok) return DEFAULTS;
		const payload = await response.json();
		const s = payload?.settings;
		if (!s) return DEFAULTS;
		return {
			title: String(s.help_page_title ?? DEFAULTS.title),
			content: String(s.help_page_content ?? DEFAULTS.content)
		};
	} catch {
		return DEFAULTS;
	}
};
