import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

async function isRequesterAdmin(token: string): Promise<boolean> {
  if (!supabaseUrl || !supabaseAnonKey) return false;

  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error: userError
  } = await anonClient.auth.getUser(token);

  if (userError || !user) return false;
  if ((user.email ?? '').toLowerCase() === 'hizli.carpooling@gmail.com') return true;

  const { data: profile } = await anonClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  return Boolean(profile?.is_admin);
}

export const PATCH: RequestHandler = async ({ request }) => {
  try {
    const token = getBearerToken(request);
    if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isRequesterAdmin(token))) return json({ error: 'Forbidden' }, { status: 403 });

    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Server configuration error' }, { status: 500 });
    }

    const body = await request.json();
    const userId = typeof body?.userId === 'string' ? body.userId : '';
    const status = body?.status === 'approved' || body?.status === 'rejected' ? body.status : null;

    if (!userId || !status) return json({ error: 'Invalid payload' }, { status: 400 });

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('id, profile_photo_url')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) return json({ error: profileError.message }, { status: 500 });
    if (!profile) return json({ error: 'Profile not found' }, { status: 404 });
    if (!profile.profile_photo_url) return json({ error: 'Profile photo not found' }, { status: 400 });

    const { error: updateError } = await adminClient
      .from('profiles')
      .update({ profile_photo_status: status, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (updateError) return json({ error: updateError.message }, { status: 500 });
    return json({ success: true, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return json({ error: message }, { status: 500 });
  }
};
