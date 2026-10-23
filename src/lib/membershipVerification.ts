export type VerificationProfile = {
	membership_plan?: string | null;
	profile_photo_url?: string | null;
	car_make?: string | null;
	plate_number?: string | null;
};

export type VerificationDocument = {
	document_type?: string | null;
	status?: string | null;
	created_at?: string | null;
};

const REQUIRED_DRIVER_DOCUMENT_TYPES = [
	'driver_license_front',
	'driver_license_back',
	'insurance',
	'vehicle_registration'
] as const;

export function normalizeVerificationDocumentType(value: string | null | undefined): string {
	const normalized = (value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
	if (normalized === 'identity' || normalized === 'id_card') return 'identity_card';
	if (normalized === 'license' || normalized === 'driving_license') return 'driver_license_front';
	if (normalized === 'insurance_proof') return 'insurance';
	if (normalized === 'registration' || normalized === 'vehicle_papers') return 'vehicle_registration';
	return normalized;
}

export function isMembershipVerificationReady(
	profile: VerificationProfile | null | undefined,
	documents: VerificationDocument[]
): boolean {
	if (!profile?.profile_photo_url?.trim()) return false;
	if (profile.membership_plan !== 'student' && profile.membership_plan !== 'standard') return false;

	const latestByType = new Map<string, VerificationDocument>();
	for (const document of [...documents].sort(
		(a, b) => Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? '')
	)) {
		const type = normalizeVerificationDocumentType(document.document_type);
		if (type && !latestByType.has(type)) latestByType.set(type, document);
	}

	const requiredTypes = [
		'identity_card_front',
		'identity_card_back',
		'proof_of_address',
		...(profile.membership_plan === 'student' ? ['student_id'] : []),
		...(profile.car_make?.trim() || profile.plate_number?.trim()
			? REQUIRED_DRIVER_DOCUMENT_TYPES
			: [])
	];

	return requiredTypes.every(
		(type) => (latestByType.get(type)?.status ?? '').trim().toLowerCase() === 'approved'
	);
}
