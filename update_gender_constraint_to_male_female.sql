-- Update gender column constraint to only allow male and female (lowercase)
-- Safe to run multiple times

-- Drop the old constraint if it exists
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_gender_check;

-- Add new constraint with only male and female (lowercase for consistency)
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_gender_check 
  CHECK (gender IN ('male', 'female'));

-- Normalize existing values to match constraint
UPDATE public.profiles
SET gender = 'male'
WHERE LOWER(gender) = 'male';

UPDATE public.profiles
SET gender = 'female'
WHERE LOWER(gender) = 'female';

-- Set NULL for any other invalid values that don't match
UPDATE public.profiles
SET gender = NULL
WHERE gender NOT IN ('male', 'female');
