-- Recalculate remaining seats for all rides based on existing active bookings.
-- Run this ONCE after applying sync_ride_seats_with_bookings.sql.
-- Assumes rides.seats currently holds the original total set by the driver
-- (i.e. the sync trigger was not active when those bookings were created).

UPDATE rides
SET seats = GREATEST(
  0,
  rides.seats - COALESCE((
    SELECT SUM(seats_booked)
    FROM bookings
    WHERE bookings.ride_id = rides.id
      AND bookings.status IN ('Pending', 'Confirmed')
  ), 0)
);
