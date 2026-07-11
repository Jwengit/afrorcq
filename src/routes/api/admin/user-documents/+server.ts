import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { sendDocumentRejectedEmail, sendDocumentsVerifiedEmail } from '$lib/email';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';
const BUCKET = 'verification-documents';
const REQUIRED_VERIFICATION_DOCUMENT_TYPES = [
  'identity_card_front',
  'identity_card_back'
] as const;

const STUDENT_EXTRA_DOCUMENT_TYPES = [
  'student_id'
] as const;

const DRIVER_REQUIRED_DOCUMENT_TYPES = [
  'driver_license',
  'insurance',
  'vehicle_registration'
] as const;

function resolveVerificationLabel(isVerified: boolean): 'Verified' | 'Unverified' {
  return isVerified ? 'Verified' : 'Unverified';
}

function normalizeLegacyStatus(status: 'approved' | 'rejected'): string {
  return status === 'approved' ? 'Approved' : 'Rejected';
}

function buildApprovalInboxMessage(siteUrl: string): string {
  const paymentUrl = `${siteUrl}/pricing`;
  return (
    `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">` +
    `<p style="margin: 0 0 10px;"><strong>Your documents have been verified!</strong></p>` +
    `<p style="margin: 0 0 12px;">Complete your membership to unlock full access.</p>` +
    `<p style="margin: 0;">` +
    `<a href="${paymentUrl}" style="display:inline-block;padding:9px 14px;border-radius:8px;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:600;">Complete my membership</a>` +
    `</p>` +
    `</div>`
  );
}

function buildRejectionInboxMessage(documentTypeLabel: string, note: string | null, siteUrl: string): string {
  const uploadUrl = `${siteUrl}/profile#verification-documents`;
  const noteHtml = note
    ? `<p style="margin: 0 0 12px; padding: 10px 12px; background: #fef2f2; border-left: 4px solid #ef4444; font-size: 14px;"><strong>Reason:</strong> ${note}</p>`
    : '';
  return (
    `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">` +
    `<p style="margin: 0 0 10px;"><strong>Your document "${documentTypeLabel}" has been rejected.</strong></p>` +
    noteHtml +
    `<p style="margin: 0 0 12px;">Please upload a new version of this document to continue the verification process.</p>` +
    `<p style="margin: 0;">` +
    `<a href="${uploadUrl}" style="display:inline-block;padding:9px 14px;border-radius:8px;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:600;">Re-upload document</a>` +
    `</p>` +
    `</div>`
  );
}

async function notifyRejectedDocument(adminClient: any, userId: string, documentType: string, note: string | null, siteUrl: string) {
  const subject = 'Action required — document rejected';

  const { data: existingTicket } = await adminClient
    .from('support_tickets')
    .select('id')
    .eq('user_id', userId)
    .eq('subject', subject)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let ticketId = existingTicket?.id ?? null;
  if (!ticketId) {
    const { data: createdTicket } = await adminClient
      .from('support_tickets')
      .insert({ user_id: userId, subject, status: 'open', priority: 'high' })
      .select('id')
      .single();
    ticketId = createdTicket?.id ?? null;
  }

  if (ticketId) {
    const label = documentType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    await adminClient.from('support_messages').insert({
      ticket_id: ticketId,
      sender_id: null,
      sender_role: 'admin',
      message: buildRejectionInboxMessage(label, note, siteUrl)
    });

    const { data: profile } = await adminClient
      .from('profiles')
      .select('first_name, email')
      .eq('id', userId)
      .maybeSingle();
    const memberEmail = (profile?.email ?? '').trim();
    if (memberEmail) {
      await sendDocumentRejectedEmail({
        to: memberEmail,
        firstName: profile?.first_name,
        reason: note || 'Please review and upload a new version of your document.'
      });
    }
  }
}

