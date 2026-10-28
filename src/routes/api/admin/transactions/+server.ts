import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

function getBearerToken(request: Request): string | null {
	const authHeader = request.headers.get('authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}
	return authHeader.slice(7);
}

async function isRequesterAdmin(
	token: string
): Promise<{ ok: boolean; userId?: string; email?: string }> {
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

	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!serviceRoleKey) {
		return { ok: false };
	}

	const adminClient = createClient(supabaseUrl, serviceRoleKey);
	const { data: profile } = await adminClient
		.from('profiles')
		.select('is_admin')
		.eq('id', user.id)
		.maybeSingle();

	if (!profile?.is_admin) {
		return { ok: false };
	}

	return { ok: true, userId: user.id, email: user.email ?? undefined };
}

// ---------------------------------------------------------------------------
// GET /api/admin/transactions?provider=stripe&status=&refund_status=&from_date=&to_date=&search=
// ---------------------------------------------------------------------------
export const GET: RequestHandler = async ({ request, url }) => {
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

		const provider = url.searchParams.get('provider') ?? 'stripe';
		const status = url.searchParams.get('status');
		const refundStatus = url.searchParams.get('refund_status');
		const fromDate = url.searchParams.get('from_date');
		const toDate = url.searchParams.get('to_date');
		const search = url.searchParams.get('search')?.trim().toLowerCase();

		let query = adminClient
			.from('transactions')
			.select(
				'id, member_name, member_email, plan_name, amount, currency, status, period_end, refund_status, refund_method, refund_note, refunded_amount, created_at, external_reference'
			)
			.eq('provider', provider)
			.order('created_at', { ascending: false });

		if (status) query = query.eq('status', status);
		if (refundStatus) query = query.eq('refund_status', refundStatus);
		if (fromDate) query = query.gte('created_at', fromDate);
		if (toDate) query = query.lte('created_at', toDate + 'T23:59:59');

		const { data, error } = await query;
		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		let rows = data ?? [];
		if (search) {
			rows = rows.filter((row) => {
				const haystack = [row.id, row.member_name, row.member_email, row.plan_name]
					.filter(Boolean)
					.join(' ')
					.toLowerCase();
				return haystack.includes(search);
			});
		}

		const transactions = rows.map((row) => ({
			id: row.id,
			member_name: row.member_name,
			member_email: row.member_email,
			plan_name: row.plan_name,
			amount: Number(row.amount ?? 0),
			currency: row.currency ?? 'USD',
			status: row.status,
			period_end: row.period_end,
			refund_status: row.refund_status ?? 'none',
			refund_method: row.refund_method,
			refund_note: row.refund_note,
			refunded_amount: Number(row.refunded_amount ?? 0),
			created_at: row.created_at,
			stripe_payment_intent_id: row.external_reference
		}));

		return json({ transactions });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};

// ---------------------------------------------------------------------------
// PATCH /api/admin/transactions
// Actions : refund_other (actif) | refund_card (désactivé pour l'instant)
// ---------------------------------------------------------------------------
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

		const adminClient = createClient(supabaseUrl, serviceRoleKey);

		const body = await request.json().catch(() => null);
		if (!body || !body.transactionId || !body.action) {
			return json({ error: 'transactionId and action are required' }, { status: 400 });
		}

		const { transactionId, action } = body;

		if (action === 'refund_other') {
			const amount = Number(body.amount);
			const note = String(body.note ?? '').trim();

			if (!amount || amount <= 0) {
				return json({ error: 'Amount must be greater than 0.' }, { status: 400 });
			}
			if (!note) {
				return json(
					{ error: 'A note is required for "refunded another way".' },
					{ status: 400 }
				);
			}

			const { data: tx, error: txError } = await adminClient
				.from('transactions')
				.select('id, amount, refunded_amount, refund_status')
				.eq('id', transactionId)
				.maybeSingle();

			if (txError || !tx) {
				return json({ error: 'Transaction not found.' }, { status: 404 });
			}

			const alreadyRefunded = Number(tx.refunded_amount ?? 0);
			const remaining = Number(tx.amount ?? 0) - alreadyRefunded;

			if (amount > remaining + 0.001) {
				return json(
					{ error: `Amount exceeds remaining balance (${remaining.toFixed(2)}).` },
					{ status: 400 }
				);
			}

			const newRefundedTotal = alreadyRefunded + amount;
			const newRefundStatus =
				newRefundedTotal >= Number(tx.amount ?? 0) ? 'refunded' : 'partial';

			const { error: updateError } = await adminClient
				.from('transactions')
				.update({
					refund_status: newRefundStatus,
					refund_method: 'other',
					refunded_amount: newRefundedTotal,
					refund_note: note,
					updated_at: new Date().toISOString()
				})
				.eq('id', transactionId);

			if (updateError) {
				return json({ error: updateError.message }, { status: 500 });
			}

			return json({ success: true, refund_status: newRefundStatus });
		}

		if (action === 'refund_card') {
			if (env.ENABLE_STRIPE_REFUND !== 'true') {
				return json(
					{
						error:
							'Stripe card refunds are disabled. Enable ENABLE_STRIPE_REFUND after test-mode validation.'
					},
					{ status: 503 }
				);
			}
			return json({ error: 'Not implemented yet.' }, { status: 501 });
		}

		return json({ error: 'Unknown action.' }, { status: 400 });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};

// ---------------------------------------------------------------------------
// DELETE /api/admin/transactions?id=
// ---------------------------------------------------------------------------
export const DELETE: RequestHandler = async ({ request, url }) => {
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

		const id = url.searchParams.get('id');
		if (!id) return json({ error: 'Missing id.' }, { status: 400 });

		const { error } = await adminClient.from('transactions').delete().eq('id', id);
		if (error) return json({ error: error.message }, { status: 500 });

		return json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};