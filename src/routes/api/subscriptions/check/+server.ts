import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

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

interface AccessControl {
  canPostRides: boolean;
  canFindRides: boolean;
  canMessage: boolean;
  canViewAnalytics: boolean;
  hasPrioritySupport: boolean;
  hasAdvancedFilters: boolean;
  hasVerifiedBadge: boolean;
}

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

    const client = createClient(supabaseUrl, supabaseAnonKey);

    // Get user's current subscription and profile
    const [{ data: subscription }, { data: profile }] = await Promise.all([
      client
        .from('subscriptions')
        .select('plan_code, status, trial_end_at, period_end_at')
        .eq('user_id', user.id)
        .maybeSingle(),
      client
        .from('profiles')
        .select('is_verified, membership_plan')
        .eq('id', user.id)
        .maybeSingle()
    ]);

    const planCode = subscription?.plan_code || profile?.membership_plan || 'explorer';
    const isTrialing = subscription?.status === 'trialing';
    const isActive = subscription?.status === 'active';
    const isPastDue = subscription?.status === 'past_due';
    const isVerified = profile?.is_verified === true;

    // Determine access based on plan
    let access: AccessControl;

    if (planCode === 'explorer' && !isTrialing && !isActive) {
      // Free plan
      access = {
        canPostRides: isVerified,
        canFindRides: true,
        canMessage: true,
        canViewAnalytics: false,
        hasPrioritySupport: false,
        hasAdvancedFilters: false,
        hasVerifiedBadge: isVerified
      };
    } else if ((planCode === 'student' || planCode === 'standard') && (isTrialing || isActive)) {
      // Premium plans (trial or active)
      access = {
        canPostRides: true,
        canFindRides: true,
        canMessage: true,
        canViewAnalytics: planCode === 'standard',
        hasPrioritySupport: true,
        hasAdvancedFilters: true,
        hasVerifiedBadge: true
      };
    } else {
      // Fallback (past_due, canceled, etc)
      access = {
        canPostRides: isVerified,
        canFindRides: true,
        canMessage: true,
        canViewAnalytics: false,
        hasPrioritySupport: false,
        hasAdvancedFilters: false,
        hasVerifiedBadge: isVerified
      };
    }

    return json({
      plan: {
        code: planCode,
        status: subscription?.status || 'none',
        isTrialing,
        isActive,
        isPastDue,
        trialEndsAt: subscription?.trial_end_at,
        periodEndsAt: subscription?.period_end_at
      },
      access,
      profile: {
        isVerified
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return json({ error: message }, { status: 500 });
  }
};
