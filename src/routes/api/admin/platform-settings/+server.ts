import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

async function isRequesterAdmin(token: string): Promise<boolean> {
	if (!supabaseUrl || !supabaseAnonKey) {
		return false;
	}

	const anonClient = createClient(supabaseUrl, supabaseAnonKey);
	const {
		data: { user },
		error: userError
	} = await anonClient.auth.getUser(token);

	if (userError || !user) {
		return false;
	}

	const isHizliAccount = (user.email ?? '').toLowerCase() === 'hizli.carpooling@gmail.com';
	if (isHizliAccount) {
		return true;
	}

	const { data: profile } = await anonClient
		.from('profiles')
		.select('is_admin')
		.eq('id', user.id)
		.maybeSingle();

	return Boolean(profile?.is_admin);
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

		const token = getBearerToken(request);
		if (!token) return json({ error: 'Unauthorized' }, { status: 401 });

		const adminAllowed = await isRequesterAdmin(token);
		if (!adminAllowed) return json({ error: 'Forbidden' }, { status: 403 });

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

		const adminClient = createClient(supabaseUrl, serviceRoleKey);
		const { data, error } = await adminClient
			.from('platform_settings')
			.select('commission_percent, max_seats, max_price, updated_at')
			.eq('id', 1)
			.maybeSingle();

		if (error) {
			if (error.message.toLowerCase().includes('relation') && error.message.toLowerCase().includes('platform_settings')) {
				return json({
					settings: {
						commission_percent: 10,
						max_seats: 6,
						max_price: 200,
						updated_at: null
					}
				});
			}
			return json({ error: error.message }, { status: 500 });
		}

		return json({
			settings: data ?? {
				commission_percent: 10,
				max_seats: 6,
				max_price: 200,
				updated_at: null
			}
		});
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

		const token = getBearerToken(request);
		if (!token) return json({ error: 'Unauthorized' }, { status: 401 });

		const adminAllowed = await isRequesterAdmin(token);
		if (!adminAllowed) return json({ error: 'Forbidden' }, { status: 403 });

		const body = await request.json();
		const commission = Number(body?.commission_percent);
		const maxSeats = Number(body?.max_seats);
		const maxPrice = Number(body?.max_price);

		if (
			Number.isNaN(commission) ||
			Number.isNaN(maxSeats) ||
			Number.isNaN(maxPrice) ||
			commission < 0 ||
			commission > 100 ||
			maxSeats < 1 ||
			maxPrice < 1
		) {
			return json({ error: 'Valeurs de configuration invalides.' }, { status: 400 });
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

		const adminClient = createClient(supabaseUrl, serviceRoleKey);
		const { error } = await adminClient.from('platform_settings').upsert(
			{
				id: 1,
				commission_percent: commission,
				max_seats: maxSeats,
				max_price: maxPrice,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'id' }
		);

		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		return json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
