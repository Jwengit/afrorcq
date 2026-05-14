-- Enforce: a profile cannot be marked as verified without a profile photo.

-- 1) Repair existing inconsistent rows.
UPDATE profiles
SET
  is_verified = false,
  status = CASE WHEN status = 'Verified' THEN 'Unverified' ELSE status END,
  updated_at = NOW()
WHERE
  is_verified = true
  AND COALESCE(NULLIF(BTRIM(profile_photo_url), ''), NULL) IS NULL;

-- 2) Add a database-level guard.
ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS profiles_verified_requires_photo_check;

ALTER TABLE profiles
ADD CONSTRAINT profiles_verified_requires_photo_check
CHECK (
  is_verified IS DISTINCT FROM true
  OR COALESCE(NULLIF(BTRIM(profile_photo_url), ''), NULL) IS NOT NULL
);
