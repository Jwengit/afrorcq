import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

export const GET: RequestHandler = async () => {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: 'Server configuration error' }, { status: 500 });
    }

    const client = createClient(supabaseUrl, supabaseAnonKey);

    const { data: plans, error } = await client
      .from('plans')
      .select('plan_code, name, price_cents, trial_days, features')
      .eq('is_active', true)
      .neq('plan_code', 'explorer')
      .order('price_cents', { ascending: true });

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    return json({
      plans: plans?.map((p) => ({
        code: p.plan_code,
        name: p.name,
        price: p.price_cents / 100,
        trialDays: p.trial_days,
        features: p.features
      })) || []
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return json({ error: message }, { status: 500 });
  }
};
