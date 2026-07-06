-- Add membership_plan column to profiles
-- Stores the plan chosen by the member before document upload
-- Values: 'student' | 'standard' | null (not yet chosen)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS membership_plan TEXT
    CHECK (membership_plan IN ('student', 'standard'));
