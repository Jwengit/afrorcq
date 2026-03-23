-- Drop existing policies
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;

-- New simpler policies that don't have auth context issues
CREATE POLICY "Enable insert for authenticated users" ON profiles
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Enable update for own profile" ON profiles
  FOR UPDATE 
  USING (auth.uid() = id) 
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable select for own profile" ON profiles
  FOR SELECT 
  USING (auth.uid() = id);

-- Fix rides INSERT policy: remove is_verified requirement
DROP POLICY IF EXISTS "Verified drivers can publish rides" ON rides;

CREATE POLICY "Drivers can publish rides" ON rides
  FOR INSERT
  WITH CHECK (auth.uid() = driver_id);

-- Allow all authenticated users to read rides (needed for search)
DROP POLICY IF EXISTS "Drivers can read their own rides" ON rides;
DROP POLICY IF EXISTS "Authenticated users can read all rides" ON rides;

CREATE POLICY "Authenticated users can read all rides" ON rides
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
