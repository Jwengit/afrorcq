-- A ride is reviewable once it has ended (10 hours after its scheduled start).
-- Bookings remain "Confirmed" after the ride; they are not changed to "Completed".
CREATE OR REPLACE FUNCTION public.find_latest_unreviewed_completed_ride(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH ended_rides AS (
    SELECT r.id AS ride_id, r.ride_date
    FROM public.bookings b
    JOIN public.rides r ON r.id = b.ride_id
    WHERE b.passenger_id = p_user_id
      AND LOWER(BTRIM(COALESCE(b.status, ''))) = 'confirmed'
      AND r.ride_date + INTERVAL '10 hours' <= NOW()

    UNION

    SELECT r.id AS ride_id, r.ride_date
    FROM public.rides r
    JOIN public.bookings b ON b.ride_id = r.id
    WHERE r.driver_id = p_user_id
      AND LOWER(BTRIM(COALESCE(b.status, ''))) = 'confirmed'
      AND r.ride_date + INTERVAL '10 hours' <= NOW()
  ),
  latest_ended_rides AS (
    SELECT ride_id, MAX(ride_date) AS ended_at
    FROM ended_rides
    GROUP BY ride_id
  )
  SELECT ler.ride_id
  FROM latest_ended_rides ler
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.reviews rv
    WHERE rv.ride_id = ler.ride_id
      AND rv.reviewer_id = p_user_id
      AND LOWER(BTRIM(COALESCE(rv.status, ''))) IN ('pending', 'approved')
  )
  ORDER BY ler.ended_at DESC NULLS LAST
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.handle_booking_completed_review_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id UUID;
BEGIN
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
DROP TRIGGER IF EXISTS bookings_review_pending_on_change ON public.bookings;

CREATE TRIGGER bookings_review_pending_on_change
AFTER INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.handle_booking_completed_review_pending();

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
DROP TRIGGER IF EXISTS reviews_refresh_review_pending_on_change ON public.reviews;

CREATE TRIGGER reviews_refresh_review_pending_on_change
AFTER INSERT OR UPDATE OF status ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.handle_review_insert_review_pending();

-- Recalculate existing members immediately; the application also refreshes on
-- dashboard, search, and ride-publishing page loads as rides pass their end time.
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
