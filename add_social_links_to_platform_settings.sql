-- Add editable social network links for landing/footer.
-- Safe to run multiple times.

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS social_facebook_url TEXT,
  ADD COLUMN IF NOT EXISTS social_instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS social_youtube_url TEXT;

UPDATE public.platform_settings
SET
  social_facebook_url = COALESCE(NULLIF(TRIM(social_facebook_url), ''), 'https://www.facebook.com'),
  social_instagram_url = COALESCE(NULLIF(TRIM(social_instagram_url), ''), 'https://www.instagram.com'),
  social_youtube_url = COALESCE(NULLIF(TRIM(social_youtube_url), ''), 'https://www.youtube.com')
WHERE id = 1;
