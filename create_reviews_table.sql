-- Create reviews table with moderation workflow
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  transaction_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  safe_trip_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- One review per reviewer per ride
  UNIQUE (ride_id, reviewer_id)
);

-- Ensure moderation columns exist for pre-existing deployments
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS transaction_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS safe_trip_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id ON public.reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id ON public.reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_ride_id ON public.reviews(ride_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON public.reviews(status);

-- Auto-update updated_at
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

-- Enable RLS
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Public can only see approved reviews
DROP POLICY IF EXISTS "Allow public read reviews" ON public.reviews;
CREATE POLICY "Allow public read approved reviews" ON public.reviews
  FOR SELECT
  USING (status = 'approved');

-- Reviewers can see their own reviews (including pending/rejected)
DROP POLICY IF EXISTS "Allow reviewer read own reviews" ON public.reviews;
CREATE POLICY "Allow reviewer read own reviews" ON public.reviews
  FOR SELECT
  USING (auth.uid() = reviewer_id);

-- Admin can read all reviews
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

-- Only reviewer can create own reviews and they start as pending
DROP POLICY IF EXISTS "Allow users to create their own reviews" ON public.reviews;
CREATE POLICY "Allow users to create own pending reviews" ON public.reviews
  FOR INSERT
  WITH CHECK (
    auth.uid() = reviewer_id
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

-- Admin can moderate reviews
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

