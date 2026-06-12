import { json, type RequestHandler } from '@sveltejs/kit';

const NOT_CONFIGURED = json(
{ error: 'Stripe webhook not configured. Run: npm install stripe and add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to environment.' },
{ status: 503 }
);

export const POST: RequestHandler = async () => NOT_CONFIGURED;

