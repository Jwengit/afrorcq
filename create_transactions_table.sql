-- Simple transactions table for admin overview
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('succeeded', 'failed')),
  refund_status TEXT NOT NULL DEFAULT 'none' CHECK (refund_status IN ('none', 'refunded')),
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'succeeded',
  ADD COLUMN IF NOT EXISTS refund_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

UPDATE public.transactions SET amount = 0 WHERE amount IS NULL;
UPDATE public.transactions SET status = 'succeeded' WHERE status IS NULL;
UPDATE public.transactions SET refund_status = 'none' WHERE refund_status IS NULL;
UPDATE public.transactions SET currency = 'USD' WHERE currency IS NULL;

ALTER TABLE public.transactions
  ALTER COLUMN amount SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN refund_status SET NOT NULL,
  ALTER COLUMN currency SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_status_check'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_status_check
      CHECK (status IN ('succeeded', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_refund_status_check'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_refund_status_check
      CHECK (refund_status IN ('none', 'refunded'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_booking_id ON public.transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admin read transactions" ON public.transactions;
CREATE POLICY "Allow admin read transactions" ON public.transactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow admin update transactions" ON public.transactions;
CREATE POLICY "Allow admin update transactions" ON public.transactions FOR UPDATE USING (true);
