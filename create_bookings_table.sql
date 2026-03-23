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

CREATE OR REPLACE FUNCTION sync_ride_seats_from_bookings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_reserved_seats INTEGER := 0;
  new_reserved_seats INTEGER := 0;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.status IN ('Pending', 'Confirmed') THEN
    old_reserved_seats := OLD.seats_booked;
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.status IN ('Pending', 'Confirmed') THEN
    new_reserved_seats := NEW.seats_booked;
  END IF;

  IF TG_OP <> 'INSERT' AND old_reserved_seats > 0 THEN
    UPDATE rides
    SET seats = seats + old_reserved_seats
    WHERE id = OLD.ride_id;
  END IF;

  IF TG_OP <> 'DELETE' AND new_reserved_seats > 0 THEN
    UPDATE rides
    SET seats = seats - new_reserved_seats
    WHERE id = NEW.ride_id
      AND seats >= new_reserved_seats;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not enough seats available for this ride.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_ride_seats_on_bookings ON bookings;

CREATE TRIGGER sync_ride_seats_on_bookings
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION sync_ride_seats_from_bookings();
