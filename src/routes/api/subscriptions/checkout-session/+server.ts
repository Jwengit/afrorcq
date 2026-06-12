import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import Stripe from 'stripe';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';
const stripeSecretKey = env.STRIPE_SECRET_KEY || '';
const siteUrl = env.PUBLIC_SITE_URL || 'http://localhost:5173';

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

async function getAuthenticatedUser(token: string) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { user: null };
  }

  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error
  } = await anonClient.auth.getUser(token);

  if (error || !user) {
    return { user: null };
  }

  return { user };
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    if (!stripeSecretKey || !supabaseUrl || !supabaseAnonKey) {
      return json(
        { error: 'Server configuration error. STRIPE_SECRET_KEY or Supabase credentials missing.' },
        { status: 500 }
      );
    }

    const token = getBearerToken(request);
    if (!token) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user } = await getAuthenticatedUser(token);
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const planCode = body.planCode as string | undefined;

    if (!planCode || !['student', 'standard'].includes(planCode)) {
      return json({ error: 'Invalid plan code' }, { status: 400 });
    }

    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return json(
        { error: 'Service role key is missing. Cannot create checkout session.' },
        { status: 500 }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get plan details
    const { data: plan, error: planError } = await adminClient
      .from('plans')
      .select('stripe_price_id, trial_days')
      .eq('plan_code', planCode)
      .maybeSingle();

    if (planError || !plan || !plan.stripe_price_id) {
      return json({ error: 'Plan not found or Stripe price not configured' }, { status: 404 });
    }

    // Check if user already has an active subscription
    const { data: existingSub } = await adminClient
      .from('subscriptions')
      .select('id, status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingSub && ['trialing', 'active'].includes(existingSub.status)) {
      return json({ error: 'User already has an active subscription' }, { status: 400 });
    }

    const stripe = new Stripe(stripeSecretKey);

    // Get or create Stripe customer
    let stripeCustomerId: string;

    const { data: sub } = await adminClient
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (sub?.stripe_customer_id) {
      stripeCustomerId = sub.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: {
          user_id: user.id
        }
      });
      stripeCustomerId = customer.id;
    }

    // Create Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: stripeCustomerId,
      line_items: [
        {
          price: plan.stripe_price_id,
          quantity: 1
        }
      ],
      subscription_data: {
        trial_period_days: plan.trial_days || 30,
        metadata: {
          user_id: user.id,
          plan_code: planCode
        }
      },
      success_url: `${siteUrl}/dashboard?subscription=success`,
      cancel_url: `${siteUrl}/dashboard?subscription=canceled`,
      customer_email: user.email || undefined
    });

    // Save stripe customer ID if new
    if (!sub?.stripe_customer_id) {
      await adminClient
        .from('subscriptions')
        .upsert(
          {
            user_id: user.id,
            plan_code: planCode,
            stripe_customer_id: stripeCustomerId,
            status: 'trialing'
          },
          { onConflict: 'user_id' }
        );
    }

    return json({ checkoutUrl: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Checkout session error:', message);
    return json({ error: message }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ request }) => {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: 'Server configuration error' }, { status: 500 });
    }

    const token = getBearerToken(request);
    if (!token) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user } = await getAuthenticatedUser(token);
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return json({ error: 'Service role key is missing' }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: subscription, error } = await adminClient
      .from('subscriptions')
      .select('plan_code, status, trial_end_at, period_end_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    return json({ subscription: subscription || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return json({ error: message }, { status: 500 });
  }
};
