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

async function getAuthenticatedUser(token: string) {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error
  } = await anonClient.auth.getUser(token);

  return error || !user ? null : user;
}

function getAdminClient() {
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  return serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;
}

// Notification types that a member is allowed to trigger themselves,
// each fired exactly once per "Submit for review" click.
const SELF_TRIGGERED_NOTIFICATIONS: Record<string, { title: string; message: string }> = {
  profile_documents_submitted: {
    title: 'Profile documents submitted',
    message: 'Your profile documents have been submitted and are under review.'
  },
  car_documents_submitted: {
    title: 'Car documents submitted',
    message: 'Your car documents have been submitted and are under review.'
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const token = getBearerToken(request);
    if (!token) return json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getAuthenticatedUser(token);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const type = typeof body?.type === 'string' ? body.type.trim() : '';
    const definition = SELF_TRIGGERED_NOTIFICATIONS[type];

    if (!definition) {
      return json({ error: 'Invalid notification type' }, { status: 400 });
    }

    const adminClient = getAdminClient();
    if (!adminClient) return json({ error: 'Server configuration error' }, { status: 500 });

    const { error } = await adminClient.from('member_notifications').insert({
      user_id: user.id,
      type,
      title: definition.title,
      message: definition.message
    });

    if (error) return json({ error: error.message }, { status: 500 });
    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return json({ error: message }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ request }) => {
  try {
    const token = getBearerToken(request);
    if (!token) return json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getAuthenticatedUser(token);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = getAdminClient();
    if (!adminClient) return json({ error: 'Server configuration error' }, { status: 500 });

    const { data, error } = await adminClient
      .from('member_notifications')
      .select('id, user_id, type, title, message, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return json({ error: error.message }, { status: 500 });
    return json({ notifications: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return json({ error: message }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ request, url }) => {
  try {
    const token = getBearerToken(request);
    if (!token) return json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getAuthenticatedUser(token);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const notificationId = url.searchParams.get('notificationId') || '';
    if (!notificationId) return json({ error: 'notificationId is required' }, { status: 400 });

    const adminClient = getAdminClient();
    if (!adminClient) return json({ error: 'Server configuration error' }, { status: 500 });

    const { error } = await adminClient
      .from('member_notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', user.id);

    if (error) return json({ error: error.message }, { status: 500 });
    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return json({ error: message }, { status: 500 });
  }
};