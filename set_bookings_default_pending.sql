-- Ensure existing bookings table defaults to Pending for new rows
ALTER TABLE bookings
ALTER COLUMN status SET DEFAULT 'Pending';

-- Optional backfill: convert old Confirmed rows to Pending only if you want all existing requests to follow the new workflow
-- UPDATE bookings
-- SET status = 'Pending'
-- WHERE status = 'Confirmed';
