import { json } from '@sveltejs/kit';
import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

const resend = new Resend(env.RESEND_API_KEY);

export async function POST({ request }) {
	const { email, name } = await request.json();

	try {
		const { data, error } = await resend.emails.send({
			from: 'support@hizli-carpooling.com',
			to: email,
			subject: 'Welcome to Hizli Carpooling!',
			html: `
				<h1>Welcome ${name || 'User'}!</h1>
				<p>Thank you for signing up to Hizli Carpooling. We're excited to have you join our community.</p>
				<p>Please complete your profile to get started.</p>
				<a href="https://hizli-carpooling.com/">Visit Hizli Carpooling</a>
			`
		});

		if (error) {
			console.error('Error sending welcome email:', error);
			return json({ error: 'Failed to send email' }, { status: 500 });
		}

		return json({ success: true });
	} catch (err) {
		console.error('Unexpected error:', err);
		return json({ error: 'Unexpected error' }, { status: 500 });
	}
}