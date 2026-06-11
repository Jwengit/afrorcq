import { json, type RequestHandler } from '@sveltejs/kit';

const disabledResponse = json(
	{
		error: 'Transactions module is disabled. The platform no longer manages member payments.'
	},
	{ status: 410 }
);

export const GET: RequestHandler = async () => disabledResponse;
export const POST: RequestHandler = async () => disabledResponse;
export const PATCH: RequestHandler = async () => disabledResponse;
export const DELETE: RequestHandler = async () => disabledResponse;
