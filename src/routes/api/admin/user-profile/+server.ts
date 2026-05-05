import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

const SENSITIVE_METADATA_KEYS = new Set([
  'recaptcha_token',
  'captcha_token',
  'access_token',
  'refresh_token',
  'token',
  'secret',
  'password'
]);

function sanitizeUserMetadata(
  value: unknown,
  normalizedStatus?: 'Verified' | 'Unverified'
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(input)) {
    if (SENSITIVE_METADATA_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    sanitized[key] = item;
  }

  if (normalizedStatus) {
    sanitized.status = normalizedStatus;
  }

  return sanitized;
}

function resolveVerificationLabel(isVerified: boolean): 'Verified' | 'Unverified' {
  return isVerified ? 'Verified' : 'Unverified';
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

async function isRequesterAdmin(token: string): Promise<boolean> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return false;
  }

  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error: userError
  } = await anonClient.auth.getUser(token);

  if (userError || !user) {
    return false;
  }

  const isHizliAccount = (user.email ?? '').toLowerCase() === 'hizli.carpooling@gmail.com';
  if (isHizliAccount) {
    return true;
  }

  const { data: profile } = await anonClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  return Boolean(profile?.is_admin);
}

export const GET: RequestHandler = async ({ request, url }) => {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: 'Server configuration error' }, { status: 500 });
    }

    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return json(
        {
          error:
            'SUPABASE_SERVICE_ROLE_KEY is missing. Set it in your environment (.env.local for local dev, or Vercel Project Settings > Environment Variables for deployment) and redeploy/restart.'
        },
        { status: 500 }
      );
    }

    const token = getBearerToken(request);
    if (!token) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminAllowed = await isRequesterAdmin(token);
    if (!adminAllowed) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    const userId = url.searchParams.get('userId') || '';
    if (!userId) {
      return json({ error: 'userId is required' }, { status: 400 });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: authUserData, error: authUserError } = await adminClient.auth.admin.getUserById(userId);

    const { data: profile, error } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      return json({ error: error.message || 'Failed to load private profile.' }, { status: 500 });
    }

    const authUser = authUserData?.user ?? null;
    const normalizedStatus = resolveVerificationLabel(Boolean(profile?.is_verified));
    const profileForResponse = profile
      ? {
          ...profile,
          status: normalizedStatus
        }
      : null;

    const sanitizedAuth = {
      id: authUser?.id ?? profile?.id ?? userId,
      email: authUser?.email ?? null,
      phone: authUser?.phone ?? null,
      created_at: authUser?.created_at ?? null,
      email_confirmed_at: authUser?.email_confirmed_at ?? null,
      confirmed_at: authUser?.confirmed_at ?? null,
      last_sign_in_at: authUser?.last_sign_in_at ?? null,
      app_metadata: authUser?.app_metadata ?? {},
      user_metadata: sanitizeUserMetadata(authUser?.user_metadata ?? {}, normalizedStatus)
    };

    if (!authUser && !profileForResponse) {
      return json({
        profile: null,
        auth: null,
        full_profile: {
          profile: null,
          auth: null
        },
        warning: authUserError?.message || 'User not found in auth or profiles.'
      });
    }

    return json({
      profile: profileForResponse,
      auth: sanitizedAuth,
      full_profile: {
        profile: profileForResponse,
        auth: sanitizedAuth
      },
      warning: authUserError?.message ?? null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return json({ error: message }, { status: 500 });
  }
};
