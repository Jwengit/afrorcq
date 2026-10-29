// VERSION: admin-transactions membership 2026-10-29
import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { env } from '$env/dynamic/private';
import { getStripeClient } from '$lib/server/stripe';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

type TxRow = {
	id: string;
	user_id: string | null;
	amount: number | string;
	currency: string | null;
	status: string;
	refund_status: string;
	refunded_amount: number | string | null;
	refund_method: string | null;
	refund_note: string | null;
	refunded_at: string | null;
	created_at: string;
	period_end: string | null;
	plan_name: string | null;
	member_name: string | null;
	member_email: string | null;
	account_closed_at: string | null;
	external_reference: string | null;
	paypal_order_id: string | null;
	admin_notes: string | null;
	provider: string | null;
};

const COLUMNS =
	'id, user_id, amount, currency, status, refund_status, refunded_amount, refund_method, refund_note, refunded_at, created_at, period_end, plan_name, member_name, member_email, account_closed_at, external_reference, paypal_order_id, admin_notes, provider';

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

async function isRequesterAdmin(token: string): Promise<boolean> {
	if (!supabaseUrl || !supabaseAnonKey) return false;

	const anonClient = createClient(supabaseUrl, supabaseAnonKey);
	const {
		data: { user },
		error: userError
	} = await anonClient.auth.getUser(token);

	if (userError || !user) return false;

	if ((user.email ?? '').toLowerCase() === 'hizli.carpooling@gmail.com') return true;

	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!serviceRoleKey) return false;
	const adminClient = createClient(supabaseUrl, serviceRoleKey);
	const { data: profile } = await adminClient
		.from('profiles')
		.select('is_admin')
		.eq('id', user.id)
		.maybeSingle();

	return Boolean(profile?.is_admin);
}

function getBearerToken(request: Request): string | null {
	const authHeader = request.headers.get('authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
	return authHeader.slice(7);
}

/**
 * Refund policy: unused part of the paid year (from the closing date, or today),
 * minus the payment processing fee (about 2.9% + $0.30, estimated).
 */
function computeRefundFigures(tx: TxRow) {
	const amount = Number(tx.amount || 0);
	const alreadyRefunded = Number(tx.refunded_amount ?? 0);
	const remainingRefundable = Math.max(0, round2(amount - alreadyRefunded));

	let unusedPart = 0;
	if (tx.period_end) {
		const start = new Date(tx.created_at).getTime();
		const end = new Date(tx.period_end).getTime();
		const reference = tx.account_closed_at ? new Date(tx.account_closed_at).getTime() : Date.now();
		if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
			const remainingTime = Math.max(0, end - Math.max(reference, start));
			const fraction = Math.min(1, remainingTime / (end - start));
			unusedPart = round2(amount * fraction);
		}
	}

	const feeEstimate = amount > 0 ? round2(amount * 0.029 + 0.3) : 0;
	const suggestedRefund = Math.max(0, Math.min(remainingRefundable, round2(unusedPart - feeEstimate)));

	return {
		remaining_refundable: remainingRefundable,
		unused_part: unusedPart,
		fee_estimate: feeEstimate,
		suggested_refund: suggestedRefund
	};
}

