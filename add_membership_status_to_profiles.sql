-- Add membership status fields to profiles for membership validity checks.
-- Safe to run multiple times.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_paid BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS profiles_membership_expires_at_idx
  ON public.profiles (membership_expires_at);
