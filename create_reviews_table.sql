-- Create reviews table
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Constraint: one review per reviewer per ride
  UNIQUE(ride_id, reviewer_id)
);

-- Create index for faster lookups
CREATE INDEX idx_reviews_reviewee_id ON public.reviews(reviewee_id);
CREATE INDEX idx_reviews_reviewer_id ON public.reviews(reviewer_id);
CREATE INDEX idx_reviews_ride_id ON public.reviews(ride_id);

-- Enable RLS
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can read reviews (public data)
CREATE POLICY "Allow public read reviews" ON public.reviews
  FOR SELECT USING (true);

-- RLS Policy: Only the reviewer can create their own review
CREATE POLICY "Allow users to create their own reviews" ON public.reviews
  FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);

-- RLS Policy: Prevent deletion and updates (reviews are immutable after creation)
CREATE POLICY "Prevent review modifications" ON public.reviews
  FOR UPDATE USING (false);

CREATE POLICY "Prevent review deletion" ON public.reviews
  FOR DELETE USING (false);


