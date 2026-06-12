# Stripe Integration Setup Guide

This guide explains how to set up Stripe for the subscription system with a 30-day free trial.

## Prerequisites

- Stripe account (https://stripe.com)
- Vercel project (for production) or local environment variables file

## Step 1: Create Products and Prices in Stripe

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Products** in the left sidebar
3. Create two products:

### Product 1: Premium Student
- **Name**: Premium Student
- **Description**: Student subscription with verified badge and premium features
- **Price**: $25 USD/month
- **Recurring**: Monthly
- **Billing period**: Monthly
- **Copy the Price ID** (format: `price_xxxxx`)

### Product 2: Premium Standard
- **Name**: Premium Standard
- **Description**: Standard subscription with verified badge, analytics, and priority support
- **Price**: $35 USD/month
- **Recurring**: Monthly
- **Billing period**: Monthly
- **Copy the Price ID** (format: `price_xxxxx`)

## Step 2: Configure Environment Variables

Add the following variables to your `.env.local` (local development) or Vercel Project Settings (production):

```env
STRIPE_SECRET_KEY=sk_test_xxxxx  # or sk_live_xxxxx for production
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
PUBLIC_SITE_URL=http://localhost:5173  # or https://yourdomain.com in production
```

## Step 3: Create Webhook Endpoint

1. Go to Stripe Dashboard → **Developers** → **Webhooks**
2. Click **Add an endpoint**
3. Endpoint URL: `https://yourdomain.com/api/subscriptions/webhook` (use ngrok for local: `https://xxxxx.ngrok.io/api/subscriptions/webhook`)
4. Select events to listen to:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_action_required`
5. Click **Add endpoint**
6. Go to the endpoint details and copy the **Signing Secret** (`whsec_xxxxx`)
7. Add it to `STRIPE_WEBHOOK_SECRET` in your environment variables

## Step 4: Update Price IDs in Database

After creating the products and prices, update the `plans` table in your database:

```sql
UPDATE public.plans
SET stripe_price_id = 'price_xxxxx'
WHERE plan_code = 'student';

UPDATE public.plans
SET stripe_price_id = 'price_yyyyy'
WHERE plan_code = 'standard';
```

Or you can add them directly when inserting plans:

```sql
INSERT INTO public.plans (plan_code, name, price_cents, stripe_price_id, trial_days, features)
VALUES
  ('student', 'Premium Student', 2500, 'price_xxxxx', 30, ARRAY[...]),
  ('standard', 'Premium Standard', 3500, 'price_yyyyy', 30, ARRAY[...])
ON CONFLICT (plan_code) DO UPDATE SET
  stripe_price_id = EXCLUDED.stripe_price_id;
```

## Step 5: Test the Flow

### Local Testing (Development)

1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Login to Stripe CLI: `stripe login`
3. Forward webhook to your local server:
   ```bash
   stripe listen --forward-to localhost:5173/api/subscriptions/webhook
   ```
4. This will output a signing secret. Add it to `.env.local` as `STRIPE_WEBHOOK_SECRET`

5. Run your app: `npm run dev`
6. Navigate to `/plan-selection`
7. Select a plan
8. Use Stripe test card: `4242 4242 4242 4242` (any future date, any CVC)
9. Check the database:
   - `subscriptions` table should have a new row with `status='trialing'`
   - `profiles.membership_plan` should be updated to `student` or `standard`

### Production Deployment

1. Add Stripe live keys to Vercel environment variables
2. Stripe will send webhooks to your production webhook endpoint
3. Monitor webhook delivery in Stripe Dashboard → Developers → Webhooks

## Webhook Events Handled

- **customer.subscription.created**: Creates subscription record, sets status='trialing'
- **customer.subscription.updated**: Updates subscription status, trial_end_at, period_end_at
- **customer.subscription.deleted**: Sets status='canceled', downgrades user to 'explorer' plan
- **invoice.payment_action_required**: Sets status='past_due'

## Test Cards for Development

| Card | Details |
|------|---------|
| Visa | 4242 4242 4242 4242 |
| Visa (debit) | 4000 0566 5566 5556 |
| Mastercard | 5555 5555 5555 4444 |
| American Express | 3782 822463 10005 |

Use any future expiration date and any 3-digit CVC.

## Troubleshooting

### Webhook Not Receiving Events

1. Check webhook endpoint URL is correct
2. Verify `STRIPE_WEBHOOK_SECRET` is set correctly
3. Check logs in Stripe Dashboard → Developers → Webhooks
4. For local testing, ensure Stripe CLI is running and forwarding correctly

### Price IDs Not Found

1. Verify products are created in Stripe Dashboard
2. Copy the exact price ID (not product ID)
3. Update the `plans` table with correct price IDs

### Test Payment Not Working

1. Use correct test card number
2. Use future expiration date
3. Check browser console for errors
4. Check application logs for API errors

## Trial Period Configuration

The trial period is set to **30 days** by default. To change it:

1. Update `trial_days` in the `plans` table
2. Or modify `trial_period_days` in the checkout session creation code

## Customer Portal (Optional)

To allow users to manage their subscription (change plan, cancel, etc.), enable Stripe Customer Portal:

1. Stripe Dashboard → Settings → Branding → Customer Portal
2. Configure what customers can do
3. Implement a route `/billing` that redirects to customer portal:

```typescript
const session = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,
  return_url: 'https://yourdomain.com/dashboard'
});
window.location.href = session.url;
```

## Resources

- [Stripe Checkout Documentation](https://stripe.com/docs/payments/checkout)
- [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks)
- [Stripe Testing Documentation](https://stripe.com/docs/testing)
