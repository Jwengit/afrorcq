-- Create reports table for admin moderation workflow
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ride_id UUID REFERENCES public.rides(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('behavior', 'spam', 'payment_issue')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ignored', 'resolved')),
  action_taken TEXT,
  admin_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Ensure columns exist even if table was created earlier with a different shape
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ride_id UUID REFERENCES public.rides(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS action_taken TEXT,
  ADD COLUMN IF NOT EXISTS admin_note TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

UPDATE public.reports
SET status = 'pending'
WHERE status IS NULL;

UPDATE public.reports
SET type = 'behavior'
WHERE type IS NULL;

ALTER TABLE public.reports
  ALTER COLUMN type SET NOT NULL,
  ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_type_check'
  ) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_type_check
      CHECK (type IN ('behavior', 'spam', 'payment_issue'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_status_check'
  ) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_status_check
      CHECK (status IN ('pending', 'ignored', 'resolved'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_type ON public.reports(type);
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON public.reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_ride_id ON public.reports(ride_id);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admin read reports" ON public.reports;
CREATE POLICY "Allow admin read reports" ON public.reports
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow admin update reports" ON public.reports;
CREATE POLICY "Allow admin update reports" ON public.reports
  FOR UPDATE USING (true);