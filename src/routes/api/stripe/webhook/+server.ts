import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { env } from '$env/dynamic/private';
import { getStripeClient, getStripeWebhookSecret } from '$lib/server/stripe';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';

type ProfileMembershipRow = {
	is_verified: boolean | null;
};

function getNumberField(input: unknown, key: string): number | null {
	if (!input || typeof input !== 'object') return null;
	const value = (input as Record<string, unknown>)[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getStringField(input: unknown, key: string): string | null {
	if (!input || typeof input !== 'object') return null;
	const value = (input as Record<string, unknown>)[key];
	return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function extractSubscriptionPeriodEnd(subscription: unknown): number | null {
	return (
		getNumberField(subscription, 'current_period_end') ??
		getNumberField(subscription, 'cancel_at') ??
		null
	);
}

function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
	const direct = getStringField(invoice as unknown, 'subscription');
	if (direct) return direct;

	const parent = (invoice as unknown as Record<string, unknown>).parent;
	if (!parent || typeof parent !== 'object') return null;

	const subscriptionDetails = (parent as Record<string, unknown>).subscription_details;
	if (!subscriptionDetails || typeof subscriptionDetails !== 'object') return null;

	const nested = (subscriptionDetails as Record<string, unknown>).subscription;
	return typeof nested === 'string' && nested.trim().length > 0 ? nested : null;
}

function isInvoicePaid(invoice: Stripe.Invoice): boolean {
	const paidFlag = (invoice as unknown as Record<string, unknown>).paid;
	if (typeof paidFlag === 'boolean') return paidFlag;
	return (invoice.status ?? '').toLowerCase() === 'paid';
}

function buildAdminClient() {
	if (!supabaseUrl || !env.SUPABASE_SERVICE_ROLE_KEY) {
		throw new Error('Supabase service role is not configured.');
	}
	return createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY);
}

function resolveStatusFromVerification(isVerified: boolean, membershipPaid: boolean): 'free' | 'pending' | 'verified' {
	if (membershipPaid && isVerified) return 'verified';
	if (membershipPaid) return 'pending';
	if (isVerified) return 'pending';
	return 'free';
}

async function findProfileByEmail(email: string): Promise<string | null> {
	const adminClient = buildAdminClient();
	const { data, error } = await adminClient
		.from('profiles')
		.select('id')
		.eq('email', email)
		.maybeSingle();

	if (error) return null;
	return data?.id ?? null;
}

async function resolveUserId(stripe: Stripe, payload: Stripe.Checkout.Session | Stripe.Invoice | Stripe.Subscription): Promise<string | null> {
	const metadataUserId = payload.metadata?.supabase_user_id;
	if (metadataUserId) return metadataUserId;

	if ('client_reference_id' in payload && payload.client_reference_id) {
		return payload.client_reference_id;
	}

	if ('customer_email' in payload && payload.customer_email) {
		return findProfileByEmail(payload.customer_email);
	}

	if ('customer' in payload && typeof payload.customer === 'string') {
		const customer = await stripe.customers.retrieve(payload.customer);
		if (!('deleted' in customer) && customer.metadata?.supabase_user_id) {
			return customer.metadata.supabase_user_id;
		}
		if (!('deleted' in customer) && customer.email) {
			return findProfileByEmail(customer.email);
		}
	}

	const subscriptionId =
		'subscription' in payload && typeof payload.subscription === 'string'
			? payload.subscription
			: null;

	if (subscriptionId) {
		const subscription = await stripe.subscriptions.retrieve(subscriptionId);
		if (subscription.metadata?.supabase_user_id) {
			return subscription.metadata.supabase_user_id;
		}
	}

	return null;
}

async function updateMembership(userId: string, paid: boolean, expiresAtIso: string | null) {
	const adminClient = buildAdminClient();
	const { data: profile, error: profileError } = await adminClient
		.from('profiles')
		.select('is_verified')
		.eq('id', userId)
		.maybeSingle();

	if (profileError) {
		throw new Error(profileError.message);
	}

	const typedProfile = (profile as ProfileMembershipRow | null) ?? { is_verified: false };
	const nextStatus = resolveStatusFromVerification(Boolean(typedProfile.is_verified), paid);

	const updatePayload = {
		membership_paid: paid,
		membership_expires_at: expiresAtIso,
		status: nextStatus,
		updated_at: new Date().toISOString()
	};

	const { error: updateError } = await adminClient.from('profiles').update(updatePayload).eq('id', userId);
	if (!updateError) {
		return;
	}

	// Fallback for schemas where `status` is not available yet.
	if (updateError.message.toLowerCase().includes('status')) {
		const fallback = await adminClient
			.from('profiles')
			.update({
				membership_paid: paid,
				membership_expires_at: expiresAtIso,
				updated_at: new Date().toISOString()
			})
			.eq('id', userId);

		if (!fallback.error) {
			return;
		}

		throw new Error(fallback.error.message);
	}

	throw new Error(updateError.message);
}

function timestampToIso(unixSeconds: number | null | undefined): string | null {
	if (!unixSeconds || !Number.isFinite(unixSeconds)) return null;
	return new Date(unixSeconds * 1000).toISOString();
}

async function upsertSubscriptionPaymentTransaction(
	userId: string,
	invoice: Stripe.Invoice,
	renewalAtIso: string | null
) {
	if (!invoice.id) return;

	const adminClient = buildAdminClient();
	const now = new Date().toISOString();
	const amount = Number((invoice.amount_paid ?? invoice.amount_due ?? 0) / 100);
	const normalizedStatus = isInvoicePaid(invoice)
		? 'succeeded'
		: invoice.status === 'void'
			? 'canceled'
			: 'failed';
	const currency = (invoice.currency || 'usd').toUpperCase();
	const invoiceSubscriptionId = extractInvoiceSubscriptionId(invoice);

	const { data: existing, error: existingError } = await adminClient
		.from('transactions')
		.select('id')
		.eq('provider', 'stripe')
		.eq('external_reference', invoice.id)
		.maybeSingle();

	if (existingError) {
		throw new Error(existingError.message);
	}

	const payload = {
		booking_id: null,
		ride_id: null,
		user_id: userId,
		seats_booked: 1,
		amount,
		currency,
		status: normalizedStatus,
		refund_status: 'none',
		commission_percent: 0,
		commission_amount: 0,
		driver_payout_amount: 0,
		admin_status: 'validated',
		payout_at: renewalAtIso,
		external_reference: invoice.id,
		admin_notes: `Stripe annual membership payment (${invoice.id})`,
		provider: 'stripe',
		paypal_order_id: invoiceSubscriptionId,
		created_at: timestampToIso(invoice.created) ?? now,
		updated_at: now
	};

	if (existing?.id) {
		const { error: updateError } = await adminClient
			.from('transactions')
			.update(payload)
			.eq('id', existing.id);

		if (updateError) {
			throw new Error(updateError.message);
		}
		return;
	}

	const { error: insertError } = await adminClient.from('transactions').insert(payload);
	if (insertError) {
		throw new Error(insertError.message);
	}
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const signature = request.headers.get('stripe-signature');
		if (!signature) {
			return json({ error: 'Missing stripe-signature header' }, { status: 400 });
		}

		const rawBody = await request.text();
		const stripe = getStripeClient();
		const webhookSecret = getStripeWebhookSecret();

		let event: Stripe.Event;
		try {
			event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Invalid webhook signature';
			return json({ error: message }, { status: 400 });
		}

		if (event.type === 'checkout.session.completed') {
			const session = event.data.object as Stripe.Checkout.Session;
			const userId = await resolveUserId(stripe, session);
			if (!userId) {
				return json({ received: true, ignored: 'no-user-id' });
			}

			let expiresAtIso: string | null = null;
			if (typeof session.subscription === 'string') {
				const subscription = await stripe.subscriptions.retrieve(session.subscription);
				expiresAtIso = timestampToIso(extractSubscriptionPeriodEnd(subscription));
			}

			await updateMembership(userId, true, expiresAtIso);
		}

		if (event.type === 'invoice.paid') {
			const invoice = event.data.object as Stripe.Invoice;
			const userId = await resolveUserId(stripe, invoice);
			if (!userId) {
				return json({ received: true, ignored: 'no-user-id' });
			}

			let expiresAtIso: string | null = null;
			const invoiceSubscriptionId = extractInvoiceSubscriptionId(invoice);
			if (invoiceSubscriptionId) {
				const subscription = await stripe.subscriptions.retrieve(invoiceSubscriptionId);
				expiresAtIso = timestampToIso(extractSubscriptionPeriodEnd(subscription));
			}

			await updateMembership(userId, true, expiresAtIso);
			await upsertSubscriptionPaymentTransaction(userId, invoice, expiresAtIso);
		}

		if (event.type === 'customer.subscription.updated') {
			const subscription = event.data.object as Stripe.Subscription;
			const userId = await resolveUserId(stripe, subscription);
			if (!userId) {
				return json({ received: true, ignored: 'no-user-id' });
			}

			const isPaid = subscription.status === 'active' || subscription.status === 'trialing';
			await updateMembership(
				userId,
				isPaid,
				isPaid ? timestampToIso(extractSubscriptionPeriodEnd(subscription)) : null
			);
		}

		if (event.type === 'customer.subscription.deleted' || event.type === 'invoice.payment_failed') {
			const payload = event.data.object as Stripe.Subscription | Stripe.Invoice;
			const userId = await resolveUserId(stripe, payload);
			if (!userId) {
				return json({ received: true, ignored: 'no-user-id' });
			}

			await updateMembership(userId, false, null);
		}

		return json({ received: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return json({ error: message }, { status: 500 });
	}
};
