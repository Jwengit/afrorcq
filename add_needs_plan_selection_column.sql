-- Add needs_plan_selection to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS needs_plan_selection BOOLEAN DEFAULT FALSE;

-- Create index
CREATE INDEX IF NOT EXISTS idx_profiles_needs_plan_selection ON public.profiles(needs_plan_selection)
  WHERE needs_plan_selection = TRUE;
