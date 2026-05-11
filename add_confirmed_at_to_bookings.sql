-- Add confirmed_at column to bookings for tracking payment/confirmation date
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE;

-- Backfill confirmed_at for already confirmed bookings (optional, here we set it to created_at for legacy data)
UPDATE bookings SET confirmed_at = created_at WHERE status = 'Confirmed' AND confirmed_at IS NULL;
