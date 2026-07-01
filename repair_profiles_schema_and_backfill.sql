-- Repair profiles schema and backfill rows from auth.users
-- Safe to run multiple times in Supabase SQL Editor

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Ensure all columns used by profile/admin pages exist
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS city_of_birth TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS zip_code TEXT,
  ADD COLUMN IF NOT EXISTS car_make TEXT,
  ADD COLUMN IF NOT EXISTS car_year INTEGER,
  ADD COLUMN IF NOT EXISTS insurance_company TEXT,
  ADD COLUMN IF NOT EXISTS plate_number TEXT,
  ADD COLUMN IF NOT EXISTS proof_of_resident_type TEXT,
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS languages TEXT[],
  ADD COLUMN IF NOT EXISTS ride_preferences TEXT[],
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS user_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Unverified',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL;

-- Ensure first_name is always present (historical NOT NULL compatibility)
UPDATE public.profiles
SET first_name = 'User'
WHERE first_name IS NULL OR btrim(first_name) = '';

-- Backfill one profile row per auth user if missing
INSERT INTO public.profiles (
  id,
  first_name,
  last_name,
  email,
  is_verified,
  user_status,
  created_at,
  updated_at
)
SELECT
  u.id,
  COALESCE(
    NULLIF(u.raw_user_meta_data ->> 'first_name', ''),
    NULLIF(split_part(COALESCE(u.raw_user_meta_data ->> 'full_name', ''), ' ', 1), ''),
    NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
    'User'
  ) AS first_name,
  NULLIF(u.raw_user_meta_data ->> 'last_name', '') AS last_name,
  u.email,
  FALSE,
  'active',
  COALESCE(u.created_at, NOW()),
  NOW()
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- Fill missing email from auth.users when possible
UPDATE public.profiles p
SET
  email = u.email,
  updated_at = NOW()
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR btrim(p.email) = '');

-- Keep legacy status and is_verified consistent
UPDATE public.profiles
SET
  is_verified = TRUE,
  status = 'Verified',
  updated_at = NOW()
WHERE LOWER(COALESCE(status, '')) = 'verified';

UPDATE public.profiles
SET
  status = CASE WHEN is_verified THEN 'Verified' ELSE 'Unverified' END,
  updated_at = NOW()
WHERE status IS NULL OR btrim(status) = '';

-- Enforce valid user_status values
UPDATE public.profiles
SET user_status = 'active'
WHERE user_status IS NULL OR user_status NOT IN ('active', 'suspended', 'banned');

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_user_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_user_status_check
  CHECK (user_status IN ('active', 'suspended', 'banned'));

-- Ensure public profile read policy is present
DROP POLICY IF EXISTS "Enable select for own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view public profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

CREATE POLICY "Authenticated users can view public profiles" ON public.profiles
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
