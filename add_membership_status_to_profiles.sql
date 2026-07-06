-- Add membership status fields to profiles for membership validity checks.
-- Safe to run multiple times.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS membership_paid BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMPTZ;

-- Normalize legacy status values to the new membership-access statuses.
-- This handles weird whitespace (including non-breaking spaces) and mixed casing.
UPDATE public.profiles
SET status = CASE
  WHEN LOWER(BTRIM(REGEXP_REPLACE(REPLACE(COALESCE(status, ''), CHR(160), ' '), '[[:space:]]+', ' ', 'g'))) = 'verified' THEN 'verified'
  WHEN LOWER(BTRIM(REGEXP_REPLACE(REPLACE(COALESCE(status, ''), CHR(160), ' '), '[[:space:]]+', ' ', 'g'))) IN ('pending', 'approved') THEN 'pending'
  ELSE 'free'
END;

ALTER TABLE public.profiles
  ALTER COLUMN status SET DEFAULT 'free';

UPDATE public.profiles
SET status = 'free'
WHERE status IS NULL
   OR status NOT IN ('free', 'pending', 'verified');

ALTER TABLE public.profiles
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_status_membership_check;

-- Add as NOT VALID so migration never blocks on historical drift.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_membership_check
  CHECK (status IN ('free', 'pending', 'verified'))
  NOT VALID;

CREATE INDEX IF NOT EXISTS profiles_membership_expires_at_idx
  ON public.profiles (membership_expires_at);

COMMIT;
