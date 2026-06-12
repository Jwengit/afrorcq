import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import Stripe from 'stripe';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';
const stripeSecretKey = env.STRIPE_SECRET_KEY || '';
const stripeWebhookSecret = env.STRIPE_WEBHOOK_SECRET || '';

export const POST: RequestHandler = async ({ request }) => {
  try {
    if (!stripeSecretKey || !stripeWebhookSecret || !supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Stripe or Supabase configuration');
      return json({ error: 'Server configuration error' }, { status: 500 });
    }

    const body = await request.text();
    const signature = request.headers.get('stripe-signature') || '';

    let event: Stripe.Event;

    try {
      const stripe = new Stripe(stripeSecretKey);
      event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Webhook signature verification failed:', errorMessage);
      return json({ error: 'Webhook signature verification failed' }, { status: 400 });
    }

    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is missing');
      return json({ error: 'Server configuration error' }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Handle subscription events
    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription;

      if (!subscription.metadata?.user_id) {
        console.warn('Subscription missing user_id metadata:', subscription.id);
        return json({ success: true });
      }

      const userId = subscription.metadata.user_id;
      const planCode = subscription.metadata.plan_code || 'standard';
      const status = subscription.status === 'trialing' ? 'trialing' : 'active';
      const trialEndAt = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null;
      const periodStartAt = new Date(subscription.current_period_start * 1000).toISOString();
      const periodEndAt = new Date(subscription.current_period_end * 1000).toISOString();

      // Upsert subscription
      const { error: upsertError } = await adminClient
        .from('subscriptions')
        .upsert(
          {
            user_id: userId,
            plan_code: planCode,
            stripe_customer_id: subscription.customer as string,
            stripe_subscription_id: subscription.id,
            status,
            trial_end_at: trialEndAt,
            period_start_at: periodStartAt,
            period_end_at: periodEndAt,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id' }
        );

      if (upsertError) {
        console.error('Failed to upsert subscription:', upsertError);
        return json({ error: 'Failed to update subscription' }, { status: 500 });
      }

      // Update profile membership_plan
      const { error: profileError } = await adminClient
        .from('profiles')
        .update({
          membership_plan: planCode,
          trial_started_at: status === 'trialing' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (profileError) {
        console.error('Failed to update profile:', profileError);
      }
    }

    if (event.type === 'customer.subscription.deleted' || event.type === 'invoice.payment_action_required') {
      const subscription = event.data.object as Stripe.Subscription;

      if (!subscription.metadata?.user_id) {
        return json({ success: true });
      }

      const userId = subscription.metadata.user_id;
      const status = event.type === 'customer.subscription.deleted' ? 'canceled' : 'past_due';

      const { error } = await adminClient
        .from('subscriptions')
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (error) {
        console.error('Failed to update subscription status:', error);
      }

      // Downgrade to explorer if canceled
      if (status === 'canceled') {
        await adminClient
          .from('profiles')
          .update({
            membership_plan: 'explorer',
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);
      }
    }

    return json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Webhook handler error:', message);
    return json({ error: message }, { status: 500 });
  }
};
