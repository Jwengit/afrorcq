-- Allow authenticated users to read public profiles
DROP POLICY IF EXISTS "Authenticated users can view public profiles" ON profiles;

CREATE POLICY "Authenticated users can view public profiles" ON profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');
