import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

export const POST: RequestHandler = async ({ request }) => {
	if (!supabaseUrl || !supabaseAnonKey) {
		return json({ error: 'Server configuration error' }, { status: 500 });
	}

	const authorization = request.headers.get('authorization');
	if (!authorization?.startsWith('Bearer ')) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const authClient = createClient(supabaseUrl, supabaseAnonKey);
	const {
		data: { user },
		error: authError
	} = await authClient.auth.getUser(authorization.slice(7).trim());
	if (authError || !user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!serviceRoleKey) {
		return json({ error: 'Server configuration error' }, { status: 500 });
	}

	const adminClient = createClient(supabaseUrl, serviceRoleKey);
	const { error } = await adminClient
		.from('support_tickets')
		.update({ archived_at: new Date().toISOString() })
		.eq('user_id', user.id)
		.eq('initiated_by_admin', true)
		.in('status', ['resolved', 'closed'])
		.is('archived_at', null);

	if (error) {
		console.error('Resolved member conversation archival failed:', error);
		return json({ error: 'Unable to archive resolved conversations.' }, { status: 500 });
	}

	return json({ success: true });
};
