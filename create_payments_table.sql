-- Create payments table for PayPal/Venmo immediate capture + manual release escrow flow
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('paypal')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('paypal', 'venmo')),
  provider_order_id TEXT NOT NULL UNIQUE,
  provider_capture_id TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  seats_booked INTEGER NOT NULL CHECK (seats_booked > 0),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'captured', 'released', 'cancelled', 'failed', 'captured_issue')),
  raw_provider_response JSONB,
  release_requested_at TIMESTAMP WITH TIME ZONE,
  released_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Passenger can read own payments
DROP POLICY IF EXISTS "Passengers can read their own payments" ON payments;
CREATE POLICY "Passengers can read their own payments" ON payments
  FOR SELECT
  USING (auth.uid() = passenger_id);

-- Driver can read payments related to their rides
DROP POLICY IF EXISTS "Drivers can read payments for their rides" ON payments;
CREATE POLICY "Drivers can read payments for their rides" ON payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM rides r
      WHERE r.id = payments.ride_id
      AND r.driver_id = auth.uid()
    )
  );

-- Passenger can create payment intents for own account
DROP POLICY IF EXISTS "Passengers can create their own payments" ON payments;
CREATE POLICY "Passengers can create their own payments" ON payments
  FOR INSERT
  WITH CHECK (auth.uid() = passenger_id);

-- Passenger can update pending/cancelled states on own payments (server uses user token)
DROP POLICY IF EXISTS "Passengers can update their own payments" ON payments;
CREATE POLICY "Passengers can update their own payments" ON payments
  FOR UPDATE
  USING (auth.uid() = passenger_id)
  WITH CHECK (auth.uid() = passenger_id);

DROP TRIGGER IF EXISTS set_payments_updated_at ON payments;
CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();