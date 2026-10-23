import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { sendVerificationReviewSummaryEmail } from '$lib/email';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';
const BUCKET = 'verification-documents';
const DRIVER_REQUIRED_DOCUMENT_TYPES = [
  'driver_license_front',
  'driver_license_back',
  'insurance',
  'vehicle_registration'
] as const;

function normalizeLegacyStatus(status: 'approved' | 'rejected'): string {
  return status === 'approved' ? 'Approved' : 'Rejected';
}

function normalizeDocumentType(value: string | null | undefined): string {
  const normalized = (value || '').trim().toLowerCase();

  if (normalized === 'identity' || normalized === 'id_card') return 'identity_card';
  if (normalized === 'license' || normalized === 'driving_license') return 'driver_license_front';
  if (normalized === 'insurance_proof') return 'insurance';
  if (normalized === 'registration' || normalized === 'vehicle_papers') return 'vehicle_registration';

  return normalized;
}

function isApprovedStatus(value: string | null | undefined): boolean {
  return (value || '').trim().toLowerCase() === 'approved';
}

function normalizeReviewStatus(value: string | null | undefined): string {
  const status = (value || '').trim().toLowerCase();
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

async function sendReviewSummaryIfComplete(
  adminClient: Parameters<typeof shouldMarkProfileVerified>[0],
  userId: string,
  reviewedDocumentId: string
): Promise<void> {
  const { data: documents, error: documentsError } = await adminClient
    .from('verification_documents')
    .select('id, document_type, status, admin_note, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (documentsError) {
    console.error('Verification review summary document lookup error:', documentsError);
    return;
  }

  const latestByType = new Map<string, { id: string; status: string; admin_note: string | null }>();
  for (const document of documents ?? []) {
    const documentType = normalizeDocumentType(document.document_type);
    if (!latestByType.has(documentType)) {
      latestByType.set(documentType, {
        id: document.id,
        status: normalizeReviewStatus(document.status),
        admin_note: document.admin_note
      });
    }
  }

  const reviewedDocument = (documents ?? []).find(
    (document: { id: string }) => document.id === reviewedDocumentId
  );
  if (
    !reviewedDocument ||
    latestByType.get(normalizeDocumentType(reviewedDocument.document_type))?.id !== reviewedDocumentId
  ) {
    return;
  }

  if (latestByType.size === 0 || [...latestByType.values()].some((document) => document.status === 'pending')) {
    return;
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('first_name, email, status')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) {
    console.error('Verification review summary profile lookup error:', profileError);
    return;
  }

  const email = (profile?.email ?? '').trim();
  if (!email) {
    console.warn('Verification review summary skipped: member email is missing.');
    return;
  }

  const approvedDocuments: string[] = [];
  const rejectedDocuments: Array<{ name: string; reason: string | null }> = [];
  for (const [name, document] of latestByType) {
    if (document.status === 'approved') {
      approvedDocuments.push(name);
    } else {
      rejectedDocuments.push({ name, reason: document.admin_note });
    }
  }

  const membershipReady =
    rejectedDocuments.length === 0 &&
    (profile?.status ?? '').toLowerCase() === 'approved' &&
    (await shouldMarkProfileVerified(adminClient, userId));
  const emailId = await sendVerificationReviewSummaryEmail({
    to: email,
    firstName: profile?.first_name,
    approvedDocuments,
    rejectedDocuments,
    membershipReady
  });
  if (!emailId) {
    console.error('Verification review summary email was not sent.');
  }
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

function resolveRowDocumentType(row: {
  document_type?: string | null;
}): string {
  return row.document_type ?? 'other';
}

async function shouldMarkProfileVerified(adminClient: any, userId: string): Promise<boolean> {
  try {
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('plate_number, car_make, profile_photo_url, membership_plan')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('Verification eligibility profile lookup error:', profileError);
      return false;
    }

    const profilePhotoUrl =
      typeof profile?.profile_photo_url === 'string' ? profile.profile_photo_url.trim() : '';
    if (!profilePhotoUrl) return false;

    const { data, error } = await adminClient
      .from('verification_documents')
      .select('document_type, status')
      .eq('user_id', userId);

    if (error) {
      console.error('Verification eligibility document lookup error:', error);
      return false;
    }

    const rows = (data ?? []) as Array<{ document_type?: string | null; status?: string | null }>;
    const approvedTypes = new Set(
      rows
        .filter((doc) => isApprovedStatus(doc.status))
        .map((doc) => normalizeDocumentType(doc.document_type ?? ''))
        .filter(Boolean)
    );

    // Everyone needs both identity_card front and back
    if (!approvedTypes.has('identity_card_front') || !approvedTypes.has('identity_card_back')) return false;

    // Everyone also needs proof_of_address
    if (!approvedTypes.has('proof_of_address')) return false;

    // Student plan also needs student_id
    const isStudent = (profile?.membership_plan ?? '').toLowerCase() === 'student';
    if (isStudent && !approvedTypes.has('student_id')) return false;

    // Drivers also need driver docs
    const isDriver = Boolean(profile?.plate_number || profile?.car_make);
    if (isDriver) {
      return DRIVER_REQUIRED_DOCUMENT_TYPES.every((t) => approvedTypes.has(t));
    }

    return true;
  } catch (error) {
    console.error('Unexpected error while checking verification eligibility:', error);
    return false;
  }
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

  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return { ok: false };
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile } = await adminClient
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
        document_type: resolveRowDocumentType(doc)
      }));
    } else {
      return json({ error: primaryQuery.error.message || 'Failed to load user verification documents.' }, { status: 500 });
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
      .select('id, user_id, status, document_type')
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

    const wasSameStatus = normalizeReviewStatus(existingDoc.status) === status;
    let profileBecameApproved = false;

    if (status === 'approved') {
      const allApproved = await shouldMarkProfileVerified(adminClient, existingDoc.user_id);

      if (allApproved) {
        const { data: profile, error: profileError } = await adminClient
          .from('profiles')
          .select('status')
          .eq('id', existingDoc.user_id)
          .maybeSingle();
        if (profileError) {
          console.error('Profile approval status lookup error:', profileError);
          return json({ error: 'Unable to check the profile approval status.' }, { status: 500 });
        }

        profileBecameApproved = (profile?.status ?? '').toLowerCase() !== 'approved';
        const { error: profileUpdateError } = await adminClient
          .from('profiles')
          .update({
            is_verified: false,
            status: 'approved',
            updated_at: new Date().toISOString()
          })
          .eq('id', existingDoc.user_id);
        if (profileUpdateError) {
          console.error('Profile approval status update error:', profileUpdateError);
          return json({ error: 'Documents were reviewed, but the profile approval status could not be updated.' }, { status: 500 });
        }
      }
    }

    if (!wasSameStatus || profileBecameApproved) {
      await sendReviewSummaryIfComplete(adminClient, existingDoc.user_id, existingDoc.id);
    }

    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return json({ error: message }, { status: 500 });
  }
};
