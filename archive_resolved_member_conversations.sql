-- Record when resolved admin-started conversations leave the member's active inbox.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_support_tickets_member_archive_retention
  ON public.support_tickets (archived_at)
  WHERE initiated_by_admin = TRUE AND archived_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
