import { env } from '$env/dynamic/private';
import { Resend } from 'resend';

const HIZLI_BASE_URL = 'https://hizli-carpooling.com';
const HIZLI_DASHBOARD_URL = `${HIZLI_BASE_URL}/dashboard`;
const HIZLI_PROFILE_URL = `${HIZLI_BASE_URL}/profile`;
const HIZLI_PRICING_URL = `${HIZLI_BASE_URL}/pricing`;
const HIZLI_SEARCH_URL = `${HIZLI_BASE_URL}/search`;
const HIZLI_LOGO_URL = `${HIZLI_BASE_URL}/logo.png`;
const EMAIL_FROM = 'Hizli Carpooling <service@hizli-carpooling.com>';
const FOOTER_COPY =
	'Hizli Carpooling — hizli-carpooling.com You received this email because you have an account on Hizli Carpooling. © 2026 Hizli Carpooling. All rights reserved.';

type EmailTemplate = {
	subject: string;
	html: string;
	text: string;
};

type BaseEmailInput = {
	to: string;
	firstName?: string | null;
};

type PasswordResetEmailInput = BaseEmailInput & {
	resetUrl: string;
};

type DocumentRejectedEmailInput = BaseEmailInput & {
	reason: string;
};

type SendEmailPayload = BaseEmailInput & {
	template: EmailTemplate;
};

