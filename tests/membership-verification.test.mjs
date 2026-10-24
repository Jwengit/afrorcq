import test from 'node:test';
import assert from 'node:assert/strict';

import {
	areRequiredMembershipDocumentsApproved,
	isMembershipVerificationReady
} from '../src/lib/membershipVerification.ts';

const studentProfile = {
	membership_plan: 'student',
	profile_photo_url: 'https://example.com/profile.jpg'
};

const approvedStudentDocuments = [
	{ document_type: 'identity_card_front', status: 'approved' },
	{ document_type: 'identity_card_back', status: 'approved' },
	{ document_type: 'student_id', status: 'approved' },
	{ document_type: 'proof_of_address', status: 'approved' }
];

test('student membership requires an approved student ID', () => {
	assert.equal(
		areRequiredMembershipDocumentsApproved(studentProfile, approvedStudentDocuments),
		true
	);
	assert.equal(
		areRequiredMembershipDocumentsApproved(
			studentProfile,
			approvedStudentDocuments.filter((document) => document.document_type !== 'student_id')
		),
		false
	);
});

test('approved documents are distinct from full verification readiness', () => {
	const profileWithoutPhoto = { ...studentProfile, profile_photo_url: null };

	assert.equal(
		areRequiredMembershipDocumentsApproved(profileWithoutPhoto, approvedStudentDocuments),
		true
	);
	assert.equal(isMembershipVerificationReady(profileWithoutPhoto, approvedStudentDocuments), false);
});
