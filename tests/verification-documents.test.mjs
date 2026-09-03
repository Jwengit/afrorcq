import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildVerificationDocumentInsertPayload,
  resolveExistingDocumentType
} from '../src/lib/verification-documents.ts';

test('buildVerificationDocumentInsertPayload writes both legacy and current document type fields', () => {
  const payload = buildVerificationDocumentInsertPayload({
    userId: 'user-123',
    documentType: 'driver_license',
    fileName: 'license.pdf',
    storagePath: 'user-123/license.pdf',
    mimeType: 'application/pdf',
    fileSize: 42
  });

  assert.equal(payload.document_type, 'driver_license');
  assert.equal(payload.doc_type, 'driver_license');
  assert.equal(payload.user_id, 'user-123');
  assert.equal(payload.file_name, 'license.pdf');
});

test('resolveExistingDocumentType falls back to the legacy column name', () => {
  assert.equal(resolveExistingDocumentType({ document_type: null, doc_type: 'proof_of_address' }), 'proof_of_address');
  assert.equal(resolveExistingDocumentType({}), 'other');
});
