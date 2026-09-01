import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

type ProfileRow = {
	id: string;
	public_id?: number | null;
	first_name: string | null;
	last_name: string | null;
	email: string | null;
	phone_number: string | null;
	gender: string | null;
	profile_photo_url?: string | null;
	is_admin: boolean | null;
	is_verified: boolean | null;
	user_status?: string | null;
	average_rating?: number | null;
	created_at: string | null;
};

const PROFILE_SELECT_WITH_RATING =
	'id, public_id, first_name, last_name, email, phone_number, gender, profile_photo_url, is_admin, is_verified, user_status, average_rating, created_at';
const PROFILE_SELECT_WITHOUT_RATING =
	'id, public_id, first_name, last_name, email, phone_number, gender, profile_photo_url, is_admin, is_verified, user_status, created_at';
const PROFILE_SELECT_BASE =
	'id, first_name, last_name, email, phone_number, gender, profile_photo_url, is_admin, is_verified, user_status, created_at';

function resolveVerificationLabel(isVerified: boolean): 'Verified' | 'Unverified' {
	return isVerified ? 'Verified' : 'Unverified';
}

function normalizeNameValue(value: string | null): string | null {
	if (!value) {
		return null;
	}

	const normalized = value.trim();
	if (!normalized) {
		return null;
	}

	const lowered = normalized.toLowerCase();
	if (lowered === 'male' || lowered === 'female') {
		return null;
	}

	return normalized;
}

function isMissingAverageRatingColumnError(error: { message?: string } | null): boolean {
	if (!error?.message) {
		return false;
	}

	return error.message.toLowerCase().includes('average_rating');
}

function isMissingPublicIdColumnError(error: { message?: string } | null): boolean {
	if (!error?.message) {
		return false;
	}

	return error.message.toLowerCase().includes('public_id');
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
						'SUPABASE_SERVICE_ROLE_KEY is missing. Set it in your environment (.env.local for local dev, or Vercel Project Settings > Environment Variables for deployment) and redeploy/restart.'
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
		const allAuthUsers: Array<{
			id: string;
			email: string | null;
			created_at: string | null;
			email_confirmed_at: string | null;
			confirmed_at: string | null;
			user_metadata?: Record<string, unknown>;
		}> = [];

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
					email_confirmed_at: u.email_confirmed_at ?? null,
					confirmed_at: u.confirmed_at ?? null,
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

			if (
				profilesError &&
				!isMissingAverageRatingColumnError(profilesError) &&
				!isMissingPublicIdColumnError(profilesError)
			) {
				return json({ error: profilesError.message }, { status: 500 });
			}

			let resolvedProfileRows = profileRows;
			if (
				profilesError &&
				(isMissingAverageRatingColumnError(profilesError) || isMissingPublicIdColumnError(profilesError))
			) {
				const { data: fallbackRows, error: fallbackError } = await adminClient
					.from('profiles')
					.select(PROFILE_SELECT_WITHOUT_RATING)
					.in('id', ids);

				if (fallbackError && !isMissingPublicIdColumnError(fallbackError)) {
					return json({ error: fallbackError.message }, { status: 500 });
				}

				if (fallbackError && isMissingPublicIdColumnError(fallbackError)) {
					const { data: baseRows, error: baseError } = await adminClient
						.from('profiles')
						.select(PROFILE_SELECT_BASE)
						.in('id', ids);

					if (baseError) {
						return json({ error: baseError.message }, { status: 500 });
					}

					resolvedProfileRows = (baseRows ?? []).map((row) => ({
						...row,
						average_rating: null,
						public_id: null
					}));
				} else {
					resolvedProfileRows = (fallbackRows ?? []).map((row) => ({
						...row,
						average_rating: null
					}));
				}
			}

			profilesById = new Map((resolvedProfileRows ?? []).map((row) => [row.id, row as ProfileRow]));
		}

		const users = allAuthUsers.map((authUser) => {
			const profile = profilesById.get(authUser.id);
			const emailConfirmed = Boolean(authUser.email_confirmed_at || authUser.confirmed_at);
			const profileVerified = Boolean(profile?.is_verified);
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
				public_id: profile?.public_id ?? null,
				first_name: profile?.first_name ?? parsedFirstName,
				last_name: profile?.last_name ?? parsedLastName,
				email: profile?.email ?? authUser.email,
				phone_number: profile?.phone_number ?? null,
				gender: profile?.gender ?? null,
				profile_photo_url: profile?.profile_photo_url ?? null,
				is_admin: profile?.is_admin ?? false,
				is_verified: profileVerified,
				email_confirmed: emailConfirmed,
				account_verified: profileVerified && emailConfirmed,
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
						'SUPABASE_SERVICE_ROLE_KEY is missing. Set it in your environment (.env.local for local dev, or Vercel Project Settings > Environment Variables for deployment) and redeploy/restart.'
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
		const field =
			body.field === 'is_admin' ||
			body.field === 'is_verified' ||
			body.field === 'email_confirmed' ||
			body.field === 'gender'
				? body.field
				: null;
		const value = typeof body.value === 'boolean' ? body.value : typeof body.value === 'string' ? body.value : null;
		const email = typeof body.email === 'string' ? body.email : null;
		const rawFirstName = typeof body.firstName === 'string' && body.firstName.trim() ? body.firstName.trim() : 'User';
		const firstName = normalizeNameValue(rawFirstName) ?? 'User';
		const rawLastName = typeof body.lastName === 'string' && body.lastName.trim() ? body.lastName.trim() : null;
		const lastName = normalizeNameValue(rawLastName);

		if (!userId || !field || value === null) {
			return json({ error: 'Invalid payload' }, { status: 400 });
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);

		if (field === 'email_confirmed') {
			if (value !== true) {
				return json(
					{
						error:
							'Unconfirming email is not supported from admin tools. Use "Mark email confirmed" only.'
					},
					{ status: 400 }
				);
			}

			const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
				email_confirm: true
			});

			if (authUpdateError) {
				return json({ error: authUpdateError.message }, { status: 500 });
			}

			return json({ success: true });
		}

		const payload: Record<string, unknown> = {
			id: userId,
			updated_at: new Date().toISOString()
		};

		// Only add name fields if updating a boolean field (is_admin, is_verified)
		if (field === 'is_admin' || field === 'is_verified') {
			payload.first_name = firstName;
			payload.last_name = lastName;
		}

		if (field === 'is_verified' && typeof value === 'boolean') {
			if (value) {
				const { data: profileForVerification, error: profileForVerificationError } = await adminClient
					.from('profiles')
					.select('profile_photo_url')
					.eq('id', userId)
					.maybeSingle();

				if (profileForVerificationError) {
					return json({ error: profileForVerificationError.message }, { status: 500 });
				}

				const profilePhotoUrl =
					typeof profileForVerification?.profile_photo_url === 'string'
						? profileForVerification.profile_photo_url.trim()
						: '';

				if (!profilePhotoUrl) {
					return json(
						{ error: 'Profile photo is required before marking this account as verified.' },
						{ status: 400 }
					);
				}
			}

			payload.status = resolveVerificationLabel(value);
		}

		payload[field] = value;

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

