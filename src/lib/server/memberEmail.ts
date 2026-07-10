import { env } from '$env/dynamic/private';

type SendMemberEmailInput = {
	to: string;
	subject: string;
	html: string;
	text?: string;
	replyTo?: string;
};

const DEFAULT_FROM = 'Hizli <noreply@hizli-carpooling.com>';

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function ensureText(text: string | undefined, fallbackHtml: string): string {
	if (text && text.trim()) return text.trim();
	return fallbackHtml
		.replace(/<br\s*\/?/gi, '\n')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export async function sendMemberEmail(input: SendMemberEmailInput): Promise<boolean> {
	const apiKey = env.RESEND_API_KEY;
	if (!apiKey) {
		console.warn('RESEND_API_KEY is missing. Email skipped.');
		return false;
	}

	const to = input.to?.trim();
	if (!to) return false;

	const from = (env.EMAIL_FROM || DEFAULT_FROM).trim();
	const replyTo = (input.replyTo || env.EMAIL_REPLY_TO || '').trim() || undefined;

	const payload: Record<string, unknown> = {
		from,
		to: [to],
		subject: input.subject,
		html: input.html,
		text: ensureText(input.text, input.html)
	};

	if (replyTo) {
		payload.reply_to = replyTo;
	}

	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(payload)
	});

	if (!response.ok) {
		const body = await response.text();
		console.error('Resend send error:', response.status, body);
		return false;
	}

	return true;
}

type ActivityCenterEmailInput = {
	firstName?: string | null;
	email: string;
	subject: string;
	messagePreview: string;
	dashboardUrl: string;
};

export function buildActivityCenterEmail(input: ActivityCenterEmailInput): { html: string; text: string } {
	const safeFirstName = escapeHtml((input.firstName || '').trim() || 'there');
	const safeSubject = escapeHtml(input.subject);
	const safePreview = escapeHtml(input.messagePreview);
	const safeDashboardUrl = escapeHtml(input.dashboardUrl);

	const html =
		`<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">` +
		`<p style="margin:0 0 12px;">Hi ${safeFirstName},</p>` +
		`<p style="margin:0 0 12px;">You have a new update in your <strong>Activity Center</strong>.</p>` +
		`<p style="margin:0 0 12px; padding:10px 12px; background:#f3f4f6; border-left:4px solid #16a34a;">` +
		`<strong>${safeSubject}</strong><br/>${safePreview}` +
		`</p>` +
		`<p style="margin:0;">` +
		`<a href="${safeDashboardUrl}" style="display:inline-block;padding:9px 14px;border-radius:8px;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:600;">Open Activity Center</a>` +
		`</p>` +
		`</div>`;

	const text =
		`Hi ${(input.firstName || '').trim() || 'there'},\n\n` +
		`You have a new update in your Activity Center.\n\n` +
		`${input.subject}\n${input.messagePreview}\n\n` +
		`Open Activity Center: ${input.dashboardUrl}`;

	return { html, text };
}
