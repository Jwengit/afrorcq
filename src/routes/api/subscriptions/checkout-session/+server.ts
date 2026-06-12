import { json, type RequestHandler } from '@sveltejs/kit';

const NOT_CONFIGURED = json(
{ error: 'Stripe not configured. Run: npm install stripe and add STRIPE_SECRET_KEY to environment.' },
{ status: 503 }
);

export const POST: RequestHandler = async () => NOT_CONFIGURED;
export const GET: RequestHandler = async () => NOT_CONFIGURED;

