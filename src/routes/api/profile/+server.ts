import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

const supabaseUrl = env.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseKey = env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

export const POST: RequestHandler = async ({ request }) => {
	try {
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

