-- Create bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seats_booked INTEGER NOT NULL CHECK (seats_booked > 0),
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Passengers can read their own bookings
CREATE POLICY "Passengers can read their own bookings" ON bookings
  FOR SELECT
  USING (auth.uid() = passenger_id);

-- Drivers can read bookings for their rides
CREATE POLICY "Drivers can read bookings for their rides" ON bookings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM rides r
      WHERE r.id = bookings.ride_id
      AND r.driver_id = auth.uid()
    )
  );

-- Passengers can create bookings
CREATE POLICY "Passengers can create bookings" ON bookings
  FOR INSERT
  WITH CHECK (auth.uid() = passenger_id);

-- Passengers can update their own bookings
CREATE POLICY "Passengers can update their own bookings" ON bookings
  FOR UPDATE
  USING (auth.uid() = passenger_id)
  WITH CHECK (auth.uid() = passenger_id);

-- Drivers can confirm or reject bookings on their rides
CREATE POLICY "Drivers can update bookings for their rides" ON bookings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM rides r
      WHERE r.id = bookings.ride_id
      AND r.driver_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM rides r
      WHERE r.id = bookings.ride_id
      AND r.driver_id = auth.uid()
    )
  );

-- Passengers can delete their own bookings
CREATE POLICY "Passengers can delete their own bookings" ON bookings
  FOR DELETE
  USING (auth.uid() = passenger_id);

-- Keep updated_at in sync
DROP TRIGGER IF EXISTS set_bookings_updated_at ON bookings;

CREATE TRIGGER set_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();
