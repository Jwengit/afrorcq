-- Support tickets (user -> admin)
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

UPDATE public.support_tickets SET status = 'open' WHERE status IS NULL;
UPDATE public.support_tickets SET priority = 'normal' WHERE priority IS NULL;
UPDATE public.support_tickets SET subject = 'Support request' WHERE subject IS NULL;

ALTER TABLE public.support_tickets
  ALTER COLUMN subject SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN priority SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_status_check'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_status_check
      CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_priority_check'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_priority_check
      CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON public.support_tickets(created_at);

-- Conversation messages
CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('user', 'admin')),
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sender_role TEXT,
  ADD COLUMN IF NOT EXISTS message TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

UPDATE public.support_messages SET sender_role = 'user' WHERE sender_role IS NULL;
UPDATE public.support_messages SET message = '' WHERE message IS NULL;

ALTER TABLE public.support_messages
  ALTER COLUMN ticket_id SET NOT NULL,
  ALTER COLUMN sender_role SET NOT NULL,
  ALTER COLUMN message SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_messages_sender_role_check'
  ) THEN
    ALTER TABLE public.support_messages
      ADD CONSTRAINT support_messages_sender_role_check
      CHECK (sender_role IN ('user', 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id ON public.support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_created_at ON public.support_messages(created_at);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admin select support_tickets" ON public.support_tickets;
CREATE POLICY "Allow admin select support_tickets" ON public.support_tickets FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow admin update support_tickets" ON public.support_tickets;
CREATE POLICY "Allow admin update support_tickets" ON public.support_tickets FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow users read own support_tickets" ON public.support_tickets;
CREATE POLICY "Allow users read own support_tickets" ON public.support_tickets
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users create own support_tickets" ON public.support_tickets;
CREATE POLICY "Allow users create own support_tickets" ON public.support_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow admin select support_messages" ON public.support_messages;
CREATE POLICY "Allow admin select support_messages" ON public.support_messages FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow admin insert support_messages" ON public.support_messages;
CREATE POLICY "Allow admin insert support_messages" ON public.support_messages FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow users read own support_messages" ON public.support_messages;
CREATE POLICY "Allow users read own support_messages" ON public.support_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.support_tickets st
      WHERE st.id = support_messages.ticket_id
      AND st.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Allow users insert own support_messages" ON public.support_messages;
CREATE POLICY "Allow users insert own support_messages" ON public.support_messages
  FOR INSERT WITH CHECK (
    sender_role = 'user'
    AND sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets st
      WHERE st.id = support_messages.ticket_id
      AND st.user_id = auth.uid()
    )
  );
