-- Sync verification status labels and clean obvious bad last_name values.
-- Safe to run multiple times.

-- 1) Keep legacy text status consistent with boolean verification flag.
UPDATE public.profiles
SET
  status = CASE WHEN COALESCE(is_verified, false) THEN 'Verified' ELSE 'Unverified' END,
  updated_at = NOW()
WHERE status IS DISTINCT FROM CASE WHEN COALESCE(is_verified, false) THEN 'Verified' ELSE 'Unverified' END;

-- 2) Cleanup invalid last_name values accidentally saved as gender labels.
UPDATE public.profiles
SET
  last_name = NULL,
  updated_at = NOW()
WHERE LOWER(COALESCE(last_name, '')) IN ('male', 'female')
  AND LOWER(COALESCE(gender, '')) = LOWER(COALESCE(last_name, ''));
