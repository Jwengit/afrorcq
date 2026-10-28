// VERSION: cron-duplicate-accounts 2026-10-28
import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import {
	findDuplicateGroups,
	loadProfilesForDuplicateCheck,
	sendDuplicateAlert
} from '$lib/server/duplicate-accounts';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';

export const GET: RequestHandler = async ({ request }) => {
	// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" automatically
	const cronSecret = env.CRON_SECRET?.trim();
	if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!supabaseUrl || !env.SUPABASE_SERVICE_ROLE_KEY) {
		return json({ error: 'Server configuration error' }, { status: 500 });
	}

	const adminClient = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY);

	try {
		const profiles = await loadProfilesForDuplicateCheck(adminClient);
		const groups = findDuplicateGroups(profiles);

		if (groups.length === 0) {
			return json({ checked: profiles.length, groups: 0, alerted: 0 });
		}

		// Groups already reported in a previous alert are not sent again
		const { data: known, error: knownError } = await adminClient
			.from('duplicate_alerts')
			.select('group_key');

		if (knownError) {
			console.error('[duplicate check] duplicate_alerts table unavailable:', knownError.message);
			return json(
				{ error: 'The duplicate_alerts table is missing. Run the SQL file first.' },
				{ status: 500 }
			);
		}

		const knownKeys = new Set((known ?? []).map((row: { group_key: string }) => row.group_key));
		const freshGroups = groups.filter((group) => !knownKeys.has(group.key));

		if (freshGroups.length === 0) {
			return json({ checked: profiles.length, groups: groups.length, alerted: 0 });
		}

		const { sent, sentGroups } = await sendDuplicateAlert(freshGroups);

		if (sent) {
			const { error: insertError } = await adminClient
				.from('duplicate_alerts')
				.insert(sentGroups.map((group) => ({ group_key: group.key })));
			if (insertError) {
				console.error('[duplicate check] Could not record sent alerts:', insertError.message);
			}
		}

		return json({
			checked: profiles.length,
			groups: groups.length,
			alerted: sent ? sentGroups.length : 0,
			emailSent: sent
		});
	} catch (error) {
		console.error('[duplicate check] Failed:', error);
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};