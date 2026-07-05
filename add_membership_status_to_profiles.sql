-- Add membership status fields to profiles for membership validity checks.
-- Safe to run multiple times.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS membership_paid BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMPTZ;

-- Normalize legacy status values to the new membership-access statuses.
UPDATE public.profiles
SET status = CASE
  WHEN LOWER(TRIM(COALESCE(status, ''))) IN ('verified') THEN 'verified'
  WHEN LOWER(TRIM(COALESCE(status, ''))) IN ('pending', 'approved') THEN 'pending'
  ELSE 'free'
END
WHERE status IS DISTINCT FROM CASE
  WHEN LOWER(TRIM(COALESCE(status, ''))) IN ('verified') THEN 'verified'
  WHEN LOWER(TRIM(COALESCE(status, ''))) IN ('pending', 'approved') THEN 'pending'
  ELSE 'free'
END;

ALTER TABLE public.profiles
  ALTER COLUMN status SET DEFAULT 'free';

UPDATE public.profiles
SET status = 'free'
WHERE status IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'profiles_status_membership_check'
      AND n.nspname = 'public'
      AND t.relname = 'profiles'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_status_membership_check
      CHECK (status IN ('free', 'pending', 'verified'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS profiles_membership_expires_at_idx
  ON public.profiles (membership_expires_at);
