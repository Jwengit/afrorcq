-- Ensure user_status exists on profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS user_status TEXT DEFAULT 'active' CHECK (user_status IN ('active', 'suspended', 'banned'));

-- Backfill nullable/empty values if any
UPDATE profiles
SET user_status = 'active'
WHERE user_status IS NULL;