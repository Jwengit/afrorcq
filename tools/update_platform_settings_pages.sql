-- Updates footer page labels/URLs and static page content in platform_settings (row id = 1).
-- Run this in Supabase SQL Editor (production project).

UPDATE platform_settings
SET
  footer_about_us_label = 'About Us',
  footer_about_us_url = '/about',
  footer_how_it_works_label = 'How it works',
  footer_how_it_works_url = '/how-it-works',
  footer_faq_label = 'FAQ',
  footer_faq_url = '/faq',
  footer_help_center_label = 'Help Center',
  footer_help_center_url = '/help',
  footer_privacy_policy_label = 'Privacy Policy',
  footer_privacy_policy_url = '/privacy',
  footer_terms_of_service_label = 'Terms of Service',
  footer_terms_of_service_url = '/terms',

  about_page_title = 'About Us',
  about_page_content = 'Hizli Carpooling is a community-first carpooling platform focused on safety, simplicity, and fair prices.',

  how_it_works_page_title = 'How it works',
  how_it_works_page_content = '1. Search your route.
2. Pick a ride that matches your needs.
3. Book and travel together.',

  faq_page_title = 'FAQ',
  faq_page_content = 'Q: How do I book a ride?
A: Search your route, open ride details, and send your booking request.

Q: How is payment handled?
A: Payments are arranged directly between members; the platform does not process payments.',

  help_page_title = 'Help Center',
  help_page_content = 'Need help? Contact our support team and include your ride ID and account email for faster resolution.',

  privacy_page_title = 'Privacy Policy',
  privacy_page_content = 'We collect only the data needed to operate Hizli Carpooling and keep the platform safe. We do not sell personal data.',

  terms_page_title = 'Terms of Service',
  terms_page_content = 'By using Hizli Carpooling, you agree to respect other members, provide accurate information, and follow platform rules.'
WHERE id = 1;

-- Creates row id=1 if it does not exist.
INSERT INTO platform_settings (
  id,
  footer_about_us_label,
  footer_about_us_url,
  footer_how_it_works_label,
  footer_how_it_works_url,
  footer_faq_label,
  footer_faq_url,
  footer_help_center_label,
  footer_help_center_url,
  footer_privacy_policy_label,
  footer_privacy_policy_url,
  footer_terms_of_service_label,
  footer_terms_of_service_url,
  about_page_title,
  about_page_content,
  how_it_works_page_title,
  how_it_works_page_content,
  faq_page_title,
  faq_page_content,
  help_page_title,
  help_page_content,
  privacy_page_title,
  privacy_page_content,
  terms_page_title,
  terms_page_content
)
SELECT
  1,
  'About Us',
  '/about',
  'How it works',
  '/how-it-works',
  'FAQ',
  '/faq',
  'Help Center',
  '/help',
  'Privacy Policy',
  '/privacy',
  'Terms of Service',
  '/terms',
  'About Us',
  'Hizli Carpooling is a community-first carpooling platform focused on safety, simplicity, and fair prices.',
  'How it works',
  '1. Search your route.
2. Pick a ride that matches your needs.
3. Book and travel together.',
  'FAQ',
  'Q: How do I book a ride?
A: Search your route, open ride details, and send your booking request.

Q: How is payment handled?
A: Payments are arranged directly between members; the platform does not process payments.',
  'Help Center',
  'Need help? Contact our support team and include your ride ID and account email for faster resolution.',
  'Privacy Policy',
  'We collect only the data needed to operate Hizli Carpooling and keep the platform safe. We do not sell personal data.',
  'Terms of Service',
  'By using Hizli Carpooling, you agree to respect other members, provide accurate information, and follow platform rules.'
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE id = 1);
