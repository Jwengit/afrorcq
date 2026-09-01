CREATE TABLE IF NOT EXISTS public.member_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'admin',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS member_notifications_user_id_idx
  ON public.member_notifications(user_id);

CREATE INDEX IF NOT EXISTS member_notifications_created_at_idx
  ON public.member_notifications(created_at DESC);

ALTER TABLE public.member_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own member notifications" ON public.member_notifications;
CREATE POLICY "Users can read own member notifications"
  ON public.member_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own member notifications" ON public.member_notifications;
CREATE POLICY "Users can delete own member notifications"
  ON public.member_notifications
  FOR DELETE
  USING (auth.uid() = user_id);
