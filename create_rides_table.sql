-- Create rides table
CREATE TABLE IF NOT EXISTS rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  departure TEXT NOT NULL,
  arrival TEXT NOT NULL,
  pickup TEXT NOT NULL,
  dropoff TEXT NOT NULL,
  ride_date TIMESTAMP WITH TIME ZONE NOT NULL,
  seats INTEGER NOT NULL CHECK (seats > 0),
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  girls_only BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE rides ENABLE ROW LEVEL SECURITY;

-- Drivers can read their own rides
CREATE POLICY "Drivers can read their own rides" ON rides
  FOR SELECT
  USING (auth.uid() = driver_id);

-- Drivers can publish rides only if they are verified
CREATE POLICY "Verified drivers can publish rides" ON rides
  FOR INSERT
  WITH CHECK (
    auth.uid() = driver_id
    AND EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
      AND p.is_verified = TRUE
    )
  );

-- Drivers can update their own rides
CREATE POLICY "Drivers can update their own rides" ON rides
  FOR UPDATE
  USING (auth.uid() = driver_id)
  WITH CHECK (auth.uid() = driver_id);

-- Drivers can delete their own rides
CREATE POLICY "Drivers can delete their own rides" ON rides
  FOR DELETE
  USING (auth.uid() = driver_id);

-- Keep updated_at in sync
DROP TRIGGER IF EXISTS set_rides_updated_at ON rides;

CREATE TRIGGER set_rides_updated_at
  BEFORE UPDATE ON rides
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();
