-- Keep profiles.average_rating synchronized with approved reviews.
-- Safe to run multiple times.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2) DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.recalculate_profile_average_rating(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.profiles p
  SET
    average_rating = stats.avg_rating,
    updated_at = NOW()
  FROM (
    SELECT
      r.reviewee_id,
      ROUND(AVG(r.rating)::numeric, 2) AS avg_rating
    FROM public.reviews r
    WHERE lower(coalesce(r.status, '')) = 'approved'
      AND r.reviewee_id = p_user_id
    GROUP BY r.reviewee_id
  ) stats
  WHERE p.id = p_user_id
    AND p.id = stats.reviewee_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.reviews r
    WHERE r.reviewee_id = p_user_id
      AND lower(coalesce(r.status, '')) = 'approved'
  ) THEN
    UPDATE public.profiles p
    SET
      average_rating = NULL,
      updated_at = NOW()
    WHERE p.id = p_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_review_rating_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recalculate_profile_average_rating(NEW.reviewee_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.reviewee_id IS DISTINCT FROM NEW.reviewee_id THEN
      PERFORM public.recalculate_profile_average_rating(OLD.reviewee_id);
      PERFORM public.recalculate_profile_average_rating(NEW.reviewee_id);
      RETURN NEW;
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status
      OR OLD.rating IS DISTINCT FROM NEW.rating THEN
      PERFORM public.recalculate_profile_average_rating(NEW.reviewee_id);
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_profile_average_rating(OLD.reviewee_id);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS reviews_sync_profile_average_rating ON public.reviews;

CREATE TRIGGER reviews_sync_profile_average_rating
AFTER INSERT OR UPDATE OR DELETE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.handle_review_rating_sync();

-- Backfill all existing profiles from current approved reviews.
UPDATE public.profiles p
SET
  average_rating = stats.avg_rating,
  updated_at = NOW()
FROM (
  SELECT
    p2.id AS profile_id,
    ROUND(AVG(r.rating)::numeric, 2) AS avg_rating
  FROM public.profiles p2
  LEFT JOIN public.reviews r
    ON r.reviewee_id = p2.id
   AND lower(coalesce(r.status, '')) = 'approved'
  GROUP BY p2.id
) stats
WHERE p.id = stats.profile_id;
