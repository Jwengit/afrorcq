export type MemberStatus = 'free' | 'pending' | 'verified';

type StatusInput = {
  status?: string | null;
  isVerified?: boolean | null;
  membershipPaid?: boolean | null;
  membershipExpiresAt?: string | null;
  reviewPending?: boolean | null;
};

export type FreeMemberProfileInput = {
  firstName?: string | null;
  lastName?: string | null;
  gender?: string | null;
  profilePhotoApproved?: boolean;
  profilePhotoUrl?: string | null;
  phoneNumber?: string | null;
  dateOfBirth?: string | null;
  cityOfBirth?: string | null;
  address?: string | null;
  zipCode?: string | null;
  bio?: string | null;
  languages?: readonly string[] | null;
  ridePreferences?: readonly string[] | null;
};

function normalizeStatusLabel(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function hasActiveMembership(
	membershipPaid: boolean,
	membershipExpiresAt: string | null | undefined,
	hasVerificationEvidence: boolean
): boolean {
  if (!membershipPaid) return false;
  const timestamp = Date.parse(membershipExpiresAt ?? '');
  if (Number.isFinite(timestamp)) return timestamp > Date.now();
  return hasVerificationEvidence;
}

export function resolveMemberStatus(input: StatusInput): MemberStatus {
  const rawStatus = normalizeStatusLabel(input.status);

  const hasVerificationEvidence = rawStatus === 'verified' || Boolean(input.isVerified);
  const verified = hasVerificationEvidence;
  const activeMembership = hasActiveMembership(
    Boolean(input.membershipPaid),
    input.membershipExpiresAt,
    hasVerificationEvidence
  );

  if (verified && activeMembership) {
    return 'verified';
  }

  if (hasVerificationEvidence) {
    return 'pending';
  }

  if (rawStatus === 'free' || rawStatus === 'unverified' || rawStatus === 'inactive') {
    return 'free';
  }

  if (rawStatus === 'pending' || rawStatus === 'approved' || rawStatus === 'under_review') {
    return 'pending';
  }

  return 'free';
}

export function canUseVerifiedFeatures(status: MemberStatus): boolean {
  return status === 'verified';
}

function hasNonEmptySelection(values: readonly string[] | null | undefined): boolean {
  return (
    Array.isArray(values) &&
    values.some((value) => typeof value === 'string' && value.trim().length > 0)
  );
}

export function hasCompleteFreeMemberProfile(profile: FreeMemberProfileInput): boolean {
  return Boolean(
    profile.firstName?.trim() &&
      profile.lastName?.trim() &&
      profile.gender?.trim() &&
      profile.profilePhotoApproved &&
      profile.profilePhotoUrl?.trim() &&
      profile.phoneNumber?.trim() &&
      profile.dateOfBirth?.trim() &&
      profile.cityOfBirth?.trim() &&
      profile.address?.trim() &&
      profile.zipCode?.trim() &&
      profile.bio?.trim() &&
      hasNonEmptySelection(profile.languages) &&
      hasNonEmptySelection(profile.ridePreferences)
  );
}

export function canAccessGirlsOnlyRides(status: MemberStatus, gender: string | null | undefined): boolean {
  return status === 'verified' && (gender ?? '').trim().toLowerCase() === 'female';
}

export function hasPendingReviewBlock(input: StatusInput): boolean {
  return Boolean(input.reviewPending);
}

export const VERIFIED_ONLY_MESSAGE =
  'This feature is available for verified members only. Upgrade your plan to unlock full access.';
