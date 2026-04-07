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
	is_admin: boolean | null;
	is_verified: boolean | null;
	created_at: string | null;
};

async function isRequesterAdmin(token: string): Promise<{ ok: boolean; userId?: string; email?: string }> {
	if (!supabaseUrl || !supabaseAnonKey) {
		return { ok: false };
	}

	const userClient = createClient(supabaseUrl, supabaseAnonKey, {
		global: {
			headers: {
				authorization: `Bearer ${token}`
			}
		}
	});

	const {
		data: { user },
		error: userError
	} = await userClient.auth.getUser();

	if (userError || !user) {
		return { ok: false };
	}

	const isHizliAccount = (user.email ?? '').toLowerCase() === 'hizli.carpooling@gmail.com';
	if (isHizliAccount) {
		return { ok: true, userId: user.id, email: user.email ?? undefined };
	}

	const { data: profile } = await userClient
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
				.select('id, first_name, last_name, email, is_admin, is_verified, created_at')
				.in('id', ids);

			if (profilesError) {
				return json({ error: profilesError.message }, { status: 500 });
			}

			profilesById = new Map((profileRows ?? []).map((row) => [row.id, row as ProfileRow]));
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
				is_admin: profile?.is_admin ?? false,
				is_verified: profile?.is_verified ?? false,
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
