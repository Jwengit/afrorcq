import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';
const BUCKET = 'profile-photos';
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

async function getAuthenticatedUser(token: string) {
  if (!supabaseUrl || !supabaseAnonKey) return { user: null };
  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user) return { user: null };
  return { user };
}

function createApiClient() {
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    return createClient(supabaseUrl, serviceRoleKey);
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: 'Server configuration error' }, { status: 500 });
    }

    const token = getBearerToken(request);
    if (!token) return json({ error: 'Unauthorized' }, { status: 401 });

    const { user } = await getAuthenticatedUser(token);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const fileValue = formData.get('file');

    if (!(fileValue instanceof File)) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    if (fileValue.size > MAX_SIZE) {
      return json({ error: 'Photo must be 5MB or less.' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(fileValue.type)) {
      return json({ error: 'Only JPEG, PNG, WEBP or GIF images are allowed.' }, { status: 400 });
    }

    const safeName = fileValue.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${user.id}/${Date.now()}_${safeName}`;

    const adminClient = createApiClient();

    const { error: uploadError } = await adminClient.storage
      .from(BUCKET)
      .upload(storagePath, fileValue, { upsert: false, contentType: fileValue.type || undefined });

    if (uploadError) {
      return json({ error: uploadError.message || 'Unable to upload photo.' }, { status: 500 });
    }

    const { data: publicUrlData } = adminClient.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    return json({ success: true, publicUrl: publicUrlData.publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return json({ error: message }, { status: 500 });
  }
};