export const DELETE: RequestHandler = async ({ request }) => {
	try {
		if (!supabaseUrl || !supabaseAnonKey) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey) {
			return json(
				{
					error:
						'SUPABASE_SERVICE_ROLE_KEY is missing. Set it in your environment (.env.local for local dev, or Vercel Project Settings > Environment Variables for deployment) and redeploy/restart.'
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

		if (!userId) {
			return json({ error: 'Invalid payload' }, { status: 400 });
		}

		if (adminCheck.userId && adminCheck.userId === userId) {
			return json({ error: 'You cannot delete your own account from the admin panel.' }, { status: 400 });
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);

		// First, manually cascade delete related data to avoid foreign key constraint violations
		// This handles cases where ON DELETE CASCADE may not be properly configured
		try {
			// Delete reviews where this user is the reviewer or reviewee
			await adminClient.from('reviews').delete().or(`reviewer_id.eq.${userId},reviewee_id.eq.${userId}`);

			// Delete bookings where this user is the passenger
			await adminClient.from('bookings').delete().eq('passenger_id', userId);

			// Delete rides where this user is the driver
			await adminClient.from('rides').delete().eq('driver_id', userId);

			// Delete reports where this user is the reporter or reported user
			await adminClient.from('reports').delete().or(`reporter_id.eq.${userId},user_id.eq.${userId}`);

			// Delete support tickets where this user is the user
			await adminClient.from('support_tickets').delete().eq('user_id', userId);

			// Delete verification documents
			await adminClient.from('verification_documents').delete().eq('user_id', userId);

			// Delete transactions related to this user (if user_id column exists)
			try {
				await adminClient.from('transactions').delete().eq('user_id', userId);
			} catch {
				// Transactions table may not have user_id column or may not exist - continue anyway
			}

			// Now delete the profile (this may cascade or may need explicit deletion)
			await adminClient.from('profiles').delete().eq('id', userId);
		} catch (cascadeError) {
			// Log cascade errors but continue - the auth.users deletion should still work
			console.warn('Cascade delete warning:', cascadeError);
		}

		// Finally delete the auth user
		const { error } = await adminClient.auth.admin.deleteUser(userId);
		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		return json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
