-- Add account email to profiles for easier support/admin lookup.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email TEXT;

-- Keep profile email aligned with auth.users on profile writes.
CREATE OR REPLACE FUNCTION public.sync_profile_email_on_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  SELECT u.email
  INTO NEW.email
  FROM auth.users u
  WHERE u.id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profile_email_on_write ON public.profiles;

CREATE TRIGGER set_profile_email_on_write
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_email_on_write();

-- Keep existing profile rows synced if auth email changes.
CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.profiles
  SET
    email = NEW.email,
    updated_at = TIMEZONE('utc'::text, NOW())
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_email_on_auth_user_change ON auth.users;

CREATE TRIGGER sync_profile_email_on_auth_user_change
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_email_from_auth_user();

-- Backfill existing profile rows.
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND p.email IS DISTINCT FROM u.email;

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);