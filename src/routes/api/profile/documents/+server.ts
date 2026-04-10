import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';
const BUCKET = 'verification-documents';

type DocumentRow = {
  id: string;
  document_type?: string | null;
  doc_type?: string | null;
  type?: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  status: string;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};


function isStatusConstraintError(message: string | undefined): boolean {
  const m = (message || '').toLowerCase();
  return m.includes('verification_documents_status_check') ||
    (m.includes('check constraint') && m.includes('status'));
}

function normalizeDocumentType(row: DocumentRow): string {
  return row.document_type ?? row.doc_type ?? row.type ?? 'other';
}

function createApiClient(token: string) {
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    return createClient(supabaseUrl, serviceRoleKey);
  }

  // Fallback for deployments where service role env is missing.
  // Uses the authenticated user's token and RLS policies.
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        authorization: `Bearer ${token}`
      }
    }
  });
}

async function tryInsertDocumentRecord(
  adminClient: unknown,
  input: {
    userId: string;
    documentType: string;
    fileName: string;
    storagePath: string;
    mimeType: string | null;
    fileSize: number | null;
  }
) {
  const db = adminClient as {
    from: (table: string) => {
      insert: (values: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
    };
  };

  const variants: Array<Record<string, unknown>> = [
    {
      user_id: input.userId,
      document_type: input.documentType,
      doc_type: input.documentType,
      type: input.documentType,
      file_name: input.fileName,
      file_url: input.storagePath,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      file_size: input.fileSize
    },
    {
      user_id: input.userId,
      document_type: input.documentType,
      doc_type: input.documentType,
      file_name: input.fileName,
      file_url: input.storagePath,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      file_size: input.fileSize
    },
    {
      user_id: input.userId,
      document_type: input.documentType,
      type: input.documentType,
      file_name: input.fileName,
      file_url: input.storagePath,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      file_size: input.fileSize
    },
    {
      user_id: input.userId,
      doc_type: input.documentType,
      file_name: input.fileName,
      file_url: input.storagePath,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      file_size: input.fileSize
    },
    {
      user_id: input.userId,
      type: input.documentType,
      file_name: input.fileName,
      file_url: input.storagePath,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      file_size: input.fileSize
    },
    {
      user_id: input.userId,
      document_type: input.documentType,
      file_name: input.fileName,
      file_url: input.storagePath,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      file_size: input.fileSize
    },
    {
      user_id: input.userId,
      document_type: input.documentType,
      file_name: input.fileName,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      file_size: input.fileSize
    }
  ];

  const statusVariants = ['pending', 'Pending'];
  let lastError: { message?: string } | null = null;

  for (const variant of variants) {
    for (const status of statusVariants) {
      const { error } = await db.from('verification_documents').insert({
        ...variant,
        status
      });

      if (!error) {
        return null;
      }

      lastError = error;
      const message = error.message?.toLowerCase() ?? '';
      const retryableMissingColumn =
        message.includes('does not exist') || message.includes('could not find the') || message.includes('column');
      const retryableConstraint = isStatusConstraintError(error.message) || message.includes('file_url');

      if (!(retryableMissingColumn || retryableConstraint)) {
        return error;
      }
    }
  }

  return lastError;
}

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

    const adminClient = createApiClient(token);

    let docs: DocumentRow[] = [];

    const primaryQuery = await adminClient
      .from('verification_documents')
      .select('id, document_type, file_name, storage_path, mime_type, file_size, status, admin_note, reviewed_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!primaryQuery.error) {
      docs = ((primaryQuery.data ?? []) as unknown as DocumentRow[]).map((doc) => ({
        ...doc,
        document_type: normalizeDocumentType(doc)
      }));

      if (docs.some((doc) => !doc.document_type || doc.document_type === 'other')) {
        const legacyDocTypeQuery = await adminClient
          .from('verification_documents')
          .select('id, doc_type')
          .eq('user_id', user.id);

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
          .eq('user_id', user.id);

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
        .select('id, doc_type, file_name, storage_path, mime_type, file_size, status, admin_note, reviewed_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!fallbackDocTypeQuery.error) {
        docs = ((fallbackDocTypeQuery.data ?? []) as unknown as DocumentRow[]).map((doc) => ({
          ...doc,
          document_type: normalizeDocumentType(doc)
        }));
      } else {
        const fallbackTypeQuery = await adminClient
          .from('verification_documents')
          .select('id, type, file_name, storage_path, mime_type, file_size, status, admin_note, reviewed_at, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (fallbackTypeQuery.error) {
          return json({ error: fallbackTypeQuery.error.message || 'Failed to load verification documents.' }, { status: 500 });
        }

        docs = ((fallbackTypeQuery.data ?? []) as unknown as DocumentRow[]).map((doc) => ({
          ...doc,
          document_type: normalizeDocumentType(doc)
        }));
      }
    }

    let documents = docs ?? [];
    const withUrls = await Promise.all(
      documents.map(async (doc) => {
        const { data: signed } = await adminClient.storage
          .from(BUCKET)
          .createSignedUrl(doc.storage_path, 60 * 30);

        return {
          ...doc,
          signed_url: signed?.signedUrl ?? null
        };
      })
    );

    documents = withUrls;

    return json({ documents });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return json({ error: message }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
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

    const contentType = request.headers.get('content-type') || '';
    const adminClient = createApiClient(token);

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const documentTypeValue = formData.get('documentType');
      const fileValue = formData.get('file');

      const documentType =
        typeof documentTypeValue === 'string' ? documentTypeValue.trim() : '';

      if (!documentType || !(fileValue instanceof File)) {
        return json({ error: 'Invalid payload' }, { status: 400 });
      }

      if (fileValue.size > 10 * 1024 * 1024) {
        return json({ error: 'Document size must be 10MB or less.' }, { status: 400 });
      }

      const safeName = fileValue.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${user.id}/${Date.now()}_${safeName}`;

      const { error: uploadError } = await adminClient.storage
        .from(BUCKET)
        .upload(storagePath, fileValue, { upsert: false, contentType: fileValue.type || undefined });

      if (uploadError) {
        return json({ error: uploadError.message || 'Unable to upload document.' }, { status: 500 });
      }

        const insertError = await tryInsertDocumentRecord(adminClient, {
          userId: user.id,
          documentType,
          fileName: fileValue.name,
          storagePath,
          mimeType: fileValue.type || null,
          fileSize: fileValue.size
        });

      if (insertError) {
        await adminClient.storage.from(BUCKET).remove([storagePath]);
        return json({ error: insertError.message }, { status: 500 });
      }

      await adminClient
        .from('profiles')
        .update({ is_verified: false, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      return json({ success: true });
    }

    const body = await request.json();
    const documentType = typeof body.documentType === 'string' ? body.documentType.trim() : '';
    const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
    const storagePath = typeof body.storagePath === 'string' ? body.storagePath.trim() : '';
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim() : null;
    const fileSize = Number(body.fileSize || 0);

    if (!documentType || !fileName || !storagePath || !storagePath.startsWith(`${user.id}/`)) {
      return json({ error: 'Invalid payload' }, { status: 400 });
    }

    const error = await tryInsertDocumentRecord(adminClient, {
      userId: user.id,
      documentType,
      fileName,
      storagePath,
      mimeType,
      fileSize: Number.isFinite(fileSize) ? fileSize : null
    });

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    await adminClient
      .from('profiles')
      .update({ is_verified: false, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return json({ error: message }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ request, url }) => {
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

    const documentId = url.searchParams.get('documentId') || '';
    if (!documentId) {
      return json({ error: 'documentId is required' }, { status: 400 });
    }

    const adminClient = createApiClient(token);

    const { data: doc, error: fetchError } = await adminClient
      .from('verification_documents')
      .select('id, storage_path, status')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError) {
      return json({ error: fetchError.message }, { status: 500 });
    }

    if (!doc) {
      return json({ error: 'Document not found' }, { status: 404 });
    }

    if (doc.status !== 'pending') {
      return json({ error: 'Only pending documents can be deleted.' }, { status: 400 });
    }

    await adminClient.storage.from(BUCKET).remove([doc.storage_path]);

    const { error: deleteError } = await adminClient
      .from('verification_documents')
      .delete()
      .eq('id', doc.id)
      .eq('user_id', user.id);

    if (deleteError) {
      return json({ error: deleteError.message }, { status: 500 });
    }

    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return json({ error: message }, { status: 500 });
  }
};
