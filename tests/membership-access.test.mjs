import test from 'node:test';
import assert from 'node:assert/strict';

import { canUseVerifiedFeatures, resolveMemberStatus } from '../src/lib/membershipAccess.ts';

test('legacy verified status with an active paid membership grants verified features', () => {
	const status = resolveMemberStatus({
		status: 'verified',
		isVerified: false,
		membershipPaid: true,
		membershipExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
	});

	assert.equal(status, 'verified');
	assert.equal(canUseVerifiedFeatures(status), true);
});

test('verified paid membership without an expiration date remains verified', () => {
	const status = resolveMemberStatus({
		status: 'verified',
		isVerified: true,
		membershipPaid: true,
		membershipExpiresAt: null
	});

	assert.equal(status, 'verified');
	assert.equal(canUseVerifiedFeatures(status), true);
});

test('legacy verified status without an active paid membership does not grant verified features', () => {
	const status = resolveMemberStatus({
		status: 'verified',
		isVerified: false,
		membershipPaid: true,
		membershipExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
	});

	assert.equal(status, 'pending');
	assert.equal(canUseVerifiedFeatures(status), false);
});
