-- Private bucket for account verification documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('verification-documents', 'verification-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload own verification documents" ON storage.objects;
CREATE POLICY "Users can upload own verification documents"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'verification-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can read own verification documents objects" ON storage.objects;
CREATE POLICY "Users can read own verification documents objects"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'verification-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete own verification documents objects" ON storage.objects;
CREATE POLICY "Users can delete own verification documents objects"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'verification-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
