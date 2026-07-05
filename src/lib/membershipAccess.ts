export type MemberStatus = 'free' | 'pending' | 'verified';

type StatusInput = {
  status?: string | null;
  isVerified?: boolean | null;
  membershipPaid?: boolean | null;
  membershipExpiresAt?: string | null;
};

function normalizeStatusLabel(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function hasActiveMembership(membershipPaid: boolean, membershipExpiresAt: string | null | undefined): boolean {
  if (!membershipPaid) return false;
  const timestamp = Date.parse(membershipExpiresAt ?? '');
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

export function resolveMemberStatus(input: StatusInput): MemberStatus {
  const rawStatus = normalizeStatusLabel(input.status);

  if (rawStatus === 'verified' || rawStatus === 'free' || rawStatus === 'pending') {
    return rawStatus;
  }

  if (rawStatus === 'approved') {
    return 'pending';
  }

  if (rawStatus === 'unverified' || rawStatus === 'inactive') {
    return 'free';
  }

  if (rawStatus === 'under_review') {
    return 'pending';
  }

  const verified = Boolean(input.isVerified);
  const activeMembership = hasActiveMembership(Boolean(input.membershipPaid), input.membershipExpiresAt);

  if (verified && activeMembership) {
    return 'verified';
  }

  if (verified) {
    return 'pending';
  }

  return 'free';
}

export function canUseVerifiedFeatures(status: MemberStatus): boolean {
  return status === 'verified';
}

export function canAccessGirlsOnlyRides(status: MemberStatus, gender: string | null | undefined): boolean {
  return status === 'verified' && (gender ?? '').trim().toLowerCase() === 'female';
}

export const VERIFIED_ONLY_MESSAGE =
  'This feature is available for verified members only. Upgrade your plan to unlock full access.';
