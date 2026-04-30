-- Add payment method fields to profiles.
-- Safe to run multiple times.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('paypal', 'venmo')),
  ADD COLUMN IF NOT EXISTS paypal_email TEXT,
  ADD COLUMN IF NOT EXISTS venmo_handle TEXT;

-- Remove old refund/payout columns if they exist
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_refund_method_check,
  DROP CONSTRAINT IF EXISTS profiles_preferred_payout_method_check;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS preferred_refund_method,
  DROP COLUMN IF EXISTS refund_paypal_email,
  DROP COLUMN IF EXISTS refund_venmo_handle,
  DROP COLUMN IF EXISTS preferred_payout_method,
  DROP COLUMN IF EXISTS payout_paypal_email,
  DROP COLUMN IF EXISTS payout_venmo_handle;
