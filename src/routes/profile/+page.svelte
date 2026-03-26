<script lang="ts">
	import { supabase } from '$lib/supabaseClient';
	import { user } from '$lib/authStore';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import type { User } from '@supabase/supabase-js';

	type Profile = {
		first_name: string;
		last_name: string;
		phone_number: string;
		date_of_birth: string;
		city_of_birth: string;
		address: string;
		zip_code: string;
		car_make: string;
		car_year: string;
		insurance_company: string;
		plate_number: string;
		proof_of_resident_type: string;
		gender: string;
		bio: string;
		languages: string[];
		ride_preferences: string[];
		profile_photo_url: string;
		status: string;
	};

	let currentUser: User | null = null;
	let loading = true;
	let saving = false;
	let isEditing = false;
	let profileLoaded = false;
	let authChecked = false;

	const emptyProfile: Profile = {
		first_name: '',
		last_name: '',
		phone_number: '',
		date_of_birth: '',
		city_of_birth: '',
		address: '',
		zip_code: '',
		car_make: '',
		car_year: '',
		insurance_company: '',
		plate_number: '',
		proof_of_resident_type: '',
		gender: '',
		bio: '',
		languages: [] as string[],
		ride_preferences: [] as string[],
		profile_photo_url: '',
		status: 'Unverified'
	};

	let profile: Profile = { ...emptyProfile };

	// Form data
	let formData = { ...profile };
	let selectedFile: File | null = null;
	let previewUrl = '';

	// Available options
	const genderOptions = [
		{ value: 'female', label: 'Female' },
		{ value: 'male', label: 'Male' }
	];

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

	const unsubscribe = user.subscribe((u) => {
		currentUser = u;

		if (!u) {
			loading = false;
			profileLoaded = false;
			if (authChecked && browser) {
				goto(resolve('/auth/login'));
			}
			return;
		}

		authChecked = true;

		// Load profile once per session
		if (!profileLoaded) {
			profileLoaded = true;
			loadProfile();
		}
	});

	onDestroy(() => {
		unsubscribe();
	});

	onMount(async () => {
		if (authChecked) return;

		const { data } = await supabase.auth.getUser();
		authChecked = true;

		if (!data.user && browser) {
			loading = false;
			goto(resolve('/auth/login'));
		}
	});

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

	function normalizeProfile(data?: Partial<Profile> | null): Profile {
		return {
			...emptyProfile,
			...data,
			first_name: data?.first_name ?? '',
			last_name: (data?.last_name as string) ?? '',
			phone_number: (data?.phone_number as string) ?? '',
			date_of_birth: (data?.date_of_birth as string) ?? '',
			city_of_birth: (data?.city_of_birth as string) ?? '',
			address: (data?.address as string) ?? '',
			zip_code: (data?.zip_code as string) ?? '',
			car_make: (data?.car_make as string) ?? '',
			car_year: data?.car_year ? String(data.car_year) : '',
			insurance_company: (data?.insurance_company as string) ?? '',
			plate_number: (data?.plate_number as string) ?? '',
			proof_of_resident_type: (data?.proof_of_resident_type as string) ?? '',
			bio: (data?.bio as string) ?? '',
			gender: data?.gender ?? '',
			languages: normalizeOptionSelections(data?.languages, languageOptions),
			ride_preferences: normalizeOptionSelections(data?.ride_preferences, ridePreferenceOptions),
			profile_photo_url: (data?.profile_photo_url as string) ?? '',
			status: data?.status ?? 'Unverified'
		};
	}

	async function loadProfile() {
		loading = true;
		try {
			const { data, error } = await supabase
				.from('profiles')
				.select('*')
				.eq('id', currentUser!.id)
				.maybeSingle();

			if (error) {
				throw error;
			}

			if (data) {
				profile = normalizeProfile(data);
				formData = { ...profile };
				previewUrl = profile.profile_photo_url || '';
			}
		} catch {
			console.log('No profile found, will create one');
		} finally {
			loading = false;
		}
	}

	function startEditing() {
		isEditing = true;
		formData = { ...profile };
	}

	function cancelEditing() {
		isEditing = false;
		formData = { ...profile };
		selectedFile = null;
		previewUrl = profile.profile_photo_url || '';
	}

	function viewPublicProfile() {
		goto(resolve('/profile/public'));
	}

	async function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			selectedFile = file;
			previewUrl = URL.createObjectURL(file);
		}
	}

	async function uploadPhoto(file: File): Promise<string | null> {
		const fileExt = file.name.split('.').pop();
		const fileName = `${currentUser!.id}_${Date.now()}.${fileExt}`;
		const filePath = `${currentUser!.id}/${fileName}`;

		const { error: uploadError } = await supabase.storage
			.from('profile-photos')
			.upload(filePath, file);

		if (uploadError) {
			console.error('Error uploading file:', uploadError);
			return null;
		}

		const { data } = supabase.storage
			.from('profile-photos')
			.getPublicUrl(filePath);

		return data.publicUrl;
	}

	async function saveProfile() {
		if (!currentUser) return;

		saving = true;

		try {
			const trimmedFirstName = formData.first_name.trim();
			const trimmedLastName = formData.last_name.trim();
			const trimmedPhoneNumber = formData.phone_number.trim();
			const trimmedCityOfBirth = formData.city_of_birth.trim();
			const trimmedAddress = formData.address.trim();
			const trimmedZipCode = formData.zip_code.trim();
			const trimmedCarMake = formData.car_make.trim();
			const trimmedInsuranceCompany = formData.insurance_company.trim();
			const trimmedPlateNumber = formData.plate_number.trim();
			const trimmedProofOfResidentType = formData.proof_of_resident_type.trim();
			const parsedCarYear = Number.parseInt(formData.car_year, 10);
			const carYear = Number.isNaN(parsedCarYear) ? null : parsedCarYear;
			if (!trimmedFirstName || !formData.gender) {
				alert('First name and gender are required.');
				return;
			}

			let photoUrl = formData.profile_photo_url;
			const sanitizedLanguages = normalizeOptionSelections(formData.languages, languageOptions);
			const sanitizedRidePreferences = normalizeOptionSelections(
				formData.ride_preferences,
				ridePreferenceOptions
			);

			// Upload new photo if selected
			if (selectedFile) {
				const uploadedUrl = await uploadPhoto(selectedFile);
				if (!uploadedUrl) {
					alert('Error uploading profile photo. Please try again.');
					return;
				}

				photoUrl = uploadedUrl;
			}

			const { error } = await supabase
				.from('profiles')
				.upsert({
					id: currentUser.id,
					first_name: trimmedFirstName,
					last_name: trimmedLastName || null,
					phone_number: trimmedPhoneNumber || null,
					date_of_birth: formData.date_of_birth || null,
					city_of_birth: trimmedCityOfBirth || null,
					address: trimmedAddress || null,
					zip_code: trimmedZipCode || null,
					car_make: trimmedCarMake || null,
					car_year: carYear,
					insurance_company: trimmedInsuranceCompany || null,
					plate_number: trimmedPlateNumber || null,
					proof_of_resident_type: trimmedProofOfResidentType || null,
					gender: formData.gender,
					bio: formData.bio || null,
					languages: sanitizedLanguages,
					ride_preferences: sanitizedRidePreferences,
					profile_photo_url: photoUrl || null,
					updated_at: new Date().toISOString()
				}, { onConflict: 'id' });

			if (error) {
				console.error('Erreur detaillee de sauvegarde:', error);
				alert(error.message || 'Error saving profile. Please try again.');
			} else {
				profile = normalizeProfile({
					first_name: trimmedFirstName,
					last_name: trimmedLastName,
					phone_number: trimmedPhoneNumber,
					date_of_birth: formData.date_of_birth,
					city_of_birth: trimmedCityOfBirth,
					address: trimmedAddress,
					zip_code: trimmedZipCode,
					car_make: trimmedCarMake,
					car_year: carYear ? String(carYear) : '',
					insurance_company: trimmedInsuranceCompany,
					plate_number: trimmedPlateNumber,
					proof_of_resident_type: trimmedProofOfResidentType,
					gender: formData.gender,
					bio: formData.bio,
					languages: sanitizedLanguages,
					ride_preferences: sanitizedRidePreferences,
					profile_photo_url: photoUrl,
					status: profile.status
				});
				formData = { ...profile };
				previewUrl = photoUrl || '';
				isEditing = false;
				selectedFile = null;
				alert('Profile updated successfully!');
			}
		} catch (error) {
			console.error('Error:', error);
			alert('An error occurred. Please try again.');
		} finally {
			saving = false;
		}
	}

	async function signOut() {
		await supabase.auth.signOut();
		goto(resolve('/auth/login'));
	}

	// --- Account deletion ---
	let showDeleteModal = false;
	let deleteStep = 1; // 1 = warning, 2 = email confirmation
	let deleteConfirmEmail = '';
	let deleting = false;
	let deleteError = '';

	function openDeleteModal() {
		showDeleteModal = true;
		deleteStep = 1;
		deleteConfirmEmail = '';
		deleteError = '';
	}

	function closeDeleteModal() {
		showDeleteModal = false;
		deleteStep = 1;
		deleteConfirmEmail = '';
		deleteError = '';
	}

	async function deleteAccount() {
		if (!currentUser) return;
		if (deleteConfirmEmail.trim().toLowerCase() !== currentUser.email?.toLowerCase()) {
			deleteError = 'The email address does not match. Please try again.';
			return;
		}
		deleting = true;
		deleteError = '';
		try {
			const { data: sessionData } = await supabase.auth.getSession();
			const token = sessionData?.session?.access_token;
			if (!token) {
				deleteError = 'Session expired. Please sign in again.';
				console.error('No token available');
				return;
			}
			console.log('Starting account deletion...');
			const response = await fetch('/api/profile', {
				method: 'DELETE',
				headers: { 
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json'
				}
			});
			const body = await response.json();
			console.log('Delete response:', { status: response.status, body });
			
			if (!response.ok) {
				deleteError = body?.error || `Failed to delete account (${response.status}). Please try again.`;
				return;
			}
			
			console.log('Account deleted successfully');
			await supabase.auth.signOut();
			goto(resolve('/auth/login'));
		} catch (err) {
			console.error('Delete error:', err);
			deleteError = err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.';
		} finally {
			deleting = false;
		}
	}

	function toggleRidePreference(pref: string) {
		if (formData.ride_preferences.includes(pref)) {
			formData.ride_preferences = formData.ride_preferences.filter(p => p !== pref);
		} else {
			formData.ride_preferences = [...formData.ride_preferences, pref];
		}
	}

	function toggleLanguage(language: string) {
		if (formData.languages.includes(language)) {
			formData.languages = formData.languages.filter(l => l !== language);
		} else {
			formData.languages = [...formData.languages, language];
		}
	}
