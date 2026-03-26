import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

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
		const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

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

		const authHeader = request.headers.get('authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			console.error('No valid auth header');
			return json({ error: 'Unauthorized: Missing token' }, { status: 401 });
		}

		const token = authHeader.slice(7);

		// Create client with the user's token
		const supabaseClient = createClient(supabaseUrl, supabaseKey, {
			global: { 
				headers: { 
					authorization: `Bearer ${token}`
				}
			}
		});

		// Get authenticated user
		const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
		
		if (userError) {
			console.error('Auth getUser error:', userError);
			return json({ error: `Unauthorized: ${userError.message}` }, { status: 401 });
		}

		if (!user) {
			console.error('No user found in token');
			return json({ error: 'Unauthorized: No user' }, { status: 401 });
		}

		console.log('Deleting account for user:', user.id);

		// Delete profile row (RLS will enforce ownership)
		const { error: profileError } = await supabaseClient
			.from('profiles')
			.delete()
			.eq('id', user.id);

		if (profileError) {
			console.error('Profile delete error:', profileError);
			return json({ error: `Failed to delete profile: ${profileError.message}` }, { status: 500 });
		}

		// Delete auth user if service role key is configured
		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
		if (serviceRoleKey) {
			const adminClient = createClient(supabaseUrl, serviceRoleKey);
			const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(user.id);
			if (deleteAuthError) {
				console.error('Auth user delete error:', deleteAuthError);
				// Profile is already deleted; return partial success
				return json({ success: true, authDeleted: false, message: 'Profile deleted but auth account remains' });
			}
			console.log('User deleted successfully');
			return json({ success: true, authDeleted: true });
		}

		// No service role key — profile deleted, auth account remains inactive
		console.log('Profile deleted, service role key not available');
		return json({ success: true, authDeleted: false });
	} catch (err) {
		console.error('Delete API error:', err);
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: `Internal error: ${message}` }, { status: 500 });
	}
};

