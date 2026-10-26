-- Add member confirmations to reviews for payment and trip safety.
-- Unchecked boxes are stored as false and are not treated as a negative report.
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS transaction_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS safe_trip_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
