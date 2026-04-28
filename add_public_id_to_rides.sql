-- Add a member-facing incremental id for rides without replacing UUID PK.
-- Safe to run multiple times.

CREATE SEQUENCE IF NOT EXISTS public.rides_public_id_seq;

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS public_id BIGINT;

-- Backfill existing rides in creation order.
WITH ordered_rides AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at NULLS LAST, id) AS rn
  FROM public.rides
),
updates AS (
  UPDATE public.rides r
  SET public_id = o.rn
  FROM ordered_rides o
  WHERE r.id = o.id
    AND r.public_id IS NULL
  RETURNING r.public_id
)
SELECT COUNT(*) FROM updates;

ALTER TABLE public.rides
  ALTER COLUMN public_id SET DEFAULT nextval('public.rides_public_id_seq');

SELECT setval(
  'public.rides_public_id_seq',
  COALESCE((SELECT MAX(public_id) FROM public.rides), 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS rides_public_id_unique_idx
  ON public.rides(public_id);
