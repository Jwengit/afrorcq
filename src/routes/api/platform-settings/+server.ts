import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

const DEFAULT_PUBLIC_SETTINGS = {
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

export const GET: RequestHandler = async () => {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: 'Server configuration error' }, { status: 500 });
    }

    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return json({ settings: DEFAULT_PUBLIC_SETTINGS });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const fullSelect =
      'footer_brand_description, footer_about_us_label, footer_about_us_url, footer_how_it_works_label, footer_how_it_works_url, footer_faq_label, footer_faq_url, footer_help_center_label, footer_help_center_url, footer_privacy_policy_label, footer_privacy_policy_url, footer_terms_of_service_label, footer_terms_of_service_url, about_page_title, about_page_content, how_it_works_page_title, how_it_works_page_content, faq_page_title, faq_page_content, help_page_title, help_page_content, privacy_page_title, privacy_page_content, terms_page_title, terms_page_content';

    const { data, error } = await adminClient
      .from('platform_settings')
      .select(fullSelect)
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      if (error.message.toLowerCase().includes('relation') && error.message.toLowerCase().includes('platform_settings')) {
        return json({ settings: DEFAULT_PUBLIC_SETTINGS });
      }

      if (error.message.toLowerCase().includes('footer_') || error.message.toLowerCase().includes('_page_')) {
        return json({ settings: DEFAULT_PUBLIC_SETTINGS });
      }

      return json({ error: error.message }, { status: 500 });
    }

    return json({
      settings: {
        ...DEFAULT_PUBLIC_SETTINGS,
        ...(data ?? {})
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return json({ error: message }, { status: 500 });
  }
};
