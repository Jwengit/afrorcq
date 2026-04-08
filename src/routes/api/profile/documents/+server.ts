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

type VerificationDocumentColumn = 'document_type' | 'doc_type' | 'type' | 'file_url';

function isStatusConstraintError(message: string | undefined): boolean {
  const m = (message || '').toLowerCase();
  return m.includes('verification_documents_status_check') ||
    (m.includes('check constraint') && m.includes('status'));
}

async function getVerificationDocumentColumns(adminClient: ReturnType<typeof createClient>) {
  const { data, error } = await adminClient
    .from('information_schema.columns')
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'verification_documents')
    .in('column_name', ['document_type', 'doc_type', 'type', 'file_url']);

  if (error) {
    return new Set<VerificationDocumentColumn>(['document_type', 'file_url']);
  }

  return new Set((data ?? []).map((row) => row.column_name as VerificationDocumentColumn));
}

function normalizeDocumentType(row: DocumentRow): string {
  return row.document_type ?? row.doc_type ?? row.type ?? 'other';
}

function buildDocumentInsertPayload(
  columns: Set<VerificationDocumentColumn>,
  input: {
    userId: string;
    documentType: string;
    fileName: string;
    storagePath: string;
    mimeType: string | null;
    fileSize: number | null;
    status: string;
  }
) {
  const payload: Record<string, unknown> = {
    user_id: input.userId,
    file_name: input.fileName,
    storage_path: input.storagePath,
    mime_type: input.mimeType,
    file_size: input.fileSize,
    status: input.status
  };

  if (columns.has('document_type')) payload.document_type = input.documentType;
  if (columns.has('doc_type')) payload.doc_type = input.documentType;
  if (columns.has('type')) payload.type = input.documentType;
  if (columns.has('file_url')) payload.file_url = input.storagePath;

  return payload;
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

    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return json(
        {
          error:
            'SUPABASE_SERVICE_ROLE_KEY is missing. Add it to .env.local then restart the dev server.'
        },
        { status: 500 }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const columns = await getVerificationDocumentColumns(adminClient);
    const selectFields = [
      'id',
      'file_name',
      'storage_path',
      'mime_type',
      'file_size',
      'status',
      'admin_note',
      'reviewed_at',
      'created_at',
      ...(columns.has('document_type') ? ['document_type'] : []),
      ...(columns.has('doc_type') ? ['doc_type'] : []),
      ...(columns.has('type') ? ['type'] : [])
    ].join(', ');

    const { data: rawDocs, error } = await adminClient
      .from('verification_documents')
      .select(selectFields)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return json({ error: error.message || 'Failed to load verification documents.' }, { status: 500 });
    }

    const docs = ((rawDocs ?? []) as DocumentRow[]).map((doc) => ({
      ...doc,
      document_type: normalizeDocumentType(doc)
    }));

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

    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return json(
        {
          error:
            'SUPABASE_SERVICE_ROLE_KEY is missing. Add it to .env.local then restart the dev server.'
        },
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

    const contentType = request.headers.get('content-type') || '';
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

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

        const columns = await getVerificationDocumentColumns(adminClient);
        let { error: insertError } = await adminClient.from('verification_documents').insert(
          buildDocumentInsertPayload(columns, {
            userId: user.id,
            documentType,
            fileName: fileValue.name,
            storagePath,
            mimeType: fileValue.type || null,
            fileSize: fileValue.size,
            status: 'pending'
          })
        );

        if (isStatusConstraintError(insertError?.message)) {
          const retryLegacyStatus = await adminClient.from('verification_documents').insert(
            buildDocumentInsertPayload(columns, {
              userId: user.id,
              documentType,
              fileName: fileValue.name,
              storagePath,
              mimeType: fileValue.type || null,
              fileSize: fileValue.size,
              status: 'Pending'
            })
          );
          insertError = retryLegacyStatus.error;
        }

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

    const columns = await getVerificationDocumentColumns(adminClient);
    let { error } = await adminClient.from('verification_documents').insert(
      buildDocumentInsertPayload(columns, {
        userId: user.id,
        documentType,
        fileName,
        storagePath,
        mimeType,
        fileSize: Number.isFinite(fileSize) ? fileSize : null,
        status: 'pending'
      })
    );

    if (isStatusConstraintError(error?.message)) {
      const retryLegacyStatus = await adminClient.from('verification_documents').insert(
        buildDocumentInsertPayload(columns, {
          userId: user.id,
          documentType,
          fileName,
          storagePath,
          mimeType,
          fileSize: Number.isFinite(fileSize) ? fileSize : null,
          status: 'Pending'
        })
      );
      error = retryLegacyStatus.error;
    }

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

    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return json(
        {
          error:
            'SUPABASE_SERVICE_ROLE_KEY is missing. Add it to .env.local then restart the dev server.'
        },
        { status: 500 }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

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
