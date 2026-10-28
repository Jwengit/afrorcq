// VERSION: duplicate-accounts 2026-10-28
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { ADMIN_EMAIL, sendSimpleEmail } from '$lib/server/account-closure';

export type ProfileRow = {
	id: string;
	email: string | null;
	first_name: string | null;
	last_name: string | null;
	phone_number: string | null;
	date_of_birth: string | null;
	address: string | null;
	zip_code: string | null;
	created_at?: string | null;
	membership_paid: boolean | null;
	is_verified: boolean | null;
};

export type DuplicateGroup = {
	key: string;
	reasons: string[];
	strong: boolean;
	accounts: ProfileRow[];
};

const MAX_GROUPS_PER_ALERT = 15;

function normalizeText(value: string | null | undefined): string {
	return (value ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function normalizePhone(value: string | null | undefined): string {
	let digits = (value ?? '').replace(/\D/g, '');
	if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
	return digits.length >= 7 ? digits : '';
}

function createdAtTime(profile: ProfileRow): number {
	const time = profile.created_at ? new Date(profile.created_at).getTime() : 0;
	return Number.isFinite(time) ? time : 0;
}

export async function loadProfilesForDuplicateCheck(client: SupabaseClient): Promise<ProfileRow[]> {
	const pageSize = 1000;
	const rows: ProfileRow[] = [];
	let withCreatedAt = true;

	for (let from = 0; ; from += pageSize) {
		const columns =
			'id, email, first_name, last_name, phone_number, date_of_birth, address, zip_code, membership_paid, is_verified' +
			(withCreatedAt ? ', created_at' : '');
		const { data, error } = await client
			.from('profiles')
			.select(columns)
			.order('id')
			.range(from, from + pageSize - 1);

		if (error) {
			// Some schemas have no created_at column: retry the same page without it
			if (withCreatedAt && /created_at/i.test(error.message)) {
				withCreatedAt = false;
				from -= pageSize;
				continue;
			}
			throw new Error(error.message);
		}

		rows.push(...((data ?? []) as unknown as ProfileRow[]));
		if (!data || data.length < pageSize) break;
	}

	return rows;
}

export function findDuplicateGroups(profiles: ProfileRow[]): DuplicateGroup[] {
	const buckets = new Map<string, { reason: string; strong: boolean; accounts: ProfileRow[] }>();

	function addToBucket(bucketKey: string, reason: string, strong: boolean, profile: ProfileRow) {
		const bucket = buckets.get(bucketKey) ?? { reason, strong, accounts: [] };
		bucket.accounts.push(profile);
		buckets.set(bucketKey, bucket);
	}

	for (const profile of profiles) {
		const phone = normalizePhone(profile.phone_number);
		if (phone) addToBucket(`phone:${phone}`, `same phone number (${phone})`, true, profile);

		const first = normalizeText(profile.first_name);
		const last = normalizeText(profile.last_name);
		const dob = (profile.date_of_birth ?? '').trim();
		if (first && last && dob) {
			addToBucket(`name-dob:${first}|${last}|${dob}`, 'same name and date of birth', true, profile);
		}

		const address = normalizeText(profile.address);
		const zip = normalizeText(profile.zip_code);
		if (address && zip) {
			addToBucket(
				`address:${address}|${zip}`,
				'same address and ZIP code (could be family or roommates)',
				false,
				profile
			);
		}
	}

	// The same set of accounts can match on several signals: merge them into one alert
	const merged = new Map<string, DuplicateGroup>();
	for (const bucket of buckets.values()) {
		if (bucket.accounts.length < 2) continue;

		const sorted = [...bucket.accounts].sort((a, b) => createdAtTime(b) - createdAtTime(a));
		const key = sorted
			.map((account) => account.id)
			.sort()
			.join(',');

		const existing = merged.get(key);
		if (existing) {
			if (!existing.reasons.includes(bucket.reason)) existing.reasons.push(bucket.reason);
			existing.strong = existing.strong || bucket.strong;
		} else {
			merged.set(key, { key, reasons: [bucket.reason], strong: bucket.strong, accounts: sorted });
		}
	}

	// Strong signals first
	return [...merged.values()].sort((a, b) => Number(b.strong) - Number(a.strong));
}

function describeAccount(account: ProfileRow, isMostRecent: boolean): string {
	const name = `${account.first_name ?? ''} ${account.last_name ?? ''}`.trim() || 'No name';
	const created = account.created_at
		? new Date(account.created_at).toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			})
		: 'unknown';
	return `- ${name} | ${account.email ?? 'no email'} | created: ${created} | verified: ${account.is_verified ? 'yes' : 'no'} | membership paid: ${account.membership_paid ? 'yes' : 'no'}${isMostRecent ? ' | MOST RECENT' : ''}`;
}

/**
 * Sends one alert email to the admin. Returns true when the email was sent.
 * Only the groups included in the email are returned in `sentGroups`.
 */
export async function sendDuplicateAlert(
	groups: DuplicateGroup[]
): Promise<{ sent: boolean; sentGroups: DuplicateGroup[] }> {
	const toSend = groups.slice(0, MAX_GROUPS_PER_ALERT);
	const siteUrl = (String(env.PUBLIC_SITE_URL ?? '').trim() || 'https://afrorcqvercelapp.vercel.app').replace(/\/$/, '');

	const lines: string[] = [
		'Our daily check found accounts that may belong to the same person. Nothing has been changed: this is only an alert.'
	];

	toSend.forEach((group, index) => {
		lines.push(
			`Group ${index + 1} (${group.strong ? 'strong signal' : 'possible'}): ${group.reasons.join('; ')}`
		);
		group.accounts.forEach((account, accountIndex) => {
			const hasDates = group.accounts.every((item) => Boolean(item.created_at));
			lines.push(describeAccount(account, hasDates && accountIndex === 0));
		});
	});

	if (groups.length > toSend.length) {
		lines.push(`${groups.length - toSend.length} more group(s) will be included in the next alert.`);
	}

	lines.push(
		'What to do: review the accounts. If it really is a duplicate, send the member a message giving 72 hours to close one account. After that, close the most recent one. If it has a paid membership, the refund rule in our Terms applies.'
	);

	const sent = await sendSimpleEmail({
		to: ADMIN_EMAIL,
		subject: `Possible duplicate accounts (${toSend.length})`,
		lines,
		buttonLabel: 'Open administration',
		buttonUrl: `${siteUrl}/admin`
	});

	return { sent, sentGroups: toSend };
}