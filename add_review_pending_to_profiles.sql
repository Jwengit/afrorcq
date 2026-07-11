-- Add review pending fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS review_pending BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS review_pending_ride_id UUID REFERENCES public.rides(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_review_pending ON public.profiles(review_pending);
CREATE INDEX IF NOT EXISTS idx_profiles_review_pending_ride_id ON public.profiles(review_pending_ride_id);

-- Finds the latest completed ride for which the member has not submitted a review yet.
CREATE OR REPLACE FUNCTION public.find_latest_unreviewed_completed_ride(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH completed_rides AS (
    SELECT b.ride_id, b.updated_at
    FROM public.bookings b
    WHERE b.passenger_id = p_user_id
      AND LOWER(COALESCE(b.status, '')) = 'completed'

    UNION ALL

    SELECT b.ride_id, b.updated_at
    FROM public.rides r
    JOIN public.bookings b ON b.ride_id = r.id
    WHERE r.driver_id = p_user_id
      AND LOWER(COALESCE(b.status, '')) = 'completed'
  ),
  latest_completed_rides AS (
    SELECT ride_id, MAX(updated_at) AS completed_at
    FROM completed_rides
    GROUP BY ride_id
  )
  SELECT lcr.ride_id
  FROM latest_completed_rides lcr
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.reviews rv
    WHERE rv.ride_id = lcr.ride_id
      AND rv.reviewer_id = p_user_id
  )
  ORDER BY lcr.completed_at DESC NULLS LAST
  LIMIT 1;
$$;

-- Recomputes review_pending and review_pending_ride_id for one member.
CREATE OR REPLACE FUNCTION public.refresh_review_pending_for_member(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_verified BOOLEAN := FALSE;
  v_pending_ride_id UUID := NULL;
BEGIN
  SELECT (
    COALESCE(p.is_verified, FALSE)
    OR LOWER(BTRIM(COALESCE(p.status, ''))) = 'verified'
  )
  INTO v_is_verified
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Rule applies only to verified members.
  IF NOT v_is_verified THEN
    UPDATE public.profiles
    SET review_pending = FALSE,
        review_pending_ride_id = NULL,
        updated_at = TIMEZONE('utc'::text, NOW())
    WHERE id = p_user_id
      AND (
        review_pending IS DISTINCT FROM FALSE
        OR review_pending_ride_id IS NOT NULL
      );
    RETURN;
  END IF;

  SELECT public.find_latest_unreviewed_completed_ride(p_user_id)
  INTO v_pending_ride_id;

  UPDATE public.profiles
  SET review_pending = (v_pending_ride_id IS NOT NULL),
      review_pending_ride_id = v_pending_ride_id,
      updated_at = TIMEZONE('utc'::text, NOW())
  WHERE id = p_user_id
    AND (
      review_pending IS DISTINCT FROM (v_pending_ride_id IS NOT NULL)
      OR review_pending_ride_id IS DISTINCT FROM v_pending_ride_id
    );
END;
$$;

-- When a booking is marked completed, check pending review for both passenger and driver.
CREATE OR REPLACE FUNCTION public.handle_booking_completed_review_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id UUID;
BEGIN
  IF LOWER(COALESCE(NEW.status, '')) <> 'completed' THEN
    RETURN NEW;
  END IF;

  PERFORM public.refresh_review_pending_for_member(NEW.passenger_id);

  SELECT r.driver_id
  INTO v_driver_id
  FROM public.rides r
  WHERE r.id = NEW.ride_id;

  IF v_driver_id IS NOT NULL THEN
    PERFORM public.refresh_review_pending_for_member(v_driver_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_review_pending_on_completed ON public.bookings;

CREATE TRIGGER bookings_review_pending_on_completed
AFTER INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.handle_booking_completed_review_pending();

-- When a member submits a review, unblock them if no review is pending anymore.
CREATE OR REPLACE FUNCTION public.handle_review_insert_review_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_review_pending_for_member(NEW.reviewer_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviews_refresh_review_pending_on_insert ON public.reviews;

CREATE TRIGGER reviews_refresh_review_pending_on_insert
AFTER INSERT ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.handle_review_insert_review_pending();

-- Backfill for already verified members.
DO $$
DECLARE
  v_profile RECORD;
BEGIN
  FOR v_profile IN
    SELECT p.id
    FROM public.profiles p
    WHERE COALESCE(p.is_verified, FALSE)
       OR LOWER(BTRIM(COALESCE(p.status, ''))) = 'verified'
  LOOP
    PERFORM public.refresh_review_pending_for_member(v_profile.id);
  END LOOP;
END;
$$;
