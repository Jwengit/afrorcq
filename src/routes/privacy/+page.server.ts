import type { PageServerLoad } from './$types';

const DEFAULTS = {
	title: 'Privacy Policy',
	content:
		'We collect only the data needed to operate Hizli Carpooling and keep the platform safe. We do not sell personal data.'
};

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const response = await fetch('/api/platform-settings');
		if (!response.ok) return DEFAULTS;
		const payload = await response.json();
		const s = payload?.settings;
		if (!s) return DEFAULTS;
		return {
			title: String(s.privacy_page_title ?? DEFAULTS.title),
			content: String(s.privacy_page_content ?? DEFAULTS.content)
		};
	} catch {
		return DEFAULTS;
	}
};
