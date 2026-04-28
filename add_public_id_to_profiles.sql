-- Add a human-friendly incremental id for profiles without replacing UUID PK.
-- Safe to run multiple times.

CREATE SEQUENCE IF NOT EXISTS public.profiles_public_id_seq;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_id BIGINT;

-- Backfill existing rows in a stable order.
WITH ordered_profiles AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at NULLS LAST, id) AS rn
  FROM public.profiles
),
updates AS (
  UPDATE public.profiles p
  SET public_id = o.rn
  FROM ordered_profiles o
  WHERE p.id = o.id
    AND p.public_id IS NULL
  RETURNING p.public_id
)
SELECT COUNT(*) FROM updates;

ALTER TABLE public.profiles
  ALTER COLUMN public_id SET DEFAULT nextval('public.profiles_public_id_seq');

SELECT setval(
  'public.profiles_public_id_seq',
  COALESCE((SELECT MAX(public_id) FROM public.profiles), 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_public_id_unique_idx
  ON public.profiles(public_id);
