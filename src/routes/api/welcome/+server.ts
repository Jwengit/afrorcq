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
				subject: 'Welcome to Hizli Carpooling! 🚗 Complete Your Profile',
				html: `
					<!DOCTYPE html>
					<html>
					<head>
						<meta charset="UTF-8">
						<meta name="viewport" content="width=device-width, initial-scale=1.0">
					</head>
					<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333;">
						<div style="max-width: 600px; margin: 0 auto; padding: 20px;">
							<!-- Header -->
							<div style="text-align: center; margin-bottom: 30px;">
								<h1 style="color: #16a34a; margin: 0; font-size: 28px;">Welcome to Hizli Carpooling! 🚗</h1>
							</div>

							<!-- Main Content -->
							<div style="background-color: #f9fafb; padding: 30px; border-radius: 8px; border: 1px solid #e5e7eb;">
								<p style="margin-top: 0; font-size: 16px;">Hi ${name || 'there'},</p>
								
								<p style="font-size: 16px;">Thank you for joining our community! We're thrilled to have you as part of Hizli Carpooling.</p>

								<p style="font-size: 16px;"><strong>Your next step:</strong> Complete your profile to unlock all features and build trust with our community members.</p>

								<!-- Benefits Section -->
								<div style="background-color: #ecfdf5; padding: 20px; border-radius: 6px; border-left: 4px solid #16a34a; margin: 20px 0;">
									<p style="margin: 0 0 15px 0; font-weight: 600; color: #065f46;">Why complete your profile?</p>
									<ul style="margin: 0; padding-left: 20px;">
										<li style="margin-bottom: 8px;">✓ Get verified and build trust with other users</li>
										<li style="margin-bottom: 8px;">✓ Increase your chances of finding the right carpool match</li>
										<li style="margin-bottom: 8px;">✓ Share your preferences and travel habits</li>
										<li>✓ Access all community features</li>
									</ul>
								</div>

								<!-- CTA Button -->
								<div style="text-align: center; margin: 30px 0;">
									<a href="https://afrorcq.vercel.app/profile" style="display: inline-block; background-color: #16a34a; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px;">
										Complete Your Profile Now
									</a>
								</div>

								<!-- Additional Info -->
								<p style="font-size: 14px; color: #666; margin-top: 30px; margin-bottom: 0;">
									Questions? Our support team is here to help. Simply reply to this email.
								</p>
							</div>

							<!-- Footer -->
							<div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
								<p style="font-size: 12px; color: #999; margin: 0;">
									Hizli Carpooling | Building communities through shared journeys
								</p>
								<p style="font-size: 12px; color: #999; margin: 5px 0 0 0;">
									© 2026 Hizli Carpooling. All rights reserved.
								</p>
							</div>
						</div>
					</body>
					</html>
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