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
		is_verified: boolean;
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
	let reportDescription = '';
	let reportingUser = false;
	let reportMessage = '';
	let reportError = '';
	let profile: PublicProfile = {
		first_name: '',
		last_name: '',
		is_verified: false,
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

	function hasSavedSearchUrl() {
		if (typeof sessionStorage === 'undefined') {
			return false;
		}

		const saved = sessionStorage.getItem('lastSearchUrl');
		return !!saved && saved.startsWith(resolve('/search'));
	}

	function goBackFromPublicProfile() {
		if (hasSavedSearchUrl() && !viewingOwnProfile) {
			goto(resolve('/search'));
			return;
		}

		goto(resolve(viewingOwnProfile ? '/profile' : '/dashboard'));
	}

	async function getSessionAccessToken(): Promise<string | null> {
		const {
			data: { session }
		} = await supabase.auth.getSession();

		return session?.access_token ?? null;
	}

	async function submitUserReport() {
		if (viewingOwnProfile || !viewedProfileId) return;

		reportMessage = '';
		reportError = '';

		const description = reportDescription.trim();
		if (!description) {
			reportError = 'Please describe the issue.';
			return;
		}

		const token = await getSessionAccessToken();
		if (!token) {
			reportError = 'Session expired. Please sign in again.';
			goto(resolve('/auth/login'));
			return;
		}

		reportingUser = true;
		try {
			const response = await fetch('/api/reports', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					targetType: 'user',
					targetUserId: viewedProfileId,
					description
				})
			});

			const payload = await response.json();
			if (!response.ok) {
				reportError = payload?.error || 'Unable to send report right now.';
				return;
			}

			reportMessage = 'Report sent. Our admin team will review it.';
			reportDescription = '';
		} catch {
			reportError = 'Unexpected error while sending report.';
		} finally {
			reportingUser = false;
		}
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
			.select('first_name,last_name,is_verified,car_make,car_year,phone_number,date_of_birth,city_of_birth,address,zip_code,gender,bio,languages,ride_preferences,profile_photo_url')
			.eq('id', profileId)
			.maybeSingle();

		if (error) {
			console.error('Error loading public profile:', error);
		} else if (data) {
			profile = {
				first_name: data.first_name ?? '',
				last_name: data.last_name ?? '',
				is_verified: data.is_verified ?? false,
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
	<div class="min-h-screen public-profile-bg py-10 px-4 sm:px-6 lg:px-8">
		<div class="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_58%)]"></div>
		<div class="max-w-4xl mx-auto relative z-10">
			<div class="rounded-2xl bg-linear-to-r from-emerald-600 via-emerald-500 to-teal-500 p-7 shadow-xl mb-6 text-white border border-emerald-300/30">
				<div class="flex items-center justify-between">
					<div>
						<h1 class="text-3xl font-bold tracking-tight">Public Profile</h1>
						<p class="text-emerald-50/95 mt-1">
							{viewingOwnProfile
								? 'This is how your public profile appears to other users'
								: 'Visible information for drivers and passengers'}
						</p>
					</div>
					<button
						on:click={goBackFromPublicProfile}
						class="px-4 py-2 rounded-lg text-sm font-semibold text-emerald-700 bg-white hover:bg-emerald-50 transition-colors"
					>
						{#if !viewingOwnProfile && hasSavedSearchUrl()}
							← Back to search results
						{:else}
							{viewingOwnProfile ? 'Back to edit' : 'Back to dashboard'}
						{/if}
					</button>
				</div>
			</div>

			<div class="profile-card p-7">
				<div class="flex items-center space-x-4 mb-6 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
					<div class="relative w-24 h-24 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden ring-4 ring-white shadow-md">
						{#if profile.profile_photo_url}
							<img src={profile.profile_photo_url} alt="Profile" class="w-full h-full object-cover" />
						{:else}
							<svg class="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
								<path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z"/>
							</svg>
						{/if}
						{#if profile.is_verified}
							<span
								class="absolute right-0 bottom-0 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-emerald-600 text-white shadow"
								title="Verified member"
								aria-label="Verified member"
							>
								<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
									<path fill-rule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.02 7.02a1 1 0 01-1.415 0L4.29 9.752a1 1 0 111.415-1.415l3.271 3.272 6.313-6.313a1 1 0 011.415-.006z" clip-rule="evenodd" />
								</svg>
							</span>
						{/if}
					</div>
					<div>
						<h2 class="text-2xl font-semibold text-slate-900">{(profile.first_name || profile.last_name) ? `${profile.first_name} ${profile.last_name}`.trim() : 'No name set'}</h2>
						<p class="text-slate-600 capitalize">{profile.gender || 'Gender not set'}</p>
						{#if profile.is_verified}
							<p class="text-xs font-semibold text-emerald-700 mt-1">Verified member</p>
						{/if}
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div>
						<h3 class="font-medium text-slate-900 mb-2">Bio</h3>
						<p class="text-slate-600">{profile.bio || 'No bio added yet'}</p>
					</div>
					<div>
						<h3 class="font-medium text-slate-900 mb-2">Languages</h3>
						{#if profile.languages.length > 0}
							<div class="flex flex-wrap gap-2">
								{#each profile.languages as lang (lang)}
									<span class="chip chip-emerald">{lang}</span>
								{/each}
							</div>
						{:else}
							<p class="text-slate-600">No languages specified</p>
						{/if}
					</div>
					<div class="md:col-span-2">
						<h3 class="font-medium text-slate-900 mb-2">Ride Preferences</h3>
						{#if profile.ride_preferences.length > 0}
							<div class="flex flex-wrap gap-2">
								{#each profile.ride_preferences as pref (pref)}
									<span class="chip chip-sky">{pref}</span>
								{/each}
							</div>
						{:else}
							<p class="text-slate-600">No preferences specified</p>
						{/if}
					</div>
				</div>

				<div class="border-t border-slate-200 pt-6 mt-6">
					<h3 class="text-lg font-semibold text-slate-900 mb-4">Car Information</h3>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div>
							<h4 class="font-medium text-slate-900 mb-2">Make</h4>
							<p class="text-slate-600">{profile.car_make || 'Not provided'}</p>
						</div>
						<div>
							<h4 class="font-medium text-slate-900 mb-2">Year</h4>
							<p class="text-slate-600">{profile.car_year || 'Not provided'}</p>
						</div>
					</div>
				</div>

				{#if !viewingOwnProfile}
					<div class="border-t border-slate-200 pt-6 mt-6">
						<div class="rounded-xl border border-red-200 bg-red-50 p-4">
							<p class="text-sm font-semibold text-red-900">Report this user</p>
							<p class="text-xs text-red-700 mt-1">This text is only visible to admins.</p>
							<textarea
								bind:value={reportDescription}
								rows="3"
								maxlength="2000"
								placeholder="Describe the issue with this user..."
								class="mt-3 w-full rounded-md border border-red-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
							></textarea>
							{#if reportError}
								<p class="mt-2 text-xs text-red-700">{reportError}</p>
							{/if}
							{#if reportMessage}
								<p class="mt-2 text-xs text-green-700">{reportMessage}</p>
							{/if}
							<button
								type="button"
								disabled={reportingUser}
								on:click={submitUserReport}
								class="mt-3 inline-flex items-center rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
							>
								{reportingUser ? 'Sending...' : 'Report user'}
							</button>
						</div>
					</div>
				{/if}

			</div>

			<ReviewsSection userId={viewedProfileId} userName={`${profile.first_name} ${profile.last_name}`.trim()} />
		</div>
	</div>
{/if}

<style>
	.public-profile-bg {
		background:
			radial-gradient(circle at 12% 10%, rgba(16, 185, 129, 0.08), transparent 28%),
			radial-gradient(circle at 92% 18%, rgba(14, 165, 233, 0.08), transparent 32%),
			linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
	}

	.profile-card {
		background: rgba(255, 255, 255, 0.94);
		border: 1px solid rgba(148, 163, 184, 0.24);
		border-radius: 1rem;
		box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
		backdrop-filter: blur(2px);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		padding: 0.2rem 0.6rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.chip-emerald {
		background: #d1fae5;
		color: #065f46;
	}

	.chip-sky {
		background: #e0f2fe;
		color: #075985;
	}
</style>
