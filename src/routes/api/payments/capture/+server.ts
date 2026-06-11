import { json, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async () => {
	return json(
		{
			error: 'Online payments are disabled. Bookings are now created without payment processing.'
		},
		{ status: 410 }
	);
};
