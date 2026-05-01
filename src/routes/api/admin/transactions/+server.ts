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

const allowedTransactionStatuses = ['pending', 'succeeded', 'failed', 'canceled'] as const;
const allowedRefundStatuses = ['none', 'pending', 'refunded', 'failed'] as const;
const allowedAdminStatuses = ['awaiting_payout', 'validated', 'payout_done', 'dispute'] as const;

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		if (!supabaseUrl || !supabaseAnonKey) {
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const token = getBearerToken(request);
		if (!token) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const adminAllowed = await isRequesterAdmin(token);
		if (!adminAllowed) {
			return json({ error: 'Forbidden' }, { status: 403 });
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

		let query = adminClient
			.from('transactions')
			.select(
				`id, booking_id, ride_id, user_id, seats_booked, amount, currency, status, refund_status,
				commission_percent, commission_amount, driver_payout_amount,
				admin_status, payout_at, external_reference, admin_notes,
				provider, paypal_order_id, created_at, updated_at,
				profiles!transactions_user_id_fkey(first_name, last_name, email, payment_method)`
			)
			.order('created_at', { ascending: false });

		const status = (url.searchParams.get('status') ?? '').toLowerCase();
		const refundStatus = (url.searchParams.get('refund_status') ?? '').toLowerCase();
		const adminStatus = (url.searchParams.get('admin_status') ?? '').toLowerCase();
		const fromDate = (url.searchParams.get('from_date') ?? '').trim();
		const toDate = (url.searchParams.get('to_date') ?? '').trim();

		if (allowedTransactionStatuses.includes(status as (typeof allowedTransactionStatuses)[number])) {
			query = query.eq('status', status);
		}

		if (allowedRefundStatuses.includes(refundStatus as (typeof allowedRefundStatuses)[number])) {
			query = query.eq('refund_status', refundStatus);
		}

		if (allowedAdminStatuses.includes(adminStatus as (typeof allowedAdminStatuses)[number])) {
			query = query.eq('admin_status', adminStatus);
		}

		if (fromDate) {
			query = query.gte('created_at', `${fromDate}T00:00:00.000Z`);
		}

		if (toDate) {
			query = query.lte('created_at', `${toDate}T23:59:59.999Z`);
		}

		const { data, error } = await query;
		if (error) {
			if (error.message.toLowerCase().includes('relation') && error.message.toLowerCase().includes('transactions')) {
				return json({ transactions: [] });
			}
			return json({ error: error.message }, { status: 500 });
		}

		const txList = data ?? [];

		// Collect ride IDs to fetch driver info in one query
		const rideIds = Array.from(new Set(txList.map((tx) => tx.ride_id).filter(Boolean)));
		const rideDriverMap: Record<string, { driver_id: string; departure: string | null; arrival: string | null; ride_date: string | null }> = {};
		const driverProfileMap: Record<string, { first_name: string | null; last_name: string | null; email: string | null; payment_method: string | null }> = {};

		if (rideIds.length > 0) {
			const { data: ridesData } = await adminClient
				.from('rides')
				.select('id, driver_id, departure, arrival, ride_date')
				.in('id', rideIds);

			if (ridesData) {
				for (const r of ridesData) {
					rideDriverMap[r.id] = {
						driver_id: r.driver_id,
						departure: r.departure ?? null,
						arrival: r.arrival ?? null,
						ride_date: r.ride_date ?? null
					};
				}

				const driverIds = Array.from(new Set(ridesData.map((r) => r.driver_id).filter(Boolean)));
				if (driverIds.length > 0) {
					const { data: driverProfiles } = await adminClient
						.from('profiles')
						.select('id, first_name, last_name, email, payment_method')
						.in('id', driverIds);

					if (driverProfiles) {
						for (const p of driverProfiles) {
							driverProfileMap[p.id] = {
								first_name: p.first_name ?? null,
								last_name: p.last_name ?? null,
								email: p.email ?? null,
								payment_method: p.payment_method ?? null
							};
						}
					}
				}
			}
		}

		const enriched = txList.map((tx) => {
			const rideInfo = tx.ride_id ? rideDriverMap[tx.ride_id] : null;
			const driverProfile = rideInfo ? driverProfileMap[rideInfo.driver_id] ?? null : null;
			const passenger = Array.isArray(tx.profiles) ? tx.profiles[0] : tx.profiles;

			// Compute commission amounts if not stored yet
			const amount = Number(tx.amount || 0);
			const commissionPct = Number(tx.commission_percent ?? 20);
			const commissionAmt = tx.commission_amount != null ? Number(tx.commission_amount) : Math.round(amount * commissionPct) / 100;
			const payoutAmt = tx.driver_payout_amount != null ? Number(tx.driver_payout_amount) : Math.round(amount * (100 - commissionPct)) / 100;

			return {
				...tx,
				profiles: undefined,
				passenger_profile: passenger ?? null,
				driver_profile: driverProfile,
				ride_info: rideInfo
					? { departure: rideInfo.departure, arrival: rideInfo.arrival, ride_date: rideInfo.ride_date }
					: null,
				commission_amount: commissionAmt,
				driver_payout_amount: payoutAmt,
				commission_percent: commissionPct,
				admin_status: tx.admin_status ?? 'awaiting_payout'
			};
		});

		return json({ transactions: enriched });
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
		if (!token) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const adminAllowed = await isRequesterAdmin(token);
		if (!adminAllowed) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		const body = await request.json();
		const transactionId = body?.transactionId as string | undefined;
		const action = body?.action as string | undefined;

		if (!transactionId || !action) {
			return json({ error: 'transactionId and action are required' }, { status: 400 });
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
		const now = new Date().toISOString();

		if (action === 'refund') {
			const { error } = await adminClient
				.from('transactions')
				.update({ refund_status: 'refunded', updated_at: now })
				.eq('id', transactionId);

			if (error) {
				return json({ error: error.message }, { status: 500 });
			}

			return json({ success: true });
		}

		if (action === 'set_admin_status') {
			const newStatus = body?.admin_status as string | undefined;
			if (!allowedAdminStatuses.includes(newStatus as (typeof allowedAdminStatuses)[number])) {
				return json({ error: 'Invalid admin_status value' }, { status: 400 });
			}

			const updatePayload: Record<string, unknown> = {
				admin_status: newStatus,
				updated_at: now
			};

			// Automatically set payout_at when marking as payout_done
			if (newStatus === 'payout_done' && body?.payout_at) {
				updatePayload.payout_at = body.payout_at;
			} else if (newStatus === 'payout_done') {
				updatePayload.payout_at = now;
			}

			const { error } = await adminClient
				.from('transactions')
				.update(updatePayload)
				.eq('id', transactionId);

			if (error) {
				return json({ error: error.message }, { status: 500 });
			}

			return json({ success: true, admin_status: newStatus, payout_at: updatePayload.payout_at ?? null });
		}

		if (action === 'set_statuses') {
			const newStatus = (body?.status as string | undefined)?.toLowerCase();
			const newRefundStatus = (body?.refund_status as string | undefined)?.toLowerCase();

			if (!allowedTransactionStatuses.includes(newStatus as (typeof allowedTransactionStatuses)[number])) {
				return json({ error: 'Invalid status value' }, { status: 400 });
			}

			if (!allowedRefundStatuses.includes(newRefundStatus as (typeof allowedRefundStatuses)[number])) {
				return json({ error: 'Invalid refund_status value' }, { status: 400 });
			}

			const { error } = await adminClient
				.from('transactions')
				.update({ status: newStatus, refund_status: newRefundStatus, updated_at: now })
				.eq('id', transactionId);

			if (error) {
				return json({ error: error.message }, { status: 500 });
			}

			return json({ success: true, status: newStatus, refund_status: newRefundStatus });
		}

		if (action === 'update_details') {
			const amount = Number(body?.amount ?? 0);
			const seatsBooked = Number(body?.seats_booked ?? 1);
			const commissionPercent = Number(body?.commission_percent ?? 20);
			const commissionAmount = Number(body?.commission_amount ?? 0);
			const driverPayoutAmount = Number(body?.driver_payout_amount ?? 0);
			const newStatus = (body?.status as string | undefined)?.toLowerCase();
			const newRefundStatus = (body?.refund_status as string | undefined)?.toLowerCase();
			const newAdminStatus = (body?.admin_status as string | undefined)?.toLowerCase();

			if (!allowedTransactionStatuses.includes(newStatus as (typeof allowedTransactionStatuses)[number])) {
				return json({ error: 'Invalid status value' }, { status: 400 });
			}

			if (!allowedRefundStatuses.includes(newRefundStatus as (typeof allowedRefundStatuses)[number])) {
				return json({ error: 'Invalid refund_status value' }, { status: 400 });
			}

			if (!allowedAdminStatuses.includes(newAdminStatus as (typeof allowedAdminStatuses)[number])) {
				return json({ error: 'Invalid admin_status value' }, { status: 400 });
			}

			const paymentAt = body?.payment_at ? new Date(body.payment_at).toISOString() : now;
			const payoutAt = body?.payout_at ? new Date(body.payout_at).toISOString() : null;

			const { data: txRow, error: txFetchError } = await adminClient
				.from('transactions')
				.select('id, user_id, ride_id')
				.eq('id', transactionId)
				.maybeSingle();

			if (txFetchError) {
				return json({ error: txFetchError.message }, { status: 500 });
			}

			if (!txRow) {
				return json({ error: 'Transaction not found' }, { status: 404 });
			}

			const { error: txUpdateError } = await adminClient
				.from('transactions')
				.update({
					booking_id: body?.booking_id ?? null,
					amount,
					currency: 'USD',
					seats_booked: seatsBooked,
					status: newStatus,
					refund_status: newRefundStatus,
					commission_percent: commissionPercent,
					commission_amount: commissionAmount,
					driver_payout_amount: driverPayoutAmount,
					admin_status: newAdminStatus,
					created_at: paymentAt,
					payout_at: payoutAt,
					external_reference: body?.external_reference ?? null,
					admin_notes: body?.admin_notes ?? null,
					provider: body?.provider ?? 'paypal',
					paypal_order_id: body?.provider_order_id ?? null,
					updated_at: now
				})
				.eq('id', transactionId);

			if (txUpdateError) {
				return json({ error: txUpdateError.message }, { status: 500 });
			}

			const passengerProfile = body?.passenger_profile as
				| { first_name?: string | null; last_name?: string | null; email?: string | null; payment_method?: string | null }
				| undefined;

			if (txRow.user_id && passengerProfile) {
				const { error: passengerError } = await adminClient
					.from('profiles')
					.update({
						first_name: passengerProfile.first_name ?? null,
						last_name: passengerProfile.last_name ?? null,
						email: passengerProfile.email ?? null,
						payment_method: passengerProfile.payment_method ?? null,
						updated_at: now
					})
					.eq('id', txRow.user_id);

				if (passengerError) {
					return json({ error: passengerError.message }, { status: 500 });
				}
			}

			const rideInfo = body?.ride_info as
				| { departure?: string | null; arrival?: string | null; ride_date?: string | null }
				| undefined;

			if (txRow.ride_id && rideInfo) {
				const { error: rideError } = await adminClient
					.from('rides')
					.update({
						departure: rideInfo.departure ?? null,
						arrival: rideInfo.arrival ?? null,
						ride_date: rideInfo.ride_date ?? null,
						updated_at: now
					})
					.eq('id', txRow.ride_id);

				if (rideError) {
					return json({ error: rideError.message }, { status: 500 });
				}
			}

			const driverProfile = body?.driver_profile as
				| { first_name?: string | null; last_name?: string | null; email?: string | null; payment_method?: string | null }
				| undefined;

			if (txRow.ride_id && driverProfile) {
				const { data: rideRow, error: rideFetchError } = await adminClient
					.from('rides')
					.select('driver_id')
					.eq('id', txRow.ride_id)
					.maybeSingle();

				if (rideFetchError) {
					return json({ error: rideFetchError.message }, { status: 500 });
				}

				if (rideRow?.driver_id) {
					const { error: driverError } = await adminClient
						.from('profiles')
						.update({
							first_name: driverProfile.first_name ?? null,
							last_name: driverProfile.last_name ?? null,
							email: driverProfile.email ?? null,
							payment_method: driverProfile.payment_method ?? null,
							updated_at: now
						})
						.eq('id', rideRow.driver_id);

					if (driverError) {
						return json({ error: driverError.message }, { status: 500 });
					}
				}
			}

			return json({ success: true });
		}

		if (action === 'update_notes') {
			const notes = (body?.admin_notes as string | undefined) ?? null;
			const ref = (body?.external_reference as string | undefined) ?? null;

			const { error } = await adminClient
				.from('transactions')
				.update({ admin_notes: notes, external_reference: ref, updated_at: now })
				.eq('id', transactionId);

			if (error) {
				return json({ error: error.message }, { status: 500 });
			}

			return json({ success: true });
		}

		return json({ error: `Unknown action: ${action}` }, { status: 400 });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
