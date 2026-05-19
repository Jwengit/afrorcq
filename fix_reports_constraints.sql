-- Fix reports table constraints to match expected values.
-- Run this in the Supabase SQL editor.

-- Drop ALL check constraints on the reports table dynamically (handles any auto-generated names)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'reports'
      AND nsp.nspname = 'public'
      AND con.contype = 'c'
  LOOP
    EXECUTE 'ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

-- Normalize legacy values before adding constraints again
UPDATE public.reports
SET status = CASE
  WHEN status IS NULL THEN 'pending'
  WHEN lower(btrim(status)) IN ('pending', 'ignored', 'resolved') THEN lower(btrim(status))
  WHEN lower(btrim(status)) IN ('open', 'new', 'submitted', 'in_review') THEN 'pending'
  WHEN lower(btrim(status)) IN ('dismissed', 'rejected') THEN 'ignored'
  WHEN lower(btrim(status)) IN ('closed', 'done') THEN 'resolved'
  ELSE 'pending'
END;

-- Ensure default and nullability are aligned with the new check
ALTER TABLE public.reports
  ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE public.reports
  ALTER COLUMN status SET NOT NULL;

-- Recreate with correct values
ALTER TABLE public.reports
  ADD CONSTRAINT reports_type_check
  CHECK (type IN ('user', 'ride', 'behavior', 'spam', 'payment_issue'));

ALTER TABLE public.reports
  ADD CONSTRAINT reports_status_check
  CHECK (status IN ('pending', 'ignored', 'resolved'));
