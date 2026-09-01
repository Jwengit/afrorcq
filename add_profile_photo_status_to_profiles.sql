ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_photo_status TEXT;

UPDATE public.profiles
SET profile_photo_status = 'pending'
WHERE profile_photo_url IS NOT NULL
  AND profile_photo_status IS NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_profile_photo_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_profile_photo_status_check
  CHECK (profile_photo_status IN ('pending', 'approved', 'rejected'));
