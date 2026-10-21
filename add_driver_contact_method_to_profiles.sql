-- Store the driver's explicit choice of contact detail to share after a booking is confirmed.
-- Contact details are still sent only in the booking-confirmation email, never in a public profile.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS driver_contact_method TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_driver_contact_method_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_driver_contact_method_check
  CHECK (driver_contact_method IS NULL OR driver_contact_method IN ('phone', 'email'));

-- Keep contact details out of direct client queries. Server-side code using the
-- service_role can still read them after a booking is confirmed.
REVOKE SELECT ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  profile_column RECORD;
BEGIN
  FOR profile_column IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name NOT IN ('email', 'phone_number', 'driver_contact_method')
  LOOP
    EXECUTE format(
      'GRANT SELECT (%I) ON TABLE public.profiles TO authenticated',
      profile_column.column_name
    );
  END LOOP;
END
$$;
