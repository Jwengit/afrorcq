-- Ensure average_rating exists on profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2) DEFAULT NULL;