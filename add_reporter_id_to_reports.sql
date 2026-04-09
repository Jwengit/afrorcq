-- Add reporter linkage and secure RLS for reports
-- Run once after create_reports_table.sql if reports already exists

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.reports
SET type = 'behavior'
WHERE type IS NULL;

UPDATE public.reports
SET status = 'pending'
WHERE status IS NULL;

ALTER TABLE public.reports
  ALTER COLUMN type SET NOT NULL,
  ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_type_check'
  ) THEN
    ALTER TABLE public.reports DROP CONSTRAINT reports_type_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_status_check'
  ) THEN
    ALTER TABLE public.reports DROP CONSTRAINT reports_status_check;
  END IF;

  ALTER TABLE public.reports
    ADD CONSTRAINT reports_type_check
    CHECK (type IN ('user', 'ride', 'behavior', 'spam', 'payment_issue'));

  ALTER TABLE public.reports
    ADD CONSTRAINT reports_status_check
    CHECK (status IN ('pending', 'ignored', 'resolved'));
END $$;

CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON public.reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON public.reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_ride_id ON public.reports(ride_id);
CREATE INDEX IF NOT EXISTS idx_reports_type ON public.reports(type);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create own reports" ON public.reports;
CREATE POLICY "Users can create own reports" ON public.reports
  FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Allow admin read reports" ON public.reports;
CREATE POLICY "Allow admin read reports" ON public.reports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Allow admin update reports" ON public.reports;
CREATE POLICY "Allow admin update reports" ON public.reports
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = true
    )
  );
