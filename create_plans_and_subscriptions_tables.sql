-- Create plans table for membership tiers
CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code TEXT NOT NULL UNIQUE CHECK (plan_code IN ('explorer', 'student', 'standard')),
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  stripe_price_id TEXT UNIQUE,
  trial_days INTEGER DEFAULT 30,
  features TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  plan_code TEXT NOT NULL REFERENCES public.plans(plan_code),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  trial_end_at TIMESTAMP WITH TIME ZONE,
  period_start_at TIMESTAMP WITH TIME ZONE,
  period_end_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Add verification_status to profiles if it doesn't exist
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'unverified' 
    CHECK (verification_status IN ('unverified', 'pending_review', 'verified', 'rejected'));

-- Backfill verification_status from is_verified
UPDATE public.profiles
SET verification_status = CASE 
  WHEN is_verified = TRUE THEN 'verified'
  ELSE 'unverified'
END
WHERE verification_status IS NULL;

-- Add trial tracking to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS membership_plan TEXT DEFAULT 'explorer'
    CHECK (membership_plan IN ('explorer', 'student', 'standard'));

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_profiles_verification_status ON public.profiles(verification_status);
CREATE INDEX IF NOT EXISTS idx_profiles_membership_plan ON public.profiles(membership_plan);

-- Insert default plans
INSERT INTO public.plans (plan_code, name, price_cents, trial_days, features, is_active)
VALUES
  ('explorer', 'Explorer', 0, 0, ARRAY['post_rides', 'find_rides', 'messaging', 'basic_profile'], TRUE),
  ('student', 'Premium Student', 2500, 30, ARRAY['post_rides', 'find_rides', 'messaging', 'verified_badge', 'full_profile', 'priority_support', 'advanced_filters'], TRUE),
  ('standard', 'Premium Standard', 3500, 30, ARRAY['post_rides', 'find_rides', 'messaging', 'verified_badge', 'full_profile', 'priority_support', 'advanced_filters', 'analytics'], TRUE)
ON CONFLICT (plan_code) DO UPDATE SET
  name = EXCLUDED.name,
  price_cents = EXCLUDED.price_cents,
  trial_days = EXCLUDED.trial_days,
  updated_at = NOW();

-- Enable RLS
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS: Plans are public read-only
DROP POLICY IF EXISTS "Anyone can read plans" ON public.plans;
CREATE POLICY "Anyone can read plans" ON public.plans
  FOR SELECT
  USING (TRUE);

-- RLS: Users can read their own subscription
DROP POLICY IF EXISTS "Users can read own subscription" ON public.subscriptions;
CREATE POLICY "Users can read own subscription" ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS: Admins can read all subscriptions
DROP POLICY IF EXISTS "Admins can read all subscriptions" ON public.subscriptions;
CREATE POLICY "Admins can read all subscriptions" ON public.subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = TRUE
    )
  );

-- RLS: Only backend can insert/update subscriptions
DROP POLICY IF EXISTS "Service role manages subscriptions" ON public.subscriptions;
CREATE POLICY "Service role manages subscriptions" ON public.subscriptions
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role updates subscriptions" ON public.subscriptions;
CREATE POLICY "Service role updates subscriptions" ON public.subscriptions
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- Function to update subscription from Stripe webhook
CREATE OR REPLACE FUNCTION public.handle_stripe_subscription_update(
  p_stripe_subscription_id TEXT,
  p_status TEXT,
  p_trial_end_at TIMESTAMP WITH TIME ZONE,
  p_period_start_at TIMESTAMP WITH TIME ZONE,
  p_period_end_at TIMESTAMP WITH TIME ZONE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.subscriptions
  SET
    status = p_status,
    trial_end_at = p_trial_end_at,
    period_start_at = p_period_start_at,
    period_end_at = p_period_end_at,
    updated_at = NOW()
  WHERE stripe_subscription_id = p_stripe_subscription_id;
END;
$$;
