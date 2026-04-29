-- Fresh start reset for admin/testing data
-- Run in Supabase SQL Editor (as project owner) when you want a clean slate.
-- This script keeps auth users and profiles, but clears operational/admin data.

BEGIN;

-- 1) Clear app operational data (order avoids FK issues)
TRUNCATE TABLE
  public.support_messages,
  public.support_tickets,
  public.reviews,
  public.reports,
  public.verification_documents,
  public.bookings,
  public.rides
RESTART IDENTITY CASCADE;

-- 2) Clear transactions only if the table exists in this environment
DO $$
BEGIN
  IF to_regclass('public.transactions') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.transactions RESTART IDENTITY CASCADE';
  END IF;
END $$;

-- 3) Clear uploaded files used by the app (keeps buckets, removes objects)
DELETE FROM storage.objects
WHERE bucket_id IN ('verification-documents', 'profile-photos');

-- 4) Reset platform settings to defaults (single-row table, id=1)
INSERT INTO public.platform_settings (
  id,
  commission_percent,
  max_seats,
  max_price,
  footer_brand_description,
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
  terms_page_content,
  updated_at
)
VALUES (
  1,
  10.00,
  6,
  200.00,
  'A carpooling platform that connects people.',
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
  '1. Search your route.' || E'\n' || '2. Pick a ride that matches your needs.' || E'\n' || '3. Book and travel together.',
  'FAQ',
  'Q: How do I book a ride?' || E'\n' || 'A: Search your route, open ride details, and book your seat.' || E'\n\n' || 'Q: Is payment secure?' || E'\n' || 'A: Yes, payments are processed through secure providers.',
  'Help Center',
  'Need help? Contact our support team and include your ride ID and account email for faster resolution.',
  'Privacy Policy',
  'We collect only the data needed to operate Hizli Carpooling and keep the platform safe. We do not sell personal data.',
  'Terms of Service',
  'By using Hizli Carpooling, you agree to respect other members, provide accurate information, and follow platform rules.',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  commission_percent = EXCLUDED.commission_percent,
  max_seats = EXCLUDED.max_seats,
  max_price = EXCLUDED.max_price,
  footer_brand_description = EXCLUDED.footer_brand_description,
  footer_about_us_label = EXCLUDED.footer_about_us_label,
  footer_about_us_url = EXCLUDED.footer_about_us_url,
  footer_how_it_works_label = EXCLUDED.footer_how_it_works_label,
  footer_how_it_works_url = EXCLUDED.footer_how_it_works_url,
  footer_faq_label = EXCLUDED.footer_faq_label,
  footer_faq_url = EXCLUDED.footer_faq_url,
  footer_help_center_label = EXCLUDED.footer_help_center_label,
  footer_help_center_url = EXCLUDED.footer_help_center_url,
  footer_privacy_policy_label = EXCLUDED.footer_privacy_policy_label,
  footer_privacy_policy_url = EXCLUDED.footer_privacy_policy_url,
  footer_terms_of_service_label = EXCLUDED.footer_terms_of_service_label,
  footer_terms_of_service_url = EXCLUDED.footer_terms_of_service_url,
  about_page_title = EXCLUDED.about_page_title,
  about_page_content = EXCLUDED.about_page_content,
  how_it_works_page_title = EXCLUDED.how_it_works_page_title,
  how_it_works_page_content = EXCLUDED.how_it_works_page_content,
  faq_page_title = EXCLUDED.faq_page_title,
  faq_page_content = EXCLUDED.faq_page_content,
  help_page_title = EXCLUDED.help_page_title,
  help_page_content = EXCLUDED.help_page_content,
  privacy_page_title = EXCLUDED.privacy_page_title,
  privacy_page_content = EXCLUDED.privacy_page_content,
  terms_page_title = EXCLUDED.terms_page_title,
  terms_page_content = EXCLUDED.terms_page_content,
  updated_at = NOW();

COMMIT;

-- Optional: remove all profiles except one admin account (DANGEROUS)
-- Uncomment and replace the email before running if you really want this behavior.
-- DELETE FROM public.profiles WHERE lower(coalesce(email, '')) <> lower('hizli.carpooling@gmail.com');
