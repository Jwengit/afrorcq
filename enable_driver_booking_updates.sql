-- Allow drivers to update bookings for rides they own
DROP POLICY IF EXISTS "Drivers can update bookings for their rides" ON bookings;

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
