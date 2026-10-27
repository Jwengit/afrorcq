// VERSION: account-closure 2026-10-27
import { env } from '$env/dynamic/private';
import { Resend } from 'resend';
import { getStripeClient } from '$lib/server/stripe';

const ADMIN_EMAIL = 'hizli.carpooling@gmail.com';
const EMAIL_FROM = 'Hizli Carpooling <service@hizli-carpooling.com>';

export type StripeClosureResult = {
	cancelled: boolean;
	subscriptionId: string | null;
	periodEndIso: string | null;
	refundEstimate: number | null;
};

function readNumber(source: unknown, key: string): number | null {
	if (!source || typeof source !== 'object') return null;
	const value = (source as Record<string, unknown>)[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function baseUrl(): string {
	return (String(env.PUBLIC_SITE_URL ?? '').trim() || 'https://afrorcqvercelapp.vercel.app').replace(/\/$/, '');
}

function formatDate(iso: string | null | undefined): string {
	if (!iso) return 'not recorded';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return 'not recorded';
	return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Finds the member's active Stripe subscription(s), estimates the unused part
 * of the year, and cancels the subscription immediately (no automatic refund).
 * Throws if Stripe cannot be reached or the cancellation fails.
 */
export async function cancelStripeMembership(userId: string, email: string | null): Promise<StripeClosureResult> {
	const stripe = getStripeClient();
	const subscriptions = [];

	try {
		const found = await stripe.subscriptions.search({
			query: `metadata['supabase_user_id']:'${userId}'`,
			limit: 10
		});
		subscriptions.push(...found.data);
	} catch (searchError) {
		console.warn('[account closure] Stripe subscription search failed, falling back to email.', searchError);
	}

	if (subscriptions.length === 0 && email) {
		const customers = await stripe.customers.list({ email, limit: 5 });
		for (const customer of customers.data) {
			const list = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 10 });
			subscriptions.push(...list.data);
		}
	}

	const live = subscriptions.filter((subscription) =>
		['active', 'trialing', 'past_due', 'unpaid'].includes(subscription.status)
	);

	if (live.length === 0) {
		return { cancelled: false, subscriptionId: null, periodEndIso: null, refundEstimate: null };
	}

	let result: StripeClosureResult | null = null;

	for (const subscription of live) {
		const item = subscription.items?.data?.[0];
		const start = readNumber(item, 'current_period_start') ?? readNumber(subscription, 'current_period_start');
		const end = readNumber(item, 'current_period_end') ?? readNumber(subscription, 'current_period_end');
		const unitAmount = item?.price?.unit_amount ?? 0;

		let refundEstimate: number | null = null;
		if (start && end && end > start && unitAmount > 0) {
			const now = Math.floor(Date.now() / 1000);
			const remaining = Math.max(0, end - Math.max(now, start));
			refundEstimate = Math.round((unitAmount / 100) * (remaining / (end - start)) * 100) / 100;
		}

		// Cancel immediately, without proration and without creating a final invoice
		await stripe.subscriptions.cancel(subscription.id);

		if (!result) {
			result = {
				cancelled: true,
				subscriptionId: subscription.id,
				periodEndIso: end ? new Date(end * 1000).toISOString() : null,
				refundEstimate
			};
		}
	}

	return result as StripeClosureResult;
}

async function sendSimpleEmail(input: {
	to: string;
	subject: string;
	lines: string[];
	buttonLabel: string;
	buttonUrl: string;
}) {
	const apiKey = env.RESEND_API_KEY?.trim();
	const recipient = input.to.trim();
	if (!apiKey || !recipient) {
		console.warn('[account closure] Email skipped (missing RESEND_API_KEY or recipient).');
		return;
	}

	const htmlLines = input.lines.map((line) => `<p style="margin:0 0 16px;">${escapeHtml(line)}</p>`).join('');
	const html = `
		<div style="margin:0;padding:32px 16px;background-color:#f5f5f5;">
			<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:16px;overflow:hidden;">
				<div style="padding:32px;font-family:Arial,sans-serif;color:#000000;line-height:1.6;">
					${htmlLines}
					<p style="margin:24px 0 0;">
						<a href="${escapeHtml(input.buttonUrl)}" style="display:inline-block;padding:14px 24px;background:#00B050;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;">${escapeHtml(input.buttonLabel)}</a>
					</p>
				</div>
				<div style="padding:24px 32px;border-top:1px solid #e5e5e5;font-family:Arial,sans-serif;color:#000000;font-size:13px;">
					<p style="margin:0;">Hizli Carpooling — hizli-carpooling.com</p>
				</div>
			</div>
		</div>
	`.trim();
	const text = [...input.lines, '', `${input.buttonLabel}: ${input.buttonUrl}`].join('\n');

	try {
		const resend = new Resend(apiKey);
		const { error } = await resend.emails.send({
			from: EMAIL_FROM,
			to: [recipient],
			subject: input.subject,
			html,
			text
		});
		if (error) console.error('[account closure] Resend error:', error.message);
	} catch (emailError) {
		console.error('[account closure] Email failed:', emailError);
	}
}

/**
 * Sends the alert to the admin, and the goodbye email to the member.
 * Never throws: emails must not block the account deletion.
 */
export async function notifyAccountClosed(input: {
	memberEmail: string | null;
	firstName: string | null;
	lastName: string | null;
	plan: string | null;
	isVerified: boolean;
	membershipPaid: boolean;
	membershipExpiresAt: string | null;
	stripe: StripeClosureResult | null;
	accountDeleted: boolean;
}) {
	const fullName = `${input.firstName ?? ''} ${input.lastName ?? ''}`.trim() || 'No name';
	const hadMembership = input.membershipPaid || input.isVerified;

	const stripeLines: string[] = [];
	if (input.stripe?.cancelled) {
		stripeLines.push(`Stripe subscription ${input.stripe.subscriptionId} was cancelled automatically.`);
		stripeLines.push(`Paid period ends on: ${formatDate(input.stripe.periodEndIso)}`);
		if (input.stripe.refundEstimate !== null) {
			stripeLines.push(
				`Estimated refund for the unused part: $${input.stripe.refundEstimate.toFixed(2)} (based on the plan price; check the real amount paid in Stripe, as a promo code may have applied).`
			);
		}
		stripeLines.push('Next step: contact the member to ask how they want to be refunded, then refund from Stripe.');
	} else if (hadMembership) {
		stripeLines.push(
			'WARNING: this member had a membership but no active Stripe subscription was found. Please check Stripe manually.'
		);
	} else {
		stripeLines.push('This was a free account. No Stripe action needed.');
	}

	await sendSimpleEmail({
		to: ADMIN_EMAIL,
		subject: input.accountDeleted
			? `Account closed: ${fullName}`
			: `Account closure FAILED after Stripe cancellation: ${fullName}`,
		lines: [
			input.accountDeleted
				? 'A member has deleted their account.'
				: 'A member tried to delete their account. Their Stripe subscription was cancelled, but the account itself could not be fully deleted. Please check it in Supabase.',
			`Name: ${fullName}`,
			`Email: ${input.memberEmail ?? 'unknown'}`,
			`Plan: ${input.plan ?? 'none'}`,
			`Verified: ${input.isVerified ? 'yes' : 'no'}`,
			`Membership paid: ${input.membershipPaid ? 'yes' : 'no'}`,
			`Membership expiry recorded by Hizli: ${formatDate(input.membershipExpiresAt)}`,
			...stripeLines
		],
		buttonLabel: 'Open Stripe dashboard',
		buttonUrl: 'https://dashboard.stripe.com'
	});

	if (input.accountDeleted && input.memberEmail) {
		const memberLines = [
			`Hi ${input.firstName?.trim() || 'there'},`,
			'Your Hizli account has been closed and your personal data has been deleted.'
		];
		if (input.stripe?.cancelled) {
			memberLines.push(
				'Your membership has been cancelled, and you will not be charged again.',
				'We will contact you shortly about the refund of the unused part of your membership, and ask how you would like to receive it.'
			);
		}
		memberLines.push(
			'Thank you for being part of Hizli. You are always welcome back.',
			'The Hizli Team'
		);

		await sendSimpleEmail({
			to: input.memberEmail,
			subject: 'Your Hizli account has been closed',
			lines: memberLines,
			buttonLabel: 'Visit Hizli',
			buttonUrl: baseUrl()
		});
	}
}