import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

async function getAuthenticatedUser(request: Request) {
	const authorization = request.headers.get('authorization');
	if (!authorization?.startsWith('Bearer ')) return null;
	if (!supabaseUrl || !supabaseKey) return null;

	const authClient = createClient(supabaseUrl, supabaseKey);
	const {
		data: { user },
		error
	} = await authClient.auth.getUser(authorization.slice(7).trim());

	return error || !user ? null : user;
}

function getServiceRoleClient() {
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
	return supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;
}

export const GET: RequestHandler = async ({ request }) => {
	if (!supabaseUrl || !supabaseKey) {
		return json({ error: 'Server configuration error' }, { status: 500 });
	}
	const user = await getAuthenticatedUser(request);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const adminClient = getServiceRoleClient();
	if (!adminClient) return json({ error: 'Server configuration error' }, { status: 500 });

	const { data, error } = await adminClient
		.from('profiles')
		.select('phone_number, driver_contact_method')
		.eq('id', user.id)
		.maybeSingle();

	if (error) {
		console.error('Private profile contact load error:', error);
		return json({ error: 'Unable to load private contact details.' }, { status: 500 });
	}

	return json(
		{
			contact: {
				phone_number: data?.phone_number ?? null,
				driver_contact_method: data?.driver_contact_method ?? null
			}
		},
		{ headers: { 'Cache-Control': 'private, no-store' } }
	);
};

