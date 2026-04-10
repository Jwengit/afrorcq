-- Restore profile read access for authenticated users
-- Safe to run multiple times

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Remove conflicting SELECT policies
DROP POLICY IF EXISTS "Enable select for own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view public profiles" ON public.profiles;

-- Allow any authenticated user to read profiles
CREATE POLICY "Authenticated users can view public profiles" ON public.profiles
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
