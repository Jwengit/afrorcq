-- Add admin management fields to transactions table.
-- Safe to run multiple times.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS commission_percent  NUMERIC(5,2)  NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS commission_amount   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS driver_payout_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS admin_status        TEXT          NOT NULL DEFAULT 'awaiting_payout',
  ADD COLUMN IF NOT EXISTS payout_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS external_reference  TEXT,
  ADD COLUMN IF NOT EXISTS admin_notes         TEXT;

-- Enforce valid admin_status values
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_admin_status_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_admin_status_check
    CHECK (admin_status IN ('awaiting_payout', 'validated', 'payout_done', 'dispute'));

-- Backfill commission amounts for existing succeeded transactions
UPDATE public.transactions
SET
  commission_percent   = 20,
  commission_amount    = ROUND(amount * 0.20, 2),
  driver_payout_amount = ROUND(amount * 0.80, 2)
WHERE commission_amount IS NULL
  AND amount IS NOT NULL
  AND amount > 0;
