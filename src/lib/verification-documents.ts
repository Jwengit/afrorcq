type VerificationDocumentRow = {
  document_type?: string | null;
  doc_type?: string | null;
  type?: string | null;
};

export function buildVerificationDocumentInsertPayload({
  userId,
  documentType,
  fileName,
  storagePath,
  mimeType,
  fileSize
}: {
  userId: string;
  documentType: string;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  fileSize: number | null;
}): {
  user_id: string;
  document_type: string;
  doc_type: string;
  file_name: string;
  file_url: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
} {
  const normalizedType = typeof documentType === 'string' ? documentType.trim() : '';

  return {
    user_id: userId,
    document_type: normalizedType,
    doc_type: normalizedType,
    file_name: fileName,
    file_url: storagePath,
    storage_path: storagePath,
    mime_type: mimeType ?? null,
    file_size: fileSize ?? null
  };
}

export function resolveExistingDocumentType(row: VerificationDocumentRow = {}): string {
  const value = row.document_type ?? row.doc_type ?? row.type ?? null;
  if (typeof value !== 'string') {
    return 'other';
  }

  const normalized = value.trim();
  return normalized || 'other';
}
