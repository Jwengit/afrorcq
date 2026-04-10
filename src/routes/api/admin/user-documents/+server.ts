import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';
const BUCKET = 'verification-documents';

function normalizeLegacyStatus(status: 'approved' | 'rejected'): string {
  return status === 'approved' ? 'Approved' : 'Rejected';
}

function isStatusConstraintError(message: string | undefined): boolean {
  const m = (message || '').toLowerCase();
  return m.includes('verification_documents_status_check') ||
    (m.includes('check constraint') && m.includes('status'));
}

type AdminDocumentRow = {
  id: string;
  user_id: string;
  document_type?: string | null;
  doc_type?: string | null;
  type?: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  status: string;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeDocumentType(row: AdminDocumentRow): string {
  return row.document_type ?? row.doc_type ?? row.type ?? 'other';
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

async function isRequesterAdmin(token: string): Promise<{ ok: boolean; userId?: string; email?: string }> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false };
  }

  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error: userError
  } = await anonClient.auth.getUser(token);

  if (userError || !user) {
    return { ok: false };
  }

  const isHizliAccount = (user.email ?? '').toLowerCase() === 'hizli.carpooling@gmail.com';
  if (isHizliAccount) {
    return { ok: true, userId: user.id, email: user.email ?? undefined };
  }

  const { data: profile } = await anonClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return { ok: false };
  }

  return { ok: true, userId: user.id, email: user.email ?? undefined };
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

    const adminCheck = await isRequesterAdmin(token);
    if (!adminCheck.ok) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    const userId = url.searchParams.get('userId') || '';
    if (!userId) {
      return json({ error: 'userId is required' }, { status: 400 });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    let docs: AdminDocumentRow[] = [];

    const primaryQuery = await adminClient
      .from('verification_documents')
      .select('id, user_id, document_type, file_name, storage_path, mime_type, file_size, status, admin_note, reviewed_by, reviewed_at, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!primaryQuery.error) {
      docs = ((primaryQuery.data ?? []) as unknown as AdminDocumentRow[]).map((doc) => ({
        ...doc,
        document_type: normalizeDocumentType(doc)
      }));

      if (docs.some((doc) => !doc.document_type || doc.document_type === 'other')) {
        const legacyDocTypeQuery = await adminClient
          .from('verification_documents')
          .select('id, doc_type')
          .eq('user_id', userId);

        if (!legacyDocTypeQuery.error) {
          const byId = new Map(
            ((legacyDocTypeQuery.data ?? []) as unknown as Array<{ id: string; doc_type: string | null }>).map((row) => [row.id, row.doc_type])
          );
          docs = docs.map((doc) => ({
            ...doc,
            document_type: doc.document_type && doc.document_type !== 'other' ? doc.document_type : byId.get(doc.id) || doc.document_type
          }));
        }

        const legacyTypeQuery = await adminClient
          .from('verification_documents')
          .select('id, type')
          .eq('user_id', userId);

        if (!legacyTypeQuery.error) {
          const byId = new Map(
            ((legacyTypeQuery.data ?? []) as unknown as Array<{ id: string; type: string | null }>).map((row) => [row.id, row.type])
          );
          docs = docs.map((doc) => ({
            ...doc,
            document_type: doc.document_type && doc.document_type !== 'other' ? doc.document_type : byId.get(doc.id) || doc.document_type || 'other'
          }));
        }
      }
    } else {
      const fallbackDocTypeQuery = await adminClient
        .from('verification_documents')
        .select('id, user_id, doc_type, file_name, storage_path, mime_type, file_size, status, admin_note, reviewed_by, reviewed_at, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!fallbackDocTypeQuery.error) {
        docs = ((fallbackDocTypeQuery.data ?? []) as unknown as AdminDocumentRow[]).map((doc) => ({
          ...doc,
          document_type: normalizeDocumentType(doc)
        }));
      } else {
        const fallbackTypeQuery = await adminClient
          .from('verification_documents')
          .select('id, user_id, type, file_name, storage_path, mime_type, file_size, status, admin_note, reviewed_by, reviewed_at, created_at, updated_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (fallbackTypeQuery.error) {
          return json({ error: fallbackTypeQuery.error.message || 'Failed to load user verification documents.' }, { status: 500 });
        }

        docs = ((fallbackTypeQuery.data ?? []) as unknown as AdminDocumentRow[]).map((doc) => ({
          ...doc,
          document_type: normalizeDocumentType(doc)
        }));
      }
    }

    const documentsWithUrls = await Promise.all(
      (docs ?? []).map(async (doc) => {
        const { data: signed } = await adminClient.storage
          .from(BUCKET)
          .createSignedUrl(doc.storage_path, 60 * 60);

        return {
          ...doc,
          signed_url: signed?.signedUrl ?? null
        };
      })
    );

    return json({ documents: documentsWithUrls });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return json({ error: message }, { status: 500 });
  }
};

export const PATCH: RequestHandler = async ({ request }) => {
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

    const adminCheck = await isRequesterAdmin(token);
    if (!adminCheck.ok || !adminCheck.userId) {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const documentId = typeof body.documentId === 'string' ? body.documentId : '';
    const status = body.status === 'approved' || body.status === 'rejected' ? body.status : null;
    const note = typeof body.note === 'string' ? body.note.trim() : null;

    if (!documentId || !status) {
      return json({ error: 'Invalid payload' }, { status: 400 });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingDoc, error: existingError } = await adminClient
      .from('verification_documents')
      .select('id, user_id, status')
      .eq('id', documentId)
      .maybeSingle();

    if (existingError) {
      return json({ error: existingError.message }, { status: 500 });
    }

    if (!existingDoc) {
      return json({ error: 'Document not found' }, { status: 404 });
    }

    const { error: updateError } = await adminClient
      .from('verification_documents')
      .update({
        status,
        admin_note: note || null,
        reviewed_by: adminCheck.userId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId);

    let effectiveUpdateError = updateError;
    if (isStatusConstraintError(effectiveUpdateError?.message)) {
      const legacyStatus = normalizeLegacyStatus(status);
      const retryUpdate = await adminClient
        .from('verification_documents')
        .update({
          status: legacyStatus,
          admin_note: note || null,
          reviewed_by: adminCheck.userId,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId);
      effectiveUpdateError = retryUpdate.error;
    }

    if (effectiveUpdateError) {
      return json({ error: effectiveUpdateError.message }, { status: 500 });
    }

    if (status === 'approved') {
      await adminClient
        .from('profiles')
        .update({ is_verified: true, updated_at: new Date().toISOString() })
        .eq('id', existingDoc.user_id);
    }

    if (status === 'rejected') {
      await adminClient
        .from('profiles')
        .update({ is_verified: false, updated_at: new Date().toISOString() })
        .eq('id', existingDoc.user_id);
    }

    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return json({ error: message }, { status: 500 });
  }
};
