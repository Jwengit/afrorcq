-- Platform-wide settings for admin configuration
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  max_seats INTEGER NOT NULL DEFAULT 6,
  max_price NUMERIC(10,2) NOT NULL DEFAULT 200.00,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(5,2) DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS max_seats INTEGER DEFAULT 6,
  ADD COLUMN IF NOT EXISTS max_price NUMERIC(10,2) DEFAULT 200.00,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

UPDATE public.platform_settings SET commission_percent = 10.00 WHERE commission_percent IS NULL;
UPDATE public.platform_settings SET max_seats = 6 WHERE max_seats IS NULL;
UPDATE public.platform_settings SET max_price = 200.00 WHERE max_price IS NULL;

ALTER TABLE public.platform_settings
  ALTER COLUMN commission_percent SET NOT NULL,
  ALTER COLUMN max_seats SET NOT NULL,
  ALTER COLUMN max_price SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE id = 1) THEN
    INSERT INTO public.platform_settings (id, commission_percent, max_seats, max_price)
    VALUES (1, 10.00, 6, 200.00);
  END IF;
END $$;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admin read platform_settings" ON public.platform_settings;
CREATE POLICY "Allow admin read platform_settings" ON public.platform_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow admin update platform_settings" ON public.platform_settings;
CREATE POLICY "Allow admin update platform_settings" ON public.platform_settings FOR UPDATE USING (true);
