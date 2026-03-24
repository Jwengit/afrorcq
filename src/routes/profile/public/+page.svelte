<script lang="ts">
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import ReviewsSection from '$lib/components/ReviewsSection.svelte';

	type PublicProfile = {
		first_name: string;
		last_name: string;
		car_make: string;
		car_year: string;
		phone_number: string;
		date_of_birth: string;
		city_of_birth: string;
		address: string;
		zip_code: string;
		gender: string;
		bio: string;
		languages: string[];
		ride_preferences: string[];
		profile_photo_url: string;
	};

	let loading = true;
	let viewingOwnProfile = true;
	let viewedProfileId = '';
	let profile: PublicProfile = {
		first_name: '',
		last_name: '',
		car_make: '',
		car_year: '',
		phone_number: '',
		date_of_birth: '',
		city_of_birth: '',
		address: '',
		zip_code: '',
		gender: '',
		bio: '',
		languages: [],
		ride_preferences: [],
		profile_photo_url: ''
	};

	const ridePreferenceOptions = [
		'No smoking',
		'No pets',
		'Music',
		'Talkative',
		'Air conditioning',
		'Food allowed'
	];

	const languageOptions = [
		'English', 'French', 'Spanish', 'German', 'Italian', 'Portuguese', 'Arabic', 'Chinese', 'Japanese', 'Korean'
	];

	function cleanArrayItem(value: string): string {
		return value
			.trim()
			.replace(/^\{+|\}+$/g, '')
			.replace(/^\[+|\]+$/g, '')
			.replace(/^"+|"+$/g, '')
			.replace(/\\,/g, ',')
			.replace(/\\\\/g, '\\')
			.replace(/\\"/g, '"')
			.trim();
	}

	function splitEscapedCommaString(value: string): string[] {
		return value.split(/(?<!\\),/).map(cleanArrayItem).filter(Boolean);
	}

	function parsePostgresArrayLiteral(value: string): string[] {
		const content = value.slice(1, -1);
		const items: string[] = [];
		let current = '';
		let inQuotes = false;
		let escaped = false;

		for (const character of content) {
			if (escaped) {
				current += character;
				escaped = false;
				continue;
			}

			if (character === '\\') {
				escaped = true;
				current += character;
				continue;
			}

			if (character === '"') {
				inQuotes = !inQuotes;
				current += character;
				continue;
			}

			if (character === ',' && !inQuotes) {
				const cleaned = cleanArrayItem(current);
				if (cleaned) items.push(cleaned);
				current = '';
				continue;
			}

			current += character;
		}

		const cleaned = cleanArrayItem(current);
		if (cleaned) items.push(cleaned);

		return items;
	}

	function normalizeOptionSelections(
		value: string[] | string | null | undefined,
		allowedOptions: string[]
	): string[] {
		const normalizedSource = normalizeArrayField(value).join(' | ').toLowerCase();

		return allowedOptions.filter((option) => normalizedSource.includes(option.toLowerCase()));
	}

	function normalizeArrayField(value: string[] | string | null | undefined): string[] {
		if (Array.isArray(value)) {
			return value
				.flatMap((item) => normalizeArrayField(item))
				.map(cleanArrayItem)
				.filter(Boolean);
		}

		if (typeof value === 'string') {
			const trimmedValue = value.trim();

			if (!trimmedValue) {
				return [];
			}

			if (trimmedValue.startsWith('[') && trimmedValue.endsWith(']')) {
				try {
					const parsed = JSON.parse(trimmedValue);
					return normalizeArrayField(parsed as string[]);
				} catch {
					// Fall back to comma-splitting below when stored data is not valid JSON.
				}
			}

			if (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) {
				return parsePostgresArrayLiteral(trimmedValue);
			}

			return splitEscapedCommaString(trimmedValue);
		}

		return [];
	}

	onMount(async () => {
		const { data: authData } = await supabase.auth.getUser();
		if (!authData.user) {
			goto(resolve('/auth/login'));
			return;
		}

		const requestedProfileId = $page.url.searchParams.get('id');
		const profileId = requestedProfileId || authData.user.id;
		viewedProfileId = profileId;
		viewingOwnProfile = profileId === authData.user.id;

		const { data, error } = await supabase
			.from('profiles')
			.select('first_name,last_name,car_make,car_year,phone_number,date_of_birth,city_of_birth,address,zip_code,gender,bio,languages,ride_preferences,profile_photo_url')
			.eq('id', profileId)
			.maybeSingle();

		if (error) {
			console.error('Error loading public profile:', error);
		} else if (data) {
			profile = {
				first_name: data.first_name ?? '',
				last_name: data.last_name ?? '',
				car_make: data.car_make ?? '',
				car_year: data.car_year ? String(data.car_year) : '',
				phone_number: data.phone_number ?? '',
				date_of_birth: data.date_of_birth ?? '',
				city_of_birth: data.city_of_birth ?? '',
				address: data.address ?? '',
				zip_code: data.zip_code ?? '',
				gender: data.gender ?? '',
				bio: data.bio ?? '',
				languages: normalizeOptionSelections(data.languages, languageOptions),
				ride_preferences: normalizeOptionSelections(data.ride_preferences, ridePreferenceOptions),
				profile_photo_url: data.profile_photo_url ?? ''
			};
		}

		loading = false;
	});
</script>

{#if loading}
	<div class="min-h-screen flex items-center justify-center">
		<div class="text-center">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
			<p class="mt-3 text-gray-600">Loading public profile...</p>
		</div>
	</div>
{:else}
	<div class="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
		<div class="max-w-2xl mx-auto">
			<div class="bg-white rounded-lg shadow-md p-6 mb-6">
				<div class="flex items-center justify-between">
					<div>
						<h1 class="text-3xl font-bold text-gray-900">Public Profile</h1>
						<p class="text-gray-600 mt-1">
							{viewingOwnProfile
								? 'This is how your public profile appears to other users'
								: 'Visible information for drivers and passengers'}
						</p>
					</div>
					<button
						on:click={() => goto(resolve(viewingOwnProfile ? '/profile' : '/dashboard'))}
						class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
					>
						{viewingOwnProfile ? 'Back to edit' : 'Back to dashboard'}
					</button>
				</div>
			</div>

			<div class="bg-white rounded-lg shadow-md p-6">
				<div class="flex items-center space-x-4 mb-6">
					<div class="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
						{#if profile.profile_photo_url}
							<img src={profile.profile_photo_url} alt="Profile" class="w-full h-full object-cover" />
						{:else}
							<svg class="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
								<path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z"/>
							</svg>
						{/if}
					</div>
					<div>
						<h2 class="text-xl font-semibold text-gray-900">{(profile.first_name || profile.last_name) ? `${profile.first_name} ${profile.last_name}`.trim() : 'No name set'}</h2>
						<p class="text-gray-600 capitalize">{profile.gender || 'Gender not set'}</p>
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div>
						<h3 class="font-medium text-gray-900 mb-2">Bio</h3>
						<p class="text-gray-600">{profile.bio || 'No bio added yet'}</p>
					</div>
					<div>
						<h3 class="font-medium text-gray-900 mb-2">Languages</h3>
						<p class="text-gray-600">{profile.languages.length > 0 ? profile.languages.join(', ') : 'No languages specified'}</p>
					</div>
					<div class="md:col-span-2">
						<h3 class="font-medium text-gray-900 mb-2">Ride Preferences</h3>
						<p class="text-gray-600">{profile.ride_preferences.length > 0 ? profile.ride_preferences.join(', ') : 'No preferences specified'}</p>
					</div>
				</div>

				<div class="border-t border-gray-200 pt-6 mt-6">
					<h3 class="text-lg font-semibold text-gray-900 mb-4">Car Information</h3>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div>
							<h4 class="font-medium text-gray-900 mb-2">Make</h4>
							<p class="text-gray-600">{profile.car_make || 'Not provided'}</p>
						</div>
						<div>
							<h4 class="font-medium text-gray-900 mb-2">Year</h4>
							<p class="text-gray-600">{profile.car_year || 'Not provided'}</p>
						</div>
					</div>
				</div>

			</div>

			<ReviewsSection userId={viewedProfileId} userName={`${profile.first_name} ${profile.last_name}`.trim()} />
		</div>
	</div>
{/if}