</script>

{#if loading}
	<div class="min-h-screen flex items-center justify-center">
		<div class="text-center">
			<div class="animate-spin rounded-full h-32 w-32 border-b-2 border-green-600"></div>
			<p class="mt-4 text-gray-600">Loading profile...</p>
		</div>
	</div>
{:else if currentUser}
	<div class="min-h-screen profile-page-bg py-10 px-4 sm:px-6 lg:px-8">
		<div class="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_58%)]"></div>
		<div class="max-w-4xl mx-auto relative z-10">
			<!-- Header -->
			<div class="rounded-2xl bg-linear-to-r from-emerald-600 via-emerald-500 to-teal-500 p-7 shadow-xl mb-6 text-white border border-emerald-300/30">
				<div class="flex items-center justify-between">
					<div>
						<h1 class="text-3xl font-bold tracking-tight">My Profile</h1>
						<p class="text-emerald-50/95 mt-1">Manage your account information</p>
					</div>
					<button
						on:click={openDeleteModal}
						class="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600/80 hover:bg-red-700 transition-colors cursor-pointer"
					>
						Delete Account
					</button>
				</div>
			</div>

			<!-- Profile Status -->
			<div class="profile-card p-6 mb-6">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-xl font-semibold text-slate-900">Account Status</h2>
						<p class="text-sm text-slate-600 mt-1">Email: {currentUser.email}</p>
						<p class="text-sm text-slate-600">Status: {profile.status || 'Unverified'}</p>
					</div>
					<div class="text-right">
						<span class="inline-flex items-center px-3.5 py-1.5 rounded-full text-sm font-semibold shadow-sm
							{profile.first_name && profile.last_name && profile.gender ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200' : 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'}">
							{profile.first_name && profile.last_name && profile.gender ? 'Complete' : 'Incomplete'}
						</span>
					</div>
				</div>
			</div>

			<!-- Profile Form -->
			<div class="profile-card p-7">
				{#if !isEditing}
					<!-- View Mode -->
					<div class="space-y-6">
						<div class="flex items-center justify-between">
							<h2 class="text-2xl font-semibold text-slate-900">Profile Information</h2>
							<div class="space-x-2">
								<button
									type="button"
									on:click={viewPublicProfile}
									class="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
								>
									View my public profile
								</button>
								<button
									type="button"
									on:click={startEditing}
									class="px-4 py-2 rounded-lg bg-linear-to-r from-emerald-600 to-teal-500 text-white hover:from-emerald-700 hover:to-teal-600 transition-all shadow-md cursor-pointer"
								>
									Edit Profile
								</button>
							</div>
						</div>

						<!-- Profile Photo -->
						<div class="flex items-center space-x-4 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
							<div class="w-24 h-24 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden ring-4 ring-white shadow-md">
								{#if profile.profile_photo_url}
									<img src={profile.profile_photo_url} alt="Profile" class="w-full h-full object-cover" />
								{:else}
									<svg class="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
										<path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z"/>
									</svg>
								{/if}
							</div>
							<div>
								<h3 class="text-xl font-semibold text-slate-900">{(profile.first_name || profile.last_name) ? `${profile.first_name} ${profile.last_name}`.trim() : 'No name set'}</h3>
								<p class="text-slate-600 capitalize">{profile.gender ? profile.gender : 'Gender not set'}</p>
							</div>
						</div>

						<!-- Profile Details -->
						<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div>
								<h4 class="font-medium text-gray-900 mb-2">Bio</h4>
								<p class="text-gray-600">{profile.bio || 'No bio added yet'}</p>
							</div>
						</div>

						<div class="border-t border-slate-200 pt-6">
							<h4 class="text-lg font-semibold text-slate-900 mb-4">Personal Information</h4>
							<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
								<div>
									<h5 class="font-medium text-gray-900 mb-2">Phone Number</h5>
									<p class="text-gray-600">{profile.phone_number || 'Not provided'}</p>
								</div>
								<div>
									<h5 class="font-medium text-gray-900 mb-2">Date of Birth</h5>
									<p class="text-gray-600">{profile.date_of_birth || 'Not provided'}</p>
								</div>
								<div>
									<h5 class="font-medium text-gray-900 mb-2">City of Birth</h5>
									<p class="text-gray-600">{profile.city_of_birth || 'Not provided'}</p>
								</div>
								<div>
									<h5 class="font-medium text-gray-900 mb-2">Zip Code</h5>
									<p class="text-gray-600">{profile.zip_code || 'Not provided'}</p>
								</div>
								<div class="md:col-span-2">
									<h5 class="font-medium text-gray-900 mb-2">Address</h5>
									<p class="text-gray-600">{profile.address || 'Not provided'}</p>
								</div>
								<div>
									<h5 class="font-medium text-gray-900 mb-2">Languages Spoken</h5>
									{#if profile.languages.length > 0}
										<div class="flex flex-wrap gap-2">
											{#each profile.languages as lang (lang)}
												<span class="chip chip-emerald">{lang}</span>
											{/each}
										</div>
									{:else}
										<p class="text-gray-600">No languages specified</p>
									{/if}
								</div>
								<div>
									<h5 class="font-medium text-gray-900 mb-2">Ride Preferences</h5>
									{#if profile.ride_preferences.length > 0}
										<div class="flex flex-wrap gap-2">
											{#each profile.ride_preferences as pref (pref)}
												<span class="chip chip-sky">{pref}</span>
											{/each}
										</div>
									{:else}
										<p class="text-gray-600">No preferences specified</p>
									{/if}
								</div>
							</div>
						</div>

						<div class="border-t border-slate-200 pt-6">
							<h4 class="text-lg font-semibold text-slate-900 mb-4">Car Information</h4>
							<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
								<div>
									<h5 class="font-medium text-gray-900 mb-2">Make</h5>
									<p class="text-gray-600">{profile.car_make || 'Not provided'}</p>
								</div>
								<div>
									<h5 class="font-medium text-gray-900 mb-2">Year</h5>
									<p class="text-gray-600">{profile.car_year || 'Not provided'}</p>
								</div>
								<div>
									<h5 class="font-medium text-gray-900 mb-2">Insurance Company</h5>
									<p class="text-gray-600">{profile.insurance_company || 'Not provided'}</p>
								</div>
								<div>
									<h5 class="font-medium text-gray-900 mb-2">Plate Number</h5>
									<p class="text-gray-600">{profile.plate_number || 'Not provided'}</p>
								</div>
								<div class="md:col-span-2">
									<h5 class="font-medium text-gray-900 mb-2">Proof of Resident Type</h5>
									<p class="text-gray-600">{profile.proof_of_resident_type || 'Not provided'}</p>
								</div>
							</div>
						</div>
					</div>
				{:else}
					<!-- Edit Mode -->
					<form on:submit|preventDefault={saveProfile} class="space-y-6">
						<div class="flex items-center justify-between">
							<h2 class="text-2xl font-semibold text-slate-900">Edit Profile</h2>
							<div class="space-x-2">
								<button
									type="button"
									on:click={cancelEditing}
									class="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:cursor-not-allowed"
									disabled={saving}
								>
									Cancel
								</button>
								<button
									type="button"
									on:click={viewPublicProfile}
									class="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:cursor-not-allowed"
									disabled={saving}
								>
									View my public profile
								</button>
								<button
									type="submit"
									disabled={saving}
									class="px-4 py-2 rounded-lg bg-linear-to-r from-emerald-600 to-teal-500 text-white hover:from-emerald-700 hover:to-teal-600 disabled:opacity-50 shadow-md cursor-pointer disabled:cursor-not-allowed"
								>
									{saving ? 'Saving...' : 'Save Changes'}
								</button>
							</div>
						</div>

						<!-- Profile Photo Upload -->
						<div>
							<label for="profile_photo" class="block text-sm font-medium text-gray-700 mb-2">Profile Photo</label>
							<div class="flex items-center space-x-4">
								<div class="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
									{#if previewUrl}
										<img src={previewUrl} alt="Preview" class="w-full h-full object-cover" />
									{:else}
										<svg class="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
											<path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z"/>
										</svg>
									{/if}
								</div>
								<div>
									<input
										id="profile_photo"
										type="file"
										accept="image/*"
										on:change={handleFileSelect}
										class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
									/>
									<p class="text-xs text-gray-500 mt-1">JPG, PNG or GIF. Max size 5MB.</p>
								</div>
							</div>
						</div>

						<!-- Required Fields -->
						<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
							<div>
								<label for="first_name" class="block text-sm font-medium text-gray-700 mb-2">
									First Name <span class="text-red-500">*</span>
								</label>
								<input
									type="text"
									id="first_name"
									bind:value={formData.first_name}
									required
									class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
									placeholder="Enter your first name"
								/>
							</div>

							<div>
								<label for="last_name" class="block text-sm font-medium text-gray-700 mb-2">
									Last Name
								</label>
								<input
									type="text"
									id="last_name"
									bind:value={formData.last_name}
									class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
									placeholder="Enter your last name"
								/>
							</div>

							<div>
								<label for="gender" class="block text-sm font-medium text-gray-700 mb-2">
									Gender <span class="text-red-500">*</span>
									{#if profile.gender}
										<span class="text-xs text-gray-500">(cannot be changed after validation)</span>
									{/if}
								</label>
								<select
									id="gender"
									bind:value={formData.gender}
									required
									disabled={!!profile.gender}
									class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
								>
									<option value="">Select gender</option>
									{#each genderOptions as option (option.value)}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>
							</div>
						</div>

						<!-- Optional Fields -->
						<div>
							<label for="bio" class="block text-sm font-medium text-gray-700 mb-2">Bio</label>
							<textarea
								id="bio"
								bind:value={formData.bio}
								rows="3"
								class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
								placeholder="Tell us about yourself..."
							></textarea>
						</div>

						<div class="border-t border-gray-200 pt-6">
							<h3 class="text-lg font-semibold text-gray-900 mb-4">Personal Information</h3>
							<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
								<div>
									<label for="phone_number" class="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
									<input
										type="tel"
										id="phone_number"
										bind:value={formData.phone_number}
										class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
										placeholder="Enter your phone number"
									/>
								</div>

								<div>
									<label for="date_of_birth" class="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
									<input
										type="date"
										id="date_of_birth"
										bind:value={formData.date_of_birth}
										class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
									/>
								</div>

								<div>
									<label for="city_of_birth" class="block text-sm font-medium text-gray-700 mb-2">City of Birth</label>
									<input
										type="text"
										id="city_of_birth"
										bind:value={formData.city_of_birth}
										class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
										placeholder="Enter your city of birth"
									/>
								</div>

								<div>
									<label for="zip_code" class="block text-sm font-medium text-gray-700 mb-2">Zip Code</label>
									<input
										type="text"
										id="zip_code"
										bind:value={formData.zip_code}
										class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
										placeholder="Enter your zip code"
									/>
								</div>

								<div class="md:col-span-2">
									<label for="address" class="block text-sm font-medium text-gray-700 mb-2">Address</label>
									<input
										type="text"
										id="address"
										bind:value={formData.address}
										class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
										placeholder="Enter your address"
									/>
								</div>

								<fieldset class="md:col-span-2">
									<legend class="block text-sm font-medium text-gray-700 mb-2">Languages Spoken</legend>
									<div class="grid grid-cols-2 md:grid-cols-3 gap-2">
										{#each languageOptions as language (language)}
											<label class="flex items-center">
												<input
													type="checkbox"
													checked={formData.languages.includes(language)}
													on:change={() => toggleLanguage(language)}
													class="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
												/>
												<span class="ml-2 text-sm text-gray-700">{language}</span>
											</label>
										{/each}
									</div>
								</fieldset>

								<fieldset class="md:col-span-2">
									<legend class="block text-sm font-medium text-gray-700 mb-2">Ride Preferences</legend>
									<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
										{#each ridePreferenceOptions as pref (pref)}
											<label class="flex items-center space-x-2">
												<input
													type="checkbox"
													checked={formData.ride_preferences.includes(pref)}
													on:change={() => toggleRidePreference(pref)}
													class="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
												/>
												<span class="text-sm text-gray-700">{pref}</span>
											</label>
										{/each}
									</div>
									<p class="text-xs text-gray-500 mt-1">Choose your ride preferences.</p>
								</fieldset>
							</div>
						</div>

						<div class="border-t border-gray-200 pt-6">
							<h3 class="text-lg font-semibold text-gray-900 mb-4">Car Information</h3>
							<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
								<div>
									<label for="car_make" class="block text-sm font-medium text-gray-700 mb-2">Make</label>
									<input
										type="text"
										id="car_make"
										bind:value={formData.car_make}
										class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
										placeholder="Enter car make"
									/>
								</div>

								<div>
									<label for="car_year" class="block text-sm font-medium text-gray-700 mb-2">Year</label>
									<input
										type="number"
										id="car_year"
										min="1900"
										max="2100"
										bind:value={formData.car_year}
										class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
										placeholder="Enter car year"
									/>
								</div>

								<div>
									<label for="insurance_company" class="block text-sm font-medium text-gray-700 mb-2">Insurance Company</label>
									<input
										type="text"
										id="insurance_company"
										bind:value={formData.insurance_company}
										class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
										placeholder="Enter insurance company"
									/>
								</div>

								<div>
									<label for="plate_number" class="block text-sm font-medium text-gray-700 mb-2">Plate Number</label>
									<input
										type="text"
										id="plate_number"
										bind:value={formData.plate_number}
										class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
										placeholder="Enter plate number"
									/>
								</div>

								<div class="md:col-span-2">
									<label for="proof_of_resident_type" class="block text-sm font-medium text-gray-700 mb-2">Proof of Resident Type</label>
									<input
										type="text"
										id="proof_of_resident_type"
										bind:value={formData.proof_of_resident_type}
										class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
										placeholder="Enter proof type (e.g. utility bill, residence permit)"
									/>
								</div>
							</div>
						</div>

					</form>
				{/if}
			</div>
		</div>
	</div>
{:else}
	<div class="min-h-screen flex items-center justify-center">
		<div class="text-center">
			<p class="text-gray-600">You are not logged in.</p>
			<a href={resolve('/auth/login')} class="text-green-600 hover:text-green-700 font-medium">Sign in</a>
		</div>
	</div>
{/if}

<!-- Delete Account Modal -->
{#if showDeleteModal}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
		on:click|self={closeDeleteModal}
	>
		<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7 relative">
			<button
				type="button"
				on:click={closeDeleteModal}
				class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer"
				aria-label="Close"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
				</svg>
			</button>

			{#if deleteStep === 1}
				<!-- Step 1: Warning -->
				<div class="text-center">
					<div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
						<svg class="h-7 w-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
								d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
						</svg>
					</div>
					<h2 class="text-xl font-bold text-slate-900 mb-2">Delete your account?</h2>
					<p class="text-slate-600 text-sm mb-1">This action is <strong>permanent and irreversible</strong>.</p>
					<p class="text-slate-600 text-sm mb-6">All your profile data, rides, and bookings will be permanently removed.</p>
					<div class="flex gap-3">
						<button
							type="button"
							on:click={closeDeleteModal}
							class="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
						>
							Cancel
						</button>
						<button
							type="button"
							on:click={() => { deleteStep = 2; deleteError = ''; }}
							class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 cursor-pointer"
						>
							I understand, continue
						</button>
					</div>
				</div>
			{:else}
				<!-- Step 2: Email confirmation -->
				<div>
					<h2 class="text-xl font-bold text-slate-900 mb-1">Confirm deletion</h2>
					<p class="text-slate-600 text-sm mb-4">
						Type your email address <strong>{currentUser?.email}</strong> to confirm you want to permanently delete your account.
					</p>
					<label for="delete_confirm_email" class="block text-sm font-medium text-slate-700 mb-1">
						Your email address
					</label>
					<input
						id="delete_confirm_email"
						type="email"
						bind:value={deleteConfirmEmail}
						placeholder={currentUser?.email}
						class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 mb-3"
					/>
					{#if deleteError}
						<p class="text-red-600 text-sm mb-3">{deleteError}</p>
					{/if}
					<div class="flex gap-3">
						<button
							type="button"
							on:click={() => { deleteStep = 1; deleteError = ''; }}
							disabled={deleting}
							class="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
						>
							Back
						</button>
						<button
							type="button"
							on:click={deleteAccount}
							disabled={deleting}
							class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
						>
							{deleting ? 'Deleting...' : 'Delete my account'}
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.profile-page-bg {
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