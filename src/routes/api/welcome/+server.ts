import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export async function POST({ request }) {
	const { email, name } = await request.json();

	try {
		if (!env.RESEND_API_KEY) {
			console.warn('RESEND_API_KEY is not set. Skipping welcome email.');
			return json({ success: true, skipped: true });
		}

		const response = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.RESEND_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				from: 'support@hizli-carpooling.com',
				to: email,
				subject: 'Welcome to Hizli Carpooling!',
				html: `
					<h1>Welcome ${name || 'User'}!</h1>
					<p>Thank you for signing up to Hizli Carpooling. We're excited to have you join our community.</p>
					<p>Please complete your profile to get started.</p>
					<a href="https://hizli-carpooling.com/">Visit Hizli Carpooling</a>
				`
			})
		});

		if (!response.ok) {
			const error = await response.text();
			console.error('Error sending welcome email:', error);
			return json({ error: 'Failed to send email' }, { status: 500 });
		}

		return json({ success: true });
	} catch (err) {
		console.error('Unexpected error:', err);
		return json({ error: 'Unexpected error' }, { status: 500 });
	}
}