-- Allow users to delete their own profile row through RLS.
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Enable delete for own profile" ON public.profiles;

CREATE POLICY "Enable delete for own profile" ON public.profiles
  FOR DELETE
  USING (auth.uid() = id);

-- Ensure deleting auth.users rows from Supabase dashboard also removes linked profile rows.
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_id_fkey
FOREIGN KEY (id)
REFERENCES auth.users(id)
ON DELETE CASCADE;