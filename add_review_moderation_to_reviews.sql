-- Add moderation workflow to reviews
-- Run this on existing deployments where reviews table already exists

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS admin_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

UPDATE public.reviews
SET status = 'pending'
WHERE status IS NULL;

ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_status_check;

ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_reviews_status ON public.reviews(status);

CREATE OR REPLACE FUNCTION public.set_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reviews_set_updated_at ON public.reviews;
CREATE TRIGGER reviews_set_updated_at
BEFORE UPDATE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.set_reviews_updated_at();

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read reviews" ON public.reviews;
DROP POLICY IF EXISTS "Allow public read approved reviews" ON public.reviews;
CREATE POLICY "Allow public read approved reviews" ON public.reviews
  FOR SELECT
  USING (status = 'approved');

DROP POLICY IF EXISTS "Allow reviewer read own reviews" ON public.reviews;
CREATE POLICY "Allow reviewer read own reviews" ON public.reviews
  FOR SELECT
  USING (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "Allow admin read reviews" ON public.reviews;
CREATE POLICY "Allow admin read reviews" ON public.reviews
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Allow users to create their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Allow users to create own pending reviews" ON public.reviews;
CREATE POLICY "Allow users to create own pending reviews" ON public.reviews
  FOR INSERT
  WITH CHECK (
    auth.uid() = reviewer_id
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

DROP POLICY IF EXISTS "Prevent review modifications" ON public.reviews;
DROP POLICY IF EXISTS "Allow admin update reviews" ON public.reviews;
CREATE POLICY "Allow admin update reviews" ON public.reviews
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

DROP POLICY IF EXISTS "Prevent review deletion" ON public.reviews;
CREATE POLICY "Prevent review deletion" ON public.reviews
  FOR DELETE
  USING (false);
