-- Allow admins to start private conversations that members can reply to.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS initiated_by_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_support_tickets_admin_conversations
  ON public.support_tickets (user_id, updated_at DESC)
  WHERE initiated_by_admin = TRUE;

NOTIFY pgrst, 'reload schema';
