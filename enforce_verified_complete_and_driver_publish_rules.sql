-- Enforce account and publishing rules at database level.
-- 1) Verified accounts must be complete.
-- 2) Drivers must have car info before publishing rides.

-- Normalize document types so legacy aliases are handled consistently.
CREATE OR REPLACE FUNCTION public.normalize_verification_document_type(raw_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(coalesce(raw_type, '')) IN ('identity', 'id_card') THEN 'identity_card'
    WHEN lower(coalesce(raw_type, '')) IN ('license', 'driving_license') THEN 'driver_license'
    WHEN lower(coalesce(raw_type, '')) = 'insurance_proof' THEN 'insurance'
    WHEN lower(coalesce(raw_type, '')) IN ('registration', 'vehicle_papers') THEN 'vehicle_registration'
    ELSE lower(coalesce(raw_type, ''))
  END;
$$;

-- Check if a user has all approved verification documents required for account verification.
CREATE OR REPLACE FUNCTION public.profile_has_required_verification_docs(
  p_user_id UUID,
  p_is_driver BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  approved_types TEXT[];
BEGIN
  SELECT COALESCE(
    array_agg(DISTINCT public.normalize_verification_document_type(document_type)),
    ARRAY[]::TEXT[]
  )
  INTO approved_types
  FROM public.verification_documents
  WHERE user_id = p_user_id
    AND lower(coalesce(status, '')) = 'approved';

  IF NOT (
    'identity_card' = ANY(approved_types)
    AND 'proof_of_address' = ANY(approved_types)
  ) THEN
    RETURN FALSE;
  END IF;

  IF p_is_driver THEN
    RETURN (
      'driver_license' = ANY(approved_types)
      AND 'insurance' = ANY(approved_types)
      AND 'vehicle_registration' = ANY(approved_types)
    );
  END IF;

  RETURN TRUE;
END;
$$;

-- Enforce "verified implies complete" whenever profiles are inserted or updated.
CREATE OR REPLACE FUNCTION public.enforce_verified_requires_complete_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  is_driver BOOLEAN;
  has_required_docs BOOLEAN;
BEGIN
  IF coalesce(NEW.is_verified, FALSE) THEN
    IF coalesce(nullif(btrim(NEW.profile_photo_url), ''), NULL) IS NULL THEN
      RAISE EXCEPTION 'Profile photo is required before marking an account as verified.'
        USING ERRCODE = '23514';
    END IF;

    IF coalesce(nullif(btrim(NEW.first_name), ''), NULL) IS NULL
      OR coalesce(nullif(btrim(NEW.last_name), ''), NULL) IS NULL
      OR coalesce(nullif(btrim(NEW.gender), ''), NULL) IS NULL THEN
      RAISE EXCEPTION 'first_name, last_name, and gender are required before marking an account as verified.'
        USING ERRCODE = '23514';
    END IF;

    is_driver :=
      coalesce(nullif(btrim(NEW.car_make), ''), NULL) IS NOT NULL
      OR coalesce(nullif(btrim(NEW.plate_number), ''), NULL) IS NOT NULL;

    has_required_docs := public.profile_has_required_verification_docs(NEW.id, is_driver);
    IF NOT has_required_docs THEN
      RAISE EXCEPTION 'Required verification documents must be approved before marking an account as verified.'
        USING ERRCODE = '23514';
    END IF;

    NEW.status := 'Verified';
  ELSIF NEW.status = 'Verified' THEN
    NEW.status := 'Unverified';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_enforce_verified_complete_profile ON public.profiles;

CREATE TRIGGER profiles_enforce_verified_complete_profile
BEFORE INSERT OR UPDATE OF
  is_verified,
  first_name,
  last_name,
  gender,
  profile_photo_url,
  car_make,
  plate_number,
  status
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_verified_requires_complete_profile();

-- Repair already inconsistent rows so existing data respects the new invariant.
UPDATE public.profiles p
SET
  is_verified = FALSE,
  status = CASE WHEN p.status = 'Verified' THEN 'Unverified' ELSE p.status END,
  updated_at = NOW()
WHERE
  coalesce(p.is_verified, FALSE) = TRUE
  AND (
    coalesce(nullif(btrim(p.profile_photo_url), ''), NULL) IS NULL
    OR coalesce(nullif(btrim(p.first_name), ''), NULL) IS NULL
    OR coalesce(nullif(btrim(p.last_name), ''), NULL) IS NULL
    OR coalesce(nullif(btrim(p.gender), ''), NULL) IS NULL
    OR NOT public.profile_has_required_verification_docs(
      p.id,
      coalesce(nullif(btrim(p.car_make), ''), NULL) IS NOT NULL
      OR coalesce(nullif(btrim(p.plate_number), ''), NULL) IS NOT NULL
    )
  );

-- Harden rides insert policy: a driver can publish only if car info is complete.
DROP POLICY IF EXISTS "Drivers can publish rides" ON public.rides;

CREATE POLICY "Drivers can publish rides" ON public.rides
  FOR INSERT
  WITH CHECK (
    auth.uid() = driver_id
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND coalesce(nullif(btrim(p.car_make), ''), NULL) IS NOT NULL
        AND p.car_year IS NOT NULL
        AND coalesce(nullif(btrim(p.plate_number), ''), NULL) IS NOT NULL
    )
  );

-- Extra guard for non-RLS code paths (service-role or direct SQL).
CREATE OR REPLACE FUNCTION public.enforce_driver_car_info_before_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  has_car_info BOOLEAN;
BEGIN
  SELECT (
    coalesce(nullif(btrim(p.car_make), ''), NULL) IS NOT NULL
    AND p.car_year IS NOT NULL
    AND coalesce(nullif(btrim(p.plate_number), ''), NULL) IS NOT NULL
  )
  INTO has_car_info
  FROM public.profiles p
  WHERE p.id = NEW.driver_id;

  IF coalesce(has_car_info, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'Driver must complete car_make, car_year, and plate_number before publishing a ride.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rides_require_driver_car_info ON public.rides;

CREATE TRIGGER rides_require_driver_car_info
BEFORE INSERT OR UPDATE OF driver_id
ON public.rides
FOR EACH ROW
EXECUTE FUNCTION public.enforce_driver_car_info_before_publish();
