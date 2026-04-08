-- Add user status and rating columns to profiles table
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS user_status TEXT DEFAULT 'active' CHECK (user_status IN ('active', 'suspended', 'banned')),
  ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2) DEFAULT NULL;