function getResendClient(): Resend | null {
	const apiKey = env.RESEND_API_KEY?.trim();

	if (!apiKey) {
		console.warn('RESEND_API_KEY is missing. Email skipped.');
		return null;
	}

	return new Resend(apiKey);
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function getFirstName(firstName?: string | null): string {
	const normalized = (firstName ?? '').trim();
	return normalized || 'there';
}

function normalizeTextLine(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function buildTextBody(firstName: string, lines: string[], buttonLabel: string, buttonUrl: string): string {
	return [
		`Hi ${firstName},`,
		'',
		...lines.map(normalizeTextLine),
		'',
		`${buttonLabel}: ${buttonUrl}`,
		'',
		FOOTER_COPY
	].join('\n');
}

function buildEmailTemplate(input: {
	firstName?: string | null;
	subject: string;
	lines: string[];
	buttonLabel: string;
	buttonUrl: string;
}): EmailTemplate {
	const firstName = getFirstName(input.firstName);
	const safeFirstName = escapeHtml(firstName);
	const safeButtonLabel = escapeHtml(input.buttonLabel);
	const safeButtonUrl = escapeHtml(input.buttonUrl);
	const htmlLines = input.lines.map((line) => `<p style="margin:0 0 16px;">${escapeHtml(line)}</p>`).join('');

	const html = `
		<div style="margin:0;padding:32px 16px;background-color:#f5f5f5;">
			<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:16px;overflow:hidden;">
				<div style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #e5e5e5;background:#ffffff;">
					<img src="${HIZLI_LOGO_URL}" alt="" style="max-width:168px;width:100%;height:auto;display:inline-block;" />
				</div>
				<div style="padding:32px;font-family:Arial,sans-serif;color:#000000;line-height:1.6;background:#ffffff;">
					<p style="margin:0 0 16px;">Hi ${safeFirstName},</p>
					${htmlLines}
					<p style="margin:24px 0 0;">
						<a href="${safeButtonUrl}" style="display:inline-block;padding:14px 24px;background:#00B050;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;">${safeButtonLabel}</a>
					</p>
				</div>
				<div style="padding:24px 32px;border-top:1px solid #e5e5e5;background:#ffffff;font-family:Arial,sans-serif;color:#000000;line-height:1.6;font-size:13px;">
					<p style="margin:0 0 8px;">Hizli Carpooling — hizli-carpooling.com</p>
					<p style="margin:0 0 8px;">You received this email because you have an account on Hizli Carpooling.</p>
					<p style="margin:0;">© 2026 Hizli Carpooling. All rights reserved.</p>
				</div>
			</div>
		</div>
	`.trim();

	return {
		subject: input.subject,
		html,
		text: buildTextBody(firstName, input.lines, input.buttonLabel, input.buttonUrl)
	};
}

async function sendEmail(payload: SendEmailPayload): Promise<string | null> {
	const recipient = payload.to.trim();

	if (!recipient) {
		console.warn('Recipient email is missing. Email skipped.');
		return null;
	}

	const resend = getResendClient();
	if (!resend) {
		return null;
	}

	const { data, error } = await resend.emails.send({
		from: EMAIL_FROM,
		to: [recipient],
		subject: payload.template.subject,
		html: payload.template.html,
		text: payload.template.text
	});

	if (error) {
		console.error('Resend error:', error.message);
		return null;
	}

	if (!data?.id) {
		console.error('Resend did not return an email id.');
		return null;
	}

	return data.id;
}

// ─── EMAIL 1 — Welcome (envoyé à l'inscription Google ET email/mdp) ───

export function buildWelcomeEmail(firstName?: string | null): EmailTemplate {
	return buildEmailTemplate({
		firstName,
		subject: 'Welcome to Hizli Carpooling! 🚗',
		lines: [
			"Welcome to Hizli Carpooling! We're excited to have you in our community.",
			'You can start searching and posting rides right away with your free account.',
			'Want to travel with verified members and access all features? Upload your documents and become a verified member.',
			'See you on the road,',
			'The Hizli Team'
		],
		buttonLabel: 'Get started',
		buttonUrl: HIZLI_DASHBOARD_URL
	});
}

export async function sendWelcomeEmail(input: BaseEmailInput): Promise<string | null> {
	return sendEmail({ ...input, template: buildWelcomeEmail(input.firstName) });
}

// ─── EMAIL 2 — Support reply (envoyé quand l'admin répond) ───

export function buildSupportReplyEmail(firstName?: string | null): EmailTemplate {
	return buildEmailTemplate({
		firstName,
		subject: 'You have a new message from Hizli Support',
		lines: [
			'Our support team has replied to your request.',
			'Log in to your dashboard to read the full message and continue the conversation.',
			'The Hizli Team'
		],
		buttonLabel: 'View message',
		buttonUrl: HIZLI_DASHBOARD_URL
	});
}

export async function sendSupportReplyEmail(input: BaseEmailInput): Promise<string | null> {
	return sendEmail({ ...input, template: buildSupportReplyEmail(input.firstName) });
}

// ─── EMAIL 3 — Reset password ───

export function buildPasswordResetEmail(input: { firstName?: string | null; resetUrl: string }): EmailTemplate {
	return buildEmailTemplate({
		firstName: input.firstName,
		subject: 'Reset your Hizli password',
		lines: [
			'We received a request to reset your password.',
			'Click the button below to set a new password. This link expires in 1 hour.',
			"If you didn't request this, you can safely ignore this email.",
			'The Hizli Team'
		],
		buttonLabel: 'Reset my password',
		buttonUrl: input.resetUrl
	});
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<string | null> {
	return sendEmail({ ...input, template: buildPasswordResetEmail(input) });
}

// ─── EMAIL 4 — Ride bookée (pour le conducteur) ───

export function buildBookingRequestReceivedEmail(input: {
	firstName?: string | null;
	passengerName: string;
	rideRoute: string;
	rideDate: string;
	seatsRequested: number;
	rideRequestsUrl: string;
}): EmailTemplate {
	return buildEmailTemplate({
		firstName: input.firstName,
		subject: 'Someone booked your ride! 🚗',
		lines: [
			'Good news! A passenger has requested a seat on your ride.',
			`Passenger: ${input.passengerName}`,
			`Route: ${input.rideRoute}`,
			`Date: ${input.rideDate}`,
			`Seats requested: ${input.seatsRequested}`,
			'Log in to your dashboard to accept or decline this booking.',
			'The Hizli Team'
		],
		buttonLabel: 'View booking',
		buttonUrl: input.rideRequestsUrl
	});
}

export async function sendBookingRequestReceivedEmail(input: {
	to: string;
	firstName?: string | null;
	passengerName: string;
	rideRoute: string;
	rideDate: string;
	seatsRequested: number;
	rideRequestsUrl: string;
}): Promise<string | null> {
	return sendEmail({
		to: input.to,
		firstName: input.firstName,
		template: buildBookingRequestReceivedEmail(input)
	});
}

// ─── EMAIL 5 — Ride acceptée (pour le passager) ───

export function buildBookingAcceptedEmail(input: {
	firstName?: string | null;
	rideRoute: string;
	rideDate: string;
	driverName: string;
	myBookingsUrl: string;
}): EmailTemplate {
	return buildEmailTemplate({
		firstName: input.firstName,
		subject: 'Your booking has been confirmed! 🎉',
		lines: [
			'Great news! Your booking has been confirmed by the driver.',
			`Route: ${input.rideRoute}`,
			`Date: ${input.rideDate}`,
			`Driver: ${input.driverName}`,
			'Remember: payment is handled directly between you and your driver at the time of the trip.',
			'See you on the road!',
			'The Hizli Team'
		],
		buttonLabel: 'View my trip',
		buttonUrl: input.myBookingsUrl
	});
}

export async function sendBookingAcceptedEmail(input: {
	to: string;
	firstName?: string | null;
	rideRoute: string;
	rideDate: string;
	driverName: string;
	myBookingsUrl: string;
}): Promise<string | null> {
	return sendEmail({
		to: input.to,
		firstName: input.firstName,
		template: buildBookingAcceptedEmail(input)
	});
}

// ─── EMAIL 6 — Ride refusée (pour le passager) ───

export function buildBookingRejectedEmail(input: {
	firstName?: string | null;
	rideRoute: string;
	rideDate: string;
	searchRidesUrl: string;
}): EmailTemplate {
	return buildEmailTemplate({
		firstName: input.firstName,
		subject: 'Your booking was not accepted',
		lines: [
			"Unfortunately, the driver was unable to confirm your booking for this trip.",
			`Route: ${input.rideRoute}`,
			`Date: ${input.rideDate}`,
			"Don't worry — there are other rides available for your route. Search for another ride now.",
			'The Hizli Team'
		],
		buttonLabel: 'Search another ride',
		buttonUrl: input.searchRidesUrl
	});
}

export async function sendBookingRejectedEmail(input: {
	to: string;
	firstName?: string | null;
	rideRoute: string;
	rideDate: string;
	searchRidesUrl: string;
}): Promise<string | null> {
	return sendEmail({
		to: input.to,
		firstName: input.firstName,
		template: buildBookingRejectedEmail(input)
	});
}

// ─── EMAIL 7 — Documents under review (DÉSACTIVÉ — activity center uniquement) ───

export async function sendDocumentsUnderReviewEmail(input: BaseEmailInput): Promise<string | null> {
	console.log('Documents under review — activity center only, email skipped.');
	return null;
}

// ─── EMAIL 8 — Document rejeté ───

export function buildDocumentRejectedEmail(input: { firstName?: string | null; reason: string }): EmailTemplate {
	return buildEmailTemplate({
		firstName: input.firstName,
		subject: 'Action required: one of your documents was not accepted',
		lines: [
			'Unfortunately, one of your submitted documents could not be verified.',
			`Reason: ${input.reason}`,
			'Please log in to your dashboard, upload a new version of the document, and resubmit for review.',
			'If you have any questions, reply to this email and our team will help you.',
			'The Hizli Team'
		],
		buttonLabel: 'Update my documents',
		buttonUrl: HIZLI_PROFILE_URL
	});
}

export async function sendDocumentRejectedEmail(input: DocumentRejectedEmailInput): Promise<string | null> {
	return sendEmail({ ...input, template: buildDocumentRejectedEmail(input) });
}

// ─── EMAIL 9 — Documents vérifiés → Complete membership ───

export function buildDocumentsVerifiedEmail(firstName?: string | null): EmailTemplate {
	return buildEmailTemplate({
		firstName,
		subject: 'Great news! Your documents have been verified',
		lines: [
			'Your identity documents have been verified by our team.',
			"You're one step away from becoming a verified Hizli member and unlocking full access to our community.",
			'Complete your annual membership now to:',
			'✓ Access verified member profiles',
			'✓ Read and leave reviews',
			'✓ Get your verified badge',
			'✓ Access Girls Only rides (if applicable)',
			'The Hizli Team'
		],
		buttonLabel: 'Complete my membership',
		buttonUrl: HIZLI_PRICING_URL
	});
}

export async function sendDocumentsVerifiedEmail(input: BaseEmailInput): Promise<string | null> {
	return sendEmail({ ...input, template: buildDocumentsVerifiedEmail(input.firstName) });
}

// ─── EMAIL 10 — Compte verified (après paiement Stripe) ───

export function buildAccountVerifiedEmail(firstName?: string | null): EmailTemplate {
	return buildEmailTemplate({
		firstName,
		subject: 'Welcome to the Hizli verified community! 🎉',
		lines: [
			'Your account is now fully verified. Welcome to the Hizli community!',
			'You now have access to:',
			'✓ Verified member profiles',
			'✓ Real reviews from real riders',
			'✓ Your verified badge on your profile',
			'✓ Girls Only rides (if applicable)',
			'See you on the road,',
			'The Hizli Team'
		],
		buttonLabel: 'Go to my dashboard',
		buttonUrl: HIZLI_DASHBOARD_URL
	});
}

export async function sendAccountVerifiedEmail(input: BaseEmailInput): Promise<string | null> {
	return sendEmail({ ...input, template: buildAccountVerifiedEmail(input.firstName) });
}

// ─── EMAIL 11 — Membership expiré (email + activity center) ───

export function buildMembershipExpiredEmail(firstName?: string | null): EmailTemplate {
	return buildEmailTemplate({
		firstName,
		subject: 'Your Hizli membership has expired',
		lines: [
			'Your annual Hizli membership has expired and your account has been reverted to free status.',
			'Renew your membership to get back full access to our verified community.',
			'The Hizli Team'
		],
		buttonLabel: 'Renew my membership',
		buttonUrl: HIZLI_PRICING_URL
	});
}

export async function sendMembershipExpiredEmail(input: BaseEmailInput): Promise<string | null> {
	return sendEmail({ ...input, template: buildMembershipExpiredEmail(input.firstName) });
}

// ─── Dashboard message notification (DÉSACTIVÉ — activity center uniquement) ───

export async function sendDashboardMessageNotificationEmail(input: {
	to: string;
	firstName?: string | null;
	messageSubject?: string;
}): Promise<string | null> {
	console.log('Dashboard message notification — activity center only, email skipped.');
	return null;
}