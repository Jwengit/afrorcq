# Payment Go-Live Checklist

Use this checklist to prepare payments before switching from sandbox to live.

## Now: sandbox preparation

1. Keep `PAYPAL_MODE=sandbox` in your local or preview environment.
2. Set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` to sandbox credentials.
3. Verify the checkout page loads the PayPal button on a ride page.
4. Run a small sandbox payment end-to-end.
5. Confirm the app creates a `transactions` row with `status=pending` and then `succeeded` after capture.
6. Confirm a `bookings` row is created with `confirmed_at` set.
7. Confirm the transaction stores `paypal_order_id` and `paypal_capture_id`.
8. Confirm the admin overview no longer shows a stale payment state after the sandbox flow works.

## Later: live switch

1. Replace sandbox credentials with the live PayPal Business app credentials.
2. Set `PAYPAL_MODE=live` in the production environment.
3. Deploy the change.
4. Do one low-value real payment with a company test ride.
5. Verify the capture appears in the business PayPal account.
6. Verify Venmo only appears if the business account is eligible in the region.
7. Keep the old sandbox credentials only for non-production environments.

## What to verify before announcing live

1. `/api/payments/config` returns `mode=live`.
2. The ride page no longer shows the sandbox warning.
3. The transaction shows the live provider data in admin.
4. The company account receives the captured funds as expected.

## Notes

The code already supports both sandbox and live PayPal checkout flows. The difference is the environment configuration and the account credentials, not a separate code path.