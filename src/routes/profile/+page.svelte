<script lang="ts">
	import { supabase } from '$lib/supabaseClient';
	import { user } from '$lib/authStore';
	import { goto } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import type { User } from '@supabase/supabase-js';

	let currentUser: User | null = null;
	let loading = true;
	let saving = false;
	let isEditing = false;
	let profileLoaded = false;

	let profile = {
		first_name: '',
		gender: '',
		bio: '',
		languages: [] as string[],
		ride_preferences: [] as string[],
		profile_photo_url: '',
		status: 'Unverified'
	};

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
			goto('/auth/login');
			return;
		}

		// Load profile once per session
		if (!profileLoaded) {
			profileLoaded = true;
			loadProfile();
		}
	});

	onDestroy(() => {
		unsubscribe();
	});

	async function loadProfile() {
		loading = true;
		try {
			const { data } = await supabase
				.from('profiles')
				.select('*')
				.eq('id', currentUser!.id)
				.single();

			if (data) {
				profile = { ...profile, ...data };
				// Convert ride_preferences from string to array if needed
				if (typeof data.ride_preferences === 'string') {
					profile.ride_preferences = data.ride_preferences.split(',').map((p: string) => p.trim()).filter((p: string) => p);
				}
				// Convert languages from string to array if needed
				if (typeof data.languages === 'string') {
					profile.languages = data.languages.split(',').map((l: string) => l.trim()).filter((l: string) => l);
				}
				formData = { ...profile };
				previewUrl = profile.profile_photo_url || '';
			}
		} catch (error) {
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
		const filePath = `profile-photos/${fileName}`;

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
			let photoUrl = formData.profile_photo_url;

			// Upload new photo if selected
			if (selectedFile) {
				const uploadedUrl = await uploadPhoto(selectedFile);
				if (uploadedUrl) {
					photoUrl = uploadedUrl;
				}
			}

			const updatedProfile = {
				...formData,
				ride_preferences: formData.ride_preferences,
				profile_photo_url: photoUrl,
				updated_at: new Date().toISOString()
			};

			const { error } = await supabase
				.from('profiles')
				.upsert({
					id: currentUser.id,
					first_name: updatedProfile.first_name,
					gender: updatedProfile.gender,
					bio: updatedProfile.bio,
					languages: updatedProfile.languages.join(', '),
					ride_preferences: updatedProfile.ride_preferences.join(', '),
					profile_photo_url: photoUrl
				});

			if (error) {
				console.error('Erreur détaillée de sauvegarde:', error);
				alert('Error saving profile. Please try again.');
			} else {
				profile = { ...updatedProfile, status: 'Unverified' };
				isEditing = false;
				selectedFile = null;
				alert('Profile updated successfully!');
			}
		} catch (error) {
			console.error('Error:', error);
			alert('An error occurred. Please try again.');
		}

		saving = false;
	}

	async function signOut() {
		await supabase.auth.signOut();
		goto('/auth/login');
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
	<div class="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
		<div class="max-w-2xl mx-auto">
			<!-- Header -->
			<div class="bg-white rounded-lg shadow-md p-6 mb-6">
				<div class="flex items-center justify-between">
					<div>
						<h1 class="text-3xl font-bold text-gray-900">My Profile</h1>
						<p class="text-gray-600 mt-1">Manage your account information</p>
					</div>
					<button
						on:click={signOut}
						class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
					>
						Sign Out
					</button>
				</div>
			</div>

			<!-- Profile Status -->
			<div class="bg-white rounded-lg shadow-md p-6 mb-6">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-lg font-semibold text-gray-900">Account Status</h2>
						<p class="text-sm text-gray-600">Email: {currentUser.email}</p>
						<p class="text-sm text-gray-600">Status: Unverified</p>
					</div>
					<div class="text-right">
						<span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium
							{profile.first_name && profile.gender ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
							{profile.first_name && profile.gender ? 'Complete' : 'Incomplete'}
						</span>
					</div>
				</div>
			</div>

			<!-- Profile Form -->
			<div class="bg-white rounded-lg shadow-md p-6">
				{#if !isEditing}
					<!-- View Mode -->
					<div class="space-y-6">
						<div class="flex items-center justify-between">
							<h2 class="text-xl font-semibold text-gray-900">Profile Information</h2>
							<button
								on:click={startEditing}
								class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
							>
								Edit Profile
							</button>
						</div>

						<!-- Profile Photo -->
						<div class="flex items-center space-x-4">
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
								<h3 class="text-lg font-medium text-gray-900">{profile.first_name || 'No name set'}</h3>
								<p class="text-gray-600">{profile.gender ? profile.gender : 'Gender not set'}</p>
							</div>
						</div>

						<!-- Profile Details -->
						<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div>
								<h4 class="font-medium text-gray-900 mb-2">Bio</h4>
								<p class="text-gray-600">{profile.bio || 'No bio added yet'}</p>
							</div>
							<div>
								<h4 class="font-medium text-gray-900 mb-2">Languages</h4>
								<p class="text-gray-600">{profile.languages.length > 0 ? profile.languages.join(', ') : 'No languages specified'}</p>
							</div>
							<div class="md:col-span-2">
								<h4 class="font-medium text-gray-900 mb-2">Ride Preferences</h4>
								<p class="text-gray-600">{profile.ride_preferences.length > 0 ? profile.ride_preferences.join(', ') : 'No preferences specified'}</p>
							</div>
						</div>
					</div>
				{:else}
					<!-- Edit Mode -->
					<form on:submit|preventDefault={saveProfile} class="space-y-6">
						<div class="flex items-center justify-between">
							<h2 class="text-xl font-semibold text-gray-900">Edit Profile</h2>
							<div class="space-x-2">
								<button
									type="button"
									on:click={cancelEditing}
									class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
									disabled={saving}
								>
									Cancel
								</button>
								<button
									type="button"
									on:click={cancelEditing}
									class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
									disabled={saving}
								>
									View my profile
								</button>
								<button
									type="submit"
									disabled={saving}
									class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
								>
									{saving ? 'Saving...' : 'Save Changes'}
								</button>
							</div>
						</div>

						<!-- Profile Photo Upload -->
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-2">Profile Photo</label>
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
						<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
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
									{#each genderOptions as option}
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

						<div>
							<label class="block text-sm font-medium text-gray-700 mb-2">Languages</label>
							<div class="grid grid-cols-2 md:grid-cols-3 gap-2">
								{#each languageOptions as language}
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
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 mb-2">Ride Preferences</label>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
								{#each ridePreferenceOptions as pref}
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
			<a href="/auth/login" class="text-green-600 hover:text-green-700 font-medium">Sign in</a>
		</div>
	</div>
{/if}