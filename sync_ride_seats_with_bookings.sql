-- Allow rides to reach 0 remaining seats
ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_seats_check;
ALTER TABLE rides ADD CONSTRAINT rides_seats_check CHECK (seats >= 0);

-- Keep remaining ride seats synchronized with bookings
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
