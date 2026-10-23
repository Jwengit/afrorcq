-- Allow complete unpaid, unverified members to publish unverified rides.
-- Verified members still need approved vehicle details and driver documents.
BEGIN;

DROP POLICY IF EXISTS "Drivers can publish rides" ON public.rides;
DROP POLICY IF EXISTS "Verified drivers can publish rides" ON public.rides;
DROP POLICY IF EXISTS "Members can publish eligible rides" ON public.rides;

CREATE OR REPLACE FUNCTION public.profile_has_selected_options(raw_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(translate(coalesce(raw_value, ''), '{}[]" ,', '')) <> '';
$$;

CREATE POLICY "Members can publish eligible rides" ON public.rides
  FOR INSERT
  WITH CHECK (
    auth.uid() = driver_id
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND coalesce(p.user_status, 'active') NOT IN ('suspended', 'banned')
        AND coalesce(p.review_pending, FALSE) IS FALSE
        AND p.profile_photo_status = 'approved'
        AND coalesce(nullif(btrim(p.profile_photo_url), ''), NULL) IS NOT NULL
        AND (
          (
            p.status IN ('free', 'pending')
            AND coalesce(p.is_verified, FALSE) IS FALSE
            AND coalesce(p.membership_paid, FALSE) IS FALSE
            AND coalesce(nullif(btrim(p.first_name), ''), NULL) IS NOT NULL
            AND coalesce(nullif(btrim(p.last_name), ''), NULL) IS NOT NULL
            AND coalesce(nullif(btrim(p.gender), ''), NULL) IS NOT NULL
            AND coalesce(nullif(btrim(p.phone_number), ''), NULL) IS NOT NULL
            AND p.date_of_birth IS NOT NULL
            AND coalesce(nullif(btrim(p.city_of_birth), ''), NULL) IS NOT NULL
            AND coalesce(nullif(btrim(p.address), ''), NULL) IS NOT NULL
            AND coalesce(nullif(btrim(p.zip_code), ''), NULL) IS NOT NULL
            AND coalesce(nullif(btrim(p.bio), ''), NULL) IS NOT NULL
            AND public.profile_has_selected_options(p.languages::text)
            AND public.profile_has_selected_options(p.ride_preferences::text)
          )
          OR
          (
            p.status = 'verified'
            AND p.is_verified IS TRUE
            AND p.membership_paid IS TRUE
            AND p.membership_expires_at > NOW()
            AND coalesce(nullif(btrim(p.car_make), ''), NULL) IS NOT NULL
            AND p.car_year IS NOT NULL
            AND coalesce(nullif(btrim(p.color), ''), NULL) IS NOT NULL
            AND public.driver_has_required_verification_docs(p.id)
          )
        )
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_driver_car_info_before_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  eligible_free_member BOOLEAN;
  eligible_verified_member BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = NEW.driver_id
      AND p.status IN ('free', 'pending')
      AND coalesce(p.is_verified, FALSE) IS FALSE
      AND coalesce(p.membership_paid, FALSE) IS FALSE
      AND coalesce(p.user_status, 'active') NOT IN ('suspended', 'banned')
      AND coalesce(p.review_pending, FALSE) IS FALSE
      AND p.profile_photo_status = 'approved'
      AND coalesce(nullif(btrim(p.profile_photo_url), ''), NULL) IS NOT NULL
      AND coalesce(nullif(btrim(p.first_name), ''), NULL) IS NOT NULL
      AND coalesce(nullif(btrim(p.last_name), ''), NULL) IS NOT NULL
      AND coalesce(nullif(btrim(p.gender), ''), NULL) IS NOT NULL
      AND coalesce(nullif(btrim(p.phone_number), ''), NULL) IS NOT NULL
      AND p.date_of_birth IS NOT NULL
      AND coalesce(nullif(btrim(p.city_of_birth), ''), NULL) IS NOT NULL
      AND coalesce(nullif(btrim(p.address), ''), NULL) IS NOT NULL
      AND coalesce(nullif(btrim(p.zip_code), ''), NULL) IS NOT NULL
      AND coalesce(nullif(btrim(p.bio), ''), NULL) IS NOT NULL
      AND public.profile_has_selected_options(p.languages::text)
      AND public.profile_has_selected_options(p.ride_preferences::text)
  )
  INTO eligible_free_member;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = NEW.driver_id
      AND p.status = 'verified'
      AND p.is_verified IS TRUE
      AND p.membership_paid IS TRUE
      AND p.membership_expires_at > NOW()
      AND coalesce(p.user_status, 'active') NOT IN ('suspended', 'banned')
      AND coalesce(p.review_pending, FALSE) IS FALSE
      AND p.profile_photo_status = 'approved'
      AND coalesce(nullif(btrim(p.profile_photo_url), ''), NULL) IS NOT NULL
      AND coalesce(nullif(btrim(p.car_make), ''), NULL) IS NOT NULL
      AND p.car_year IS NOT NULL
      AND coalesce(nullif(btrim(p.color), ''), NULL) IS NOT NULL
      AND public.driver_has_required_verification_docs(p.id)
  )
  INTO eligible_verified_member;

  IF eligible_free_member IS NOT TRUE AND eligible_verified_member IS NOT TRUE THEN
    RAISE EXCEPTION 'Complete your free profile and get your profile photo approved, or become an active verified member with approved driver documents to publish a ride.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