async function notifyApprovedMember(adminClient: any, userId: string, siteUrl: string) {
  const subject = 'Documents verified - complete your membership';

  const { data: existingTicket } = await adminClient
    .from('support_tickets')
    .select('id')
    .eq('user_id', userId)
    .eq('subject', subject)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let ticketId = existingTicket?.id ?? null;
  if (!ticketId) {
    const { data: createdTicket } = await adminClient
      .from('support_tickets')
      .insert({
        user_id: userId,
        subject,
        status: 'open',
        priority: 'normal'
      })
      .select('id')
      .single();
    ticketId = createdTicket?.id ?? null;
  }

  if (ticketId) {
    await adminClient.from('support_messages').insert({
      ticket_id: ticketId,
      sender_id: null,
      sender_role: 'admin',
      message: buildApprovalInboxMessage(siteUrl)
    });

    const { data: profile } = await adminClient
      .from('profiles')
      .select('first_name, email')
      .eq('id', userId)
      .maybeSingle();
    const memberEmail = (profile?.email ?? '').trim();
    if (memberEmail) {
      await sendDocumentsVerifiedEmail({
        to: memberEmail,
        firstName: profile?.first_name
      });
    }
  }
}

function normalizeDocumentType(value: string | null | undefined): string {
  const normalized = (value || '').trim().toLowerCase();

  if (normalized === 'identity' || normalized === 'id_card') return 'identity_card';
  if (normalized === 'license' || normalized === 'driving_license') return 'driver_license';
  if (normalized === 'insurance_proof') return 'insurance';
  if (normalized === 'registration' || normalized === 'vehicle_papers') return 'vehicle_registration';

  return normalized;
}

function isApprovedStatus(value: string | null | undefined): boolean {
  return (value || '').trim().toLowerCase() === 'approved';
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

function resolveRowDocumentType(row: {
  document_type?: string | null;
  doc_type?: string | null;
  type?: string | null;
}): string {
  return row.document_type ?? row.doc_type ?? row.type ?? 'other';
}

type VerificationDocumentStatusRow = {
  document_type?: string | null;
  doc_type?: string | null;
  type?: string | null;
  status?: string | null;
};

async function shouldMarkProfileVerified(adminClient: any, userId: string): Promise<boolean> {
  try {
    const { data: profile } = await adminClient
      .from('profiles')
      .select('plate_number, car_make, profile_photo_url, membership_plan')
      .eq('id', userId)
      .maybeSingle();

    const profilePhotoUrl =
      typeof profile?.profile_photo_url === 'string' ? profile.profile_photo_url.trim() : '';
    if (!profilePhotoUrl) return false;

    const { data, error } = await adminClient
      .from('verification_documents')
      .select('document_type, status')
      .eq('user_id', userId);

    if (error) return false;

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
  } catch {
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
        document_type: resolveRowDocumentType(doc)
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
          document_type: resolveRowDocumentType(doc)
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
          document_type: resolveRowDocumentType(doc)
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
      .select('id, user_id, status, document_type, doc_type, type')
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
      const allApproved = await shouldMarkProfileVerified(adminClient, existingDoc.user_id);

      if (allApproved) {
        await adminClient
          .from('profiles')
          .update({
            is_verified: false,
            status: 'approved',
            updated_at: new Date().toISOString()
          })
          .eq('id', existingDoc.user_id);

        const siteUrl = (env.PUBLIC_SITE_URL ?? 'http://localhost:5173').replace(/\/$/, '');

        await notifyApprovedMember(adminClient, existingDoc.user_id, siteUrl);
      }
    } else {
      // Doc rejected: keep profile in 'pending' so the member can re-upload without re-choosing a plan
      const siteUrl = (env.PUBLIC_SITE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
      const rejectedDocType = resolveRowDocumentType(existingDoc);
      await notifyRejectedDocument(adminClient, existingDoc.user_id, rejectedDocType, note, siteUrl);
    }

    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return json({ error: message }, { status: 500 });
  }
};