/** Finds the Stripe payment to refund from an invoice id (works with old and new Stripe API versions). */
async function findRefundTarget(
	stripe: Stripe,
	invoiceId: string
): Promise<{ payment_intent: string } | { charge: string } | null> {
	const anyStripe = stripe as unknown as Record<string, any>;

	try {
		if (anyStripe.invoicePayments?.list) {
			const payments = await anyStripe.invoicePayments.list({ invoice: invoiceId, limit: 5 });
			for (const payment of payments?.data ?? []) {
				const intent = payment?.payment?.payment_intent;
				const intentId = typeof intent === 'string' ? intent : intent?.id;
				if (intentId) return { payment_intent: intentId };
			}
		}
	} catch (error) {
		console.warn('[admin transactions] invoicePayments lookup failed:', error);
	}

	try {
		const invoice = (await stripe.invoices.retrieve(invoiceId)) as unknown as Record<string, any>;
		const intent = invoice.payment_intent;
		const intentId = typeof intent === 'string' ? intent : intent?.id;
		if (intentId) return { payment_intent: intentId };
		const charge = invoice.charge;
		const chargeId = typeof charge === 'string' ? charge : charge?.id;
		if (chargeId) return { charge: chargeId };
	} catch (error) {
		console.warn('[admin transactions] invoice lookup failed:', error);
	}

	return null;
}

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		if (!supabaseUrl || !supabaseAnonKey) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const token = getBearerToken(request);
		if (!token) return json({ error: 'Unauthorized' }, { status: 401 });
		if (!(await isRequesterAdmin(token))) return json({ error: 'Forbidden' }, { status: 403 });

		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey) {
			return json({ error: 'SUPABASE_SERVICE_ROLE_KEY is missing.' }, { status: 500 });
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);

		let query = adminClient
			.from('transactions')
			.select(COLUMNS)
			.order('created_at', { ascending: false })
			.limit(500);

		// Membership payments only, unless the old ride payments are requested
		if ((url.searchParams.get('scope') ?? '') !== 'all') {
			query = query.eq('provider', 'stripe');
		}

		const filter = (url.searchParams.get('filter') ?? 'all').toLowerCase();
		if (filter === 'due') query = query.eq('refund_status', 'pending');
		if (filter === 'refunded') query = query.in('refund_status', ['refunded', 'partial']);

		const { data, error } = await query;
		if (error) {
			const hint = /column/i.test(error.message)
				? ' A column is missing: run the file transactions_membership.sql in the Supabase SQL Editor.'
				: '';
			return json({ error: `${error.message}${hint}` }, { status: 500 });
		}

		const rows = (data ?? []) as unknown as TxRow[];

		// Fallback: member details from the live profile when the record has none yet
		const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean))) as string[];
		const profileMap: Record<string, { name: string | null; email: string | null; plan: string | null }> = {};
		if (userIds.length > 0) {
			const { data: profiles } = await adminClient
				.from('profiles')
				.select('id, first_name, last_name, email, membership_plan')
				.in('id', userIds);
			for (const profile of profiles ?? []) {
				profileMap[profile.id] = {
					name: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || null,
					email: profile.email ?? null,
					plan: profile.membership_plan ?? null
				};
			}
		}

		const transactions = rows.map((row) => {
			const profile = row.user_id ? profileMap[row.user_id] : undefined;
			return {
				...row,
				amount: Number(row.amount || 0),
				refunded_amount: Number(row.refunded_amount ?? 0),
				member_name: row.member_name ?? profile?.name ?? null,
				member_email: row.member_email ?? profile?.email ?? null,
				plan_name: row.plan_name ?? profile?.plan ?? null,
				...computeRefundFigures(row)
			};
		});

		if ((url.searchParams.get('format') ?? '').toLowerCase() === 'csv') {
			const columns = [
				'created_at',
				'member_name',
				'member_email',
				'plan_name',
				'amount',
				'currency',
				'status',
				'refund_status',
				'refunded_amount',
				'refund_method',
				'refunded_at',
				'period_end',
				'account_closed_at',
				'external_reference',
				'refund_note'
			];
			const escapeCell = (value: unknown) =>
				value === null || value === undefined ? '' : `"${String(value).replace(/"/g, '""')}"`;
			const csv = [
				columns.join(','),
				...transactions.map((tx) =>
					columns.map((column) => escapeCell((tx as Record<string, unknown>)[column])).join(',')
				)
			].join('\n');
			return new Response(csv, {
				headers: {
					'Content-Type': 'text/csv; charset=utf-8',
					'Content-Disposition': `attachment; filename="payments-${new Date().toISOString().slice(0, 10)}.csv"`
				}
			});
		}

		return json({ transactions, stripe_refund_enabled: env.ENABLE_STRIPE_REFUND === 'true' });
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
		if (!(await isRequesterAdmin(token))) return json({ error: 'Forbidden' }, { status: 403 });

		const body = await request.json();
		const action = body?.action as string | undefined;
		const transactionId = body?.transactionId as string | undefined;

		if (!transactionId || (action !== 'refund_stripe' && action !== 'refund_manual')) {
			return json({ error: 'Unknown action.' }, { status: 400 });
		}

		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey) {
			return json({ error: 'SUPABASE_SERVICE_ROLE_KEY is missing.' }, { status: 500 });
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);
		const { data, error: fetchError } = await adminClient
			.from('transactions')
			.select(COLUMNS)
			.eq('id', transactionId)
			.maybeSingle();

		if (fetchError) return json({ error: fetchError.message }, { status: 500 });
		if (!data) return json({ error: 'Transaction not found.' }, { status: 404 });

		const row = data as unknown as TxRow;
		if (row.provider !== 'stripe') {
			return json({ error: 'Only Stripe membership payments can be refunded here.' }, { status: 400 });
		}
		if (row.status !== 'succeeded') {
			return json({ error: 'Only a successful payment can be refunded.' }, { status: 400 });
		}

		const figures = computeRefundFigures(row);
		const amount = round2(Number(body?.amount));
		if (!Number.isFinite(amount) || amount <= 0) {
			return json({ error: 'Enter a valid refund amount.' }, { status: 400 });
		}
		if (amount > figures.remaining_refundable + 0.005) {
			return json(
				{ error: `The maximum refundable amount is $${figures.remaining_refundable.toFixed(2)}.` },
				{ status: 400 }
			);
		}

		const note = String(body?.note ?? '').trim().slice(0, 500);
		const now = new Date().toISOString();
		let method = 'stripe';
		let stripeRefundId: string | null = null;

		if (action === 'refund_stripe') {
			if (env.ENABLE_STRIPE_REFUND !== 'true') {
				return json(
					{
						error:
							'Card refunds through Stripe are disabled. Set ENABLE_STRIPE_REFUND=true in Vercel after testing in test mode, or use "I refunded another way".'
					},
					{ status: 503 }
				);
			}
			if (!row.external_reference) {
				return json({ error: 'This payment has no Stripe invoice reference.' }, { status: 400 });
			}

			const stripe = getStripeClient();
			const reference = row.external_reference;
			const target = reference.startsWith('pi_')
				? { payment_intent: reference }
				: reference.startsWith('ch_')
					? { charge: reference }
					: await findRefundTarget(stripe, reference);
			if (!target) {
				return json(
					{
						error:
							'Could not find the card payment for this invoice in Stripe. Refund it from the Stripe dashboard, then use "I refunded another way".'
					},
					{ status: 400 }
				);
			}

			const cents = Math.round(amount * 100);
			const alreadyCents = Math.round(Number(row.refunded_amount ?? 0) * 100);
			try {
				const refund = await stripe.refunds.create(
					{
						...target,
						amount: cents,
						reason: 'requested_by_customer',
						metadata: { transaction_id: row.id }
					} as Stripe.RefundCreateParams,
					{ idempotencyKey: `refund-${row.id}-${alreadyCents}-${cents}` }
				);
				stripeRefundId = refund.id;
			} catch (stripeError) {
				const message = stripeError instanceof Error ? stripeError.message : 'Unknown Stripe error';
				return json({ error: `Stripe refused the refund: ${message}` }, { status: 502 });
			}
		} else {
			method = String(body?.method ?? '').trim().slice(0, 50);
			if (!method) {
				return json({ error: 'Tell us how you refunded the member (Zelle, check...).' }, { status: 400 });
			}
		}

		const totalRefunded = round2(Number(row.refunded_amount ?? 0) + amount);
		const dateLabel = now.slice(0, 10);
		const noteLine = `[${dateLabel}] $${amount.toFixed(2)} refunded via ${method}${stripeRefundId ? ` (${stripeRefundId})` : ''}.${note ? ` ${note}` : ''}`;
		const combinedNote = [row.refund_note, noteLine].filter(Boolean).join('\n');

		const { error: updateError } = await adminClient
			.from('transactions')
			.update({
				refund_status: 'refunded',
				refunded_amount: totalRefunded,
				refund_method: method,
				refunded_at: now,
				refund_note: combinedNote,
				updated_at: now
			})
			.eq('id', row.id);

		if (updateError) {
			return json(
				{
					error: `The refund was made${stripeRefundId ? ` in Stripe (${stripeRefundId})` : ''} but could not be saved here: ${updateError.message}. Please note it manually.`
				},
				{ status: 500 }
			);
		}

		return json({ success: true, refunded_amount: totalRefunded, stripe_refund_id: stripeRefundId });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};