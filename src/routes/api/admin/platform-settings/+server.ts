import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

const DEFAULT_LANDING_SETTINGS = {
	footer_brand_description: 'A carpooling platform that connects people.',
	footer_about_us_label: 'About Us',
	footer_about_us_url: '/about',
	footer_how_it_works_label: 'How it works',
	footer_how_it_works_url: '/how-it-works',
	footer_faq_label: 'FAQ',
	footer_faq_url: '/faq',
	footer_help_center_label: 'Help Center',
	footer_help_center_url: '/help',
	footer_privacy_policy_label: 'Privacy Policy',
	footer_privacy_policy_url: '/privacy',
	footer_terms_of_service_label: 'Terms of Service',
	footer_terms_of_service_url: '/terms',
	about_page_title: 'About Us',
	about_page_content:
		'Hizli Carpooling is a community-first carpooling platform focused on safety, simplicity, and fair prices.',
	how_it_works_page_title: 'How it works',
	how_it_works_page_content:
		'1. Search your route.\n2. Pick a ride that matches your needs.\n3. Book and travel together.',
	faq_page_title: 'FAQ',
	faq_page_content:
		'Q: How do I book a ride?\nA: Search your route, open ride details, and book your seat.\n\nQ: Is payment secure?\nA: Yes, payments are processed through secure providers.',
	help_page_title: 'Help Center',
	help_page_content:
		'Need help? Contact our support team and include your ride ID and account email for faster resolution.',
	privacy_page_title: 'Privacy Policy',
	privacy_page_content:
		'We collect only the data needed to operate Hizli Carpooling and keep the platform safe. We do not sell personal data.',
	terms_page_title: 'Terms of Service',
	terms_page_content:
		'By using Hizli Carpooling, you agree to respect other members, provide accurate information, and follow platform rules.'
};

function normalizeText(value: unknown, fallback: string): string {
	if (typeof value !== 'string') return fallback;
	const trimmed = value.trim();
	return trimmed || fallback;
}

function normalizeFooterSettings(payload: Record<string, unknown>) {
	return {
		footer_brand_description: normalizeText(
			payload.footer_brand_description,
			DEFAULT_LANDING_SETTINGS.footer_brand_description
		),
		footer_about_us_label: normalizeText(
			payload.footer_about_us_label,
			DEFAULT_LANDING_SETTINGS.footer_about_us_label
		),
		footer_about_us_url: normalizeText(
			payload.footer_about_us_url,
			DEFAULT_LANDING_SETTINGS.footer_about_us_url
		),
		footer_how_it_works_label: normalizeText(
			payload.footer_how_it_works_label,
			DEFAULT_LANDING_SETTINGS.footer_how_it_works_label
		),
		footer_how_it_works_url: normalizeText(
			payload.footer_how_it_works_url,
			DEFAULT_LANDING_SETTINGS.footer_how_it_works_url
		),
		footer_faq_label: normalizeText(payload.footer_faq_label, DEFAULT_LANDING_SETTINGS.footer_faq_label),
		footer_faq_url: normalizeText(payload.footer_faq_url, DEFAULT_LANDING_SETTINGS.footer_faq_url),
		footer_help_center_label: normalizeText(
			payload.footer_help_center_label,
			DEFAULT_LANDING_SETTINGS.footer_help_center_label
		),
		footer_help_center_url: normalizeText(
			payload.footer_help_center_url,
			DEFAULT_LANDING_SETTINGS.footer_help_center_url
		),
		footer_privacy_policy_label: normalizeText(
			payload.footer_privacy_policy_label,
			DEFAULT_LANDING_SETTINGS.footer_privacy_policy_label
		),
		footer_privacy_policy_url: normalizeText(
			payload.footer_privacy_policy_url,
			DEFAULT_LANDING_SETTINGS.footer_privacy_policy_url
		),
		footer_terms_of_service_label: normalizeText(
			payload.footer_terms_of_service_label,
			DEFAULT_LANDING_SETTINGS.footer_terms_of_service_label
		),
		footer_terms_of_service_url: normalizeText(
			payload.footer_terms_of_service_url,
			DEFAULT_LANDING_SETTINGS.footer_terms_of_service_url
		),
		about_page_title: normalizeText(payload.about_page_title, DEFAULT_LANDING_SETTINGS.about_page_title),
		about_page_content: normalizeText(payload.about_page_content, DEFAULT_LANDING_SETTINGS.about_page_content),
		how_it_works_page_title: normalizeText(
			payload.how_it_works_page_title,
			DEFAULT_LANDING_SETTINGS.how_it_works_page_title
		),
		how_it_works_page_content: normalizeText(
			payload.how_it_works_page_content,
			DEFAULT_LANDING_SETTINGS.how_it_works_page_content
		),
		faq_page_title: normalizeText(payload.faq_page_title, DEFAULT_LANDING_SETTINGS.faq_page_title),
		faq_page_content: normalizeText(payload.faq_page_content, DEFAULT_LANDING_SETTINGS.faq_page_content),
		help_page_title: normalizeText(payload.help_page_title, DEFAULT_LANDING_SETTINGS.help_page_title),
		help_page_content: normalizeText(payload.help_page_content, DEFAULT_LANDING_SETTINGS.help_page_content),
		privacy_page_title: normalizeText(payload.privacy_page_title, DEFAULT_LANDING_SETTINGS.privacy_page_title),
		privacy_page_content: normalizeText(
			payload.privacy_page_content,
			DEFAULT_LANDING_SETTINGS.privacy_page_content
		),
		terms_page_title: normalizeText(payload.terms_page_title, DEFAULT_LANDING_SETTINGS.terms_page_title),
		terms_page_content: normalizeText(payload.terms_page_content, DEFAULT_LANDING_SETTINGS.terms_page_content)
	};
}

async function isRequesterAdmin(token: string): Promise<boolean> {
	if (!supabaseUrl || !supabaseAnonKey) {
		return false;
	}

	const anonClient = createClient(supabaseUrl, supabaseAnonKey);
	const {
		data: { user },
		error: userError
	} = await anonClient.auth.getUser(token);

	if (userError || !user) {
		return false;
	}

	const isHizliAccount = (user.email ?? '').toLowerCase() === 'hizli.carpooling@gmail.com';
	if (isHizliAccount) {
		return true;
	}

	const { data: profile } = await anonClient
		.from('profiles')
		.select('is_admin')
		.eq('id', user.id)
		.maybeSingle();

	return Boolean(profile?.is_admin);
}

function getBearerToken(request: Request): string | null {
	const authHeader = request.headers.get('authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}
	return authHeader.slice(7);
}

export const GET: RequestHandler = async ({ request }) => {
	try {
		if (!supabaseUrl || !supabaseAnonKey) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const token = getBearerToken(request);
		if (!token) return json({ error: 'Unauthorized' }, { status: 401 });

		const adminAllowed = await isRequesterAdmin(token);
		if (!adminAllowed) return json({ error: 'Forbidden' }, { status: 403 });

		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey) {
			return json(
				{
					error:
						'SUPABASE_SERVICE_ROLE_KEY is missing. Set it in your environment (.env.local for local dev, or Vercel Project Settings > Environment Variables for deployment) and redeploy/restart.'
				},
				{ status: 500 }
			);
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);
		const { data, error } = await adminClient
			.from('platform_settings')
			.select(
				'commission_percent, max_seats, max_price, updated_at, footer_brand_description, footer_about_us_label, footer_about_us_url, footer_how_it_works_label, footer_how_it_works_url, footer_faq_label, footer_faq_url, footer_help_center_label, footer_help_center_url, footer_privacy_policy_label, footer_privacy_policy_url, footer_terms_of_service_label, footer_terms_of_service_url, about_page_title, about_page_content, how_it_works_page_title, how_it_works_page_content, faq_page_title, faq_page_content, help_page_title, help_page_content, privacy_page_title, privacy_page_content, terms_page_title, terms_page_content'
			)
			.eq('id', 1)
			.maybeSingle();

		if (error) {
			if (error.message.toLowerCase().includes('footer_') || error.message.toLowerCase().includes('_page_')) {
				const fallback = await adminClient
					.from('platform_settings')
					.select('commission_percent, max_seats, max_price, updated_at')
					.eq('id', 1)
					.maybeSingle();

				if (fallback.error) {
					return json({ error: fallback.error.message }, { status: 500 });
				}

				const fallbackSettings = fallback.data ?? {
					commission_percent: 10,
					max_seats: 6,
					max_price: 200,
					updated_at: null
				};

				return json({
					settings: {
						...fallbackSettings,
						...DEFAULT_LANDING_SETTINGS
					}
				});
			}

			if (error.message.toLowerCase().includes('relation') && error.message.toLowerCase().includes('platform_settings')) {
				return json({
					settings: {
						commission_percent: 10,
						max_seats: 6,
						max_price: 200,
						updated_at: null,
						...DEFAULT_LANDING_SETTINGS
					}
				});
			}
			return json({ error: error.message }, { status: 500 });
		}

		return json({
			settings: data ?? {
				commission_percent: 10,
				max_seats: 6,
				max_price: 200,
				updated_at: null,
				...DEFAULT_LANDING_SETTINGS
			}
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async ({ request }) => {
	try {
		if (!supabaseUrl || !supabaseAnonKey) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const token = getBearerToken(request);
		if (!token) return json({ error: 'Unauthorized' }, { status: 401 });

		const adminAllowed = await isRequesterAdmin(token);
		if (!adminAllowed) return json({ error: 'Forbidden' }, { status: 403 });

		const body = await request.json();
		const commission = Number(body?.commission_percent);
		const maxSeats = Number(body?.max_seats);
		const maxPrice = Number(body?.max_price);
		const footerSettings = normalizeFooterSettings((body ?? {}) as Record<string, unknown>);

		if (
			Number.isNaN(commission) ||
			Number.isNaN(maxSeats) ||
			Number.isNaN(maxPrice) ||
			commission < 0 ||
			commission > 100 ||
			maxSeats < 1 ||
			maxPrice < 1
		) {
			return json({ error: 'Valeurs de configuration invalides.' }, { status: 400 });
		}

		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey) {
			return json(
				{
					error:
						'SUPABASE_SERVICE_ROLE_KEY is missing. Set it in your environment (.env.local for local dev, or Vercel Project Settings > Environment Variables for deployment) and redeploy/restart.'
				},
				{ status: 500 }
			);
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);
		const { error } = await adminClient.from('platform_settings').upsert(
			{
				id: 1,
				commission_percent: commission,
				max_seats: maxSeats,
				max_price: maxPrice,
				...footerSettings,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'id' }
		);

		if (error) {
			if (error.message.toLowerCase().includes('footer_') || error.message.toLowerCase().includes('_page_')) {
				return json(
					{
						error:
							'Landing content columns are missing. Run add_footer_content_to_platform_settings.sql, then retry.'
					},
					{ status: 500 }
				);
			}

			return json({ error: error.message }, { status: 500 });
		}

		return json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