export const PATCH: RequestHandler = async ({ request }) => {
	if (!supabaseUrl || !supabaseKey) {
		return json({ error: 'Server configuration error' }, { status: 500 });
	}
	const user = await getAuthenticatedUser(request);
	if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

	const adminClient = getServiceRoleClient();
	if (!adminClient) return json({ error: 'Server configuration error' }, { status: 500 });

	let body: Record<string, unknown>;
	try {
		const parsedBody: unknown = await request.json();
		if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
			return json({ error: 'Invalid request body.' }, { status: 400 });
		}
		body = parsedBody as Record<string, unknown>;
	} catch {
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}

	const update: Record<string, string | null> = {};
	if (Object.prototype.hasOwnProperty.call(body, 'phone_number')) {
		if (body.phone_number !== null && typeof body.phone_number !== 'string') {
			return json({ error: 'Phone number must be a string or null.' }, { status: 400 });
		}
		const phoneNumber = typeof body.phone_number === 'string' ? body.phone_number.trim() : '';
		if (phoneNumber.length > 50) {
			return json({ error: 'Phone number must be 50 characters or fewer.' }, { status: 400 });
		}
		update.phone_number = phoneNumber || null;
	}

	if (Object.prototype.hasOwnProperty.call(body, 'driver_contact_method')) {
		const method = body.driver_contact_method;
		if (method !== null && method !== 'phone' && method !== 'email') {
			return json({ error: 'Contact method must be phone, email, or null.' }, { status: 400 });
		}
		update.driver_contact_method = method;
	}

	if (Object.keys(update).length === 0) {
		return json({ error: 'No private contact fields provided.' }, { status: 400 });
	}

	const { data, error } = await adminClient
		.from('profiles')
		.update(update)
		.eq('id', user.id)
		.select('phone_number, driver_contact_method')
		.single();

	if (error) {
		console.error('Private profile contact save error:', error);
		return json({ error: 'Unable to save private contact details.' }, { status: 500 });
	}

	return json({ contact: data });
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		if (!supabaseUrl || !supabaseKey) {
			console.error('Missing Supabase environment variables for profile API');
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		// Get JWT token from Authorization header
		const authHeader = request.headers.get('authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const token = authHeader.slice(7); // Remove "Bearer "

		// Create a Supabase client with the user's token
		const supabaseClient = createClient(supabaseUrl, supabaseKey, {
			global: {
				headers: {
					authorization: `Bearer ${token}`
				}
			}
		});

		// Validate user with their token
		const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

		if (userError || !user) {
			console.error('Auth error:', userError);
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json();
		const { first_name, gender, bio, languages, ride_preferences, profile_photo_url } = body;

		if (!first_name || !gender) {
			return json({ error: 'First name and gender are required' }, { status: 400 });
		}

		// Check if profile exists
		const { data: existingProfile, error: checkError } = await supabaseClient
			.from('profiles')
			.select('id')
			.eq('id', user.id)
			.maybeSingle();

		if (checkError && checkError.code !== 'PGRST116') {
			console.error('Check error:', checkError);
			throw checkError;
		}

		let error;

		if (existingProfile) {
			// Update existing profile
			const { error: updateError } = await supabaseClient
				.from('profiles')
				.update({
					first_name,
					gender,
					bio: bio || null,
					languages: languages && languages.length > 0 ? languages : null,
					ride_preferences: ride_preferences && ride_preferences.length > 0 ? ride_preferences : null,
					profile_photo_url: profile_photo_url || null,
					updated_at: new Date().toISOString()
				})
				.eq('id', user.id);
			error = updateError;
		} else {
			// Insert new profile
			const { error: insertError } = await supabaseClient
				.from('profiles')
				.insert({
					id: user.id,
					first_name,
					gender,
					bio: bio || null,
					languages: languages && languages.length > 0 ? languages : null,
					ride_preferences: ride_preferences && ride_preferences.length > 0 ? ride_preferences : null,
					profile_photo_url: profile_photo_url || null
				});
			error = insertError;
		}

		if (error) {
			console.error('Profile save error:', error);
			return json(
				{ error: error.message || 'Failed to save profile' },
				{ status: 400 }
			);
		}

		return json({ success: true });
	} catch (err) {
		console.error('API error:', err);
		return json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
};

export const DELETE: RequestHandler = async ({ request }) => {
	try {
		if (!supabaseUrl || !supabaseKey) {
			console.error('Missing Supabase config');
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey) {
			console.error('SUPABASE_SERVICE_ROLE_KEY is missing. Account deletion cannot be completed.');
			return json(
				{ error: 'Account deletion is not configured on the server. Please contact support.' },
				{ status: 500 }
			);
		}

		const authHeader = request.headers.get('authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			console.error('No valid auth header');
			return json({ error: 'Unauthorized: Missing token' }, { status: 401 });
		}

		const token = authHeader.slice(7).trim();

		const supabaseClient = createClient(supabaseUrl, supabaseKey);

		// Validate bearer token explicitly for server-side requests.
		const {
			data: { user },
			error: userError
		} = await supabaseClient.auth.getUser(token);
		
		if (userError) {
			console.error('Auth getUser error:', userError);
			return json({ error: `Unauthorized: ${userError.message}` }, { status: 401 });
		}

		if (!user) {
			console.error('No user found in token');
			return json({ error: 'Unauthorized: No user' }, { status: 401 });
		}

		console.log('Deleting account for user:', user.id);

		const adminClient = createClient(supabaseUrl, serviceRoleKey);
		
		// First, manually cascade delete related data to avoid foreign key constraint violations
		try {
			// Delete only the reviews this user RECEIVED. Reviews they wrote about other
			// members are kept (reviewer_id becomes NULL), so recipients are not penalized.
			await adminClient.from('reviews').delete().eq('reviewee_id', user.id);

			// Delete bookings where this user is the passenger
			await adminClient.from('bookings').delete().eq('passenger_id', user.id);

			// Delete rides where this user is the driver
			await adminClient.from('rides').delete().eq('driver_id', user.id);

			// Delete reports where this user is the reporter or reported user
			await adminClient.from('reports').delete().or(`reporter_id.eq.${user.id},user_id.eq.${user.id}`);

			// Delete support tickets where this user is the user
			await adminClient.from('support_tickets').delete().eq('user_id', user.id);

			// Delete verification documents
			await adminClient.from('verification_documents').delete().eq('user_id', user.id);

			// Delete transactions related to this user (if user_id column exists)
			try {
				await adminClient.from('transactions').delete().eq('user_id', user.id);
			} catch {
				// Transactions table may not have user_id column or may not exist - continue anyway
			}

			// Delete the profile
			await adminClient.from('profiles').delete().eq('id', user.id);
		} catch (cascadeError) {
			console.warn('Cascade delete warning:', cascadeError);
			// Continue to delete auth user anyway
		}

		// Finally delete the auth user
		const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(user.id);
		if (deleteAuthError) {
			console.error('Auth user delete error:', deleteAuthError);
			return json({ error: `Failed to delete account: ${deleteAuthError.message}` }, { status: 500 });
		}

		console.log('User deleted successfully');
		return json({ success: true, authDeleted: true });
	} catch (err) {
		console.error('Delete API error:', err);
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: `Internal error: ${message}` }, { status: 500 });
	}
};
