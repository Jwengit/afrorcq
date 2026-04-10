import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

type ProfileRow = {
	id: string;
	first_name: string | null;
	last_name: string | null;
	email: string | null;
	phone_number: string | null;
	is_admin: boolean | null;
	is_verified: boolean | null;
	user_status?: string | null;
	average_rating?: number | null;
	created_at: string | null;
};

const PROFILE_SELECT_WITH_RATING =
	'id, first_name, last_name, email, phone_number, is_admin, is_verified, user_status, average_rating, created_at';
const PROFILE_SELECT_WITHOUT_RATING =
	'id, first_name, last_name, email, phone_number, is_admin, is_verified, user_status, created_at';

function isMissingAverageRatingColumnError(error: { message?: string } | null): boolean {
	if (!error?.message) {
		return false;
	}

	return error.message.toLowerCase().includes('average_rating');
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

function getBearerToken(request: Request): string | null {
	const authHeader = request.headers.get('authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}
	return authHeader.slice(7);
}

export const GET: RequestHandler = async ({ request }) => {
	try {
		if (!supabaseUrl || !supabaseAnonKey) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey) {
			return json(
				{
					error:
						'SUPABASE_SERVICE_ROLE_KEY is missing. Add it to .env.local then restart the dev server.'
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

		const adminClient = createClient(supabaseUrl, serviceRoleKey);
		const allAuthUsers: Array<{ id: string; email: string | null; created_at: string | null; user_metadata?: Record<string, unknown> }> = [];

		let page = 1;
		const perPage = 100;
		while (true) {
			const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
			if (error) {
				return json({ error: error.message }, { status: 500 });
			}

			const pageUsers = data?.users ?? [];
			allAuthUsers.push(
				...pageUsers.map((u) => ({
					id: u.id,
					email: u.email ?? null,
					created_at: u.created_at ?? null,
					user_metadata: (u.user_metadata as Record<string, unknown> | undefined) ?? {}
				}))
			);

			if (pageUsers.length < perPage) {
				break;
			}
			page += 1;
		}

		const ids = allAuthUsers.map((u) => u.id);
		let profilesById = new Map<string, ProfileRow>();

		if (ids.length > 0) {
			const { data: profileRows, error: profilesError } = await adminClient
				.from('profiles')
				.select(PROFILE_SELECT_WITH_RATING)
				.in('id', ids);

			if (profilesError && !isMissingAverageRatingColumnError(profilesError)) {
				return json({ error: profilesError.message }, { status: 500 });
			}

			let resolvedProfileRows = profileRows;
			if (profilesError && isMissingAverageRatingColumnError(profilesError)) {
				const { data: fallbackRows, error: fallbackError } = await adminClient
					.from('profiles')
					.select(PROFILE_SELECT_WITHOUT_RATING)
					.in('id', ids);

				if (fallbackError) {
					return json({ error: fallbackError.message }, { status: 500 });
				}

				resolvedProfileRows = (fallbackRows ?? []).map((row) => ({
					...row,
					average_rating: null
				}));
			}

			profilesById = new Map((resolvedProfileRows ?? []).map((row) => [row.id, row as ProfileRow]));
		}

		const users = allAuthUsers.map((authUser) => {
			const profile = profilesById.get(authUser.id);
			const fullName =
				typeof authUser.user_metadata?.full_name === 'string'
					? authUser.user_metadata.full_name
					: typeof authUser.user_metadata?.name === 'string'
						? authUser.user_metadata.name
						: '';
			const parsedFirstName = fullName.trim().split(' ').filter(Boolean)[0] || null;
			const parsedLastName = fullName.trim().split(' ').slice(1).join(' ') || null;

			return {
				id: authUser.id,
				first_name: profile?.first_name ?? parsedFirstName,
				last_name: profile?.last_name ?? parsedLastName,
				email: profile?.email ?? authUser.email,
				phone_number: profile?.phone_number ?? null,
				is_admin: profile?.is_admin ?? false,
				is_verified: profile?.is_verified ?? false,
				user_status: profile?.user_status ?? 'active',
				average_rating: profile?.average_rating ?? null,
				created_at: profile?.created_at ?? authUser.created_at,
				has_profile: Boolean(profile)
			};
		});

		return json({ users });
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
						'SUPABASE_SERVICE_ROLE_KEY is missing. Add it to .env.local then restart the dev server.'
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

		const body = await request.json();
		const userId = typeof body.userId === 'string' ? body.userId : '';
		const field = body.field === 'is_admin' || body.field === 'is_verified' ? body.field : null;
		const value = typeof body.value === 'boolean' ? body.value : null;
		const email = typeof body.email === 'string' ? body.email : null;
		const firstName = typeof body.firstName === 'string' && body.firstName.trim() ? body.firstName.trim() : 'User';
		const lastName = typeof body.lastName === 'string' && body.lastName.trim() ? body.lastName.trim() : null;

		if (!userId || !field || value === null) {
			return json({ error: 'Invalid payload' }, { status: 400 });
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);
		const payload: Record<string, unknown> = {
			id: userId,
			first_name: firstName,
			last_name: lastName,
			updated_at: new Date().toISOString(),
			[field]: value
		};

		if (email) {
			payload.email = email;
		}

		const { error } = await adminClient.from('profiles').upsert(payload, { onConflict: 'id' });
		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		return json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
