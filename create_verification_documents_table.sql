-- Verification documents uploaded by users for account review
CREATE TABLE IF NOT EXISTS public.verification_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type TEXT,
  file_size BIGINT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.verification_documents
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS document_type TEXT,
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS admin_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'verification_documents'
      AND column_name = 'doc_type'
  ) THEN
    EXECUTE 'UPDATE public.verification_documents SET document_type = doc_type WHERE document_type IS NULL';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'verification_documents'
      AND column_name = 'type'
  ) THEN
    EXECUTE 'UPDATE public.verification_documents SET document_type = type WHERE document_type IS NULL';
  END IF;
END $$;

UPDATE public.verification_documents SET status = 'pending' WHERE status IS NULL;
UPDATE public.verification_documents SET file_url = storage_path WHERE file_url IS NULL;

ALTER TABLE public.verification_documents
  ALTER COLUMN file_url SET DEFAULT '',
  ALTER COLUMN document_type SET DEFAULT 'other',
  ALTER COLUMN status SET DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS verification_documents_user_id_idx ON public.verification_documents(user_id);
CREATE INDEX IF NOT EXISTS verification_documents_status_idx ON public.verification_documents(status);

CREATE OR REPLACE FUNCTION public.set_verification_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS verification_documents_set_updated_at ON public.verification_documents;
CREATE TRIGGER verification_documents_set_updated_at
BEFORE UPDATE ON public.verification_documents
FOR EACH ROW EXECUTE FUNCTION public.set_verification_documents_updated_at();

ALTER TABLE public.verification_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own verification documents" ON public.verification_documents;
CREATE POLICY "Users can read own verification documents"
  ON public.verification_documents
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own verification documents" ON public.verification_documents;
CREATE POLICY "Users can insert own verification documents"
  ON public.verification_documents
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

DROP POLICY IF EXISTS "Users can delete own pending verification documents" ON public.verification_documents;
CREATE POLICY "Users can delete own pending verification documents"
  ON public.verification_documents
  FOR DELETE
  USING (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Admins can read all verification documents" ON public.verification_documents;
CREATE POLICY "Admins can read all verification documents"
  ON public.verification_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update verification documents" ON public.verification_documents;
CREATE POLICY "Admins can update verification documents"
  ON public.verification_documents
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );
