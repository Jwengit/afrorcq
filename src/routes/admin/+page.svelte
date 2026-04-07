<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabaseClient';
	import { user } from '$lib/authStore';
	import type { User } from '@supabase/supabase-js';

	let currentUser: User | null = null;
	let loading = true;
	let isAdmin = false;
	let accessError = '';
	let activeTab = 'overview';

	type AdminUser = {
		id: string;
		first_name: string | null;
		last_name: string | null;
		email: string | null;
		is_admin: boolean | null;
		is_verified: boolean | null;
		created_at: string | null;
	};

	let usersLoading = false;
	let usersError = '';
	let usersActionMessage = '';
	let userSearch = '';
	let users: AdminUser[] = [];
	let actionUserId: string | null = null;

	// Stats placeholders
	let stats = {
		totalUsers: 0,
		totalRides: 0,
		totalBookings: 0,
		pendingVerifications: 0
	};

	onMount(() => {
		const unsubscribe = user.subscribe((u) => {
			currentUser = u;
		});

		async function initializeAdminPage() {
			// Wait for auth to resolve
			const {
				data: { user: authUser }
			} = await supabase.auth.getUser();
			if (!authUser) {
				goto('/auth/login');
				return;
			}

			const isHizliAccount =
				(authUser.email ?? '').toLowerCase() === 'hizli.carpooling@gmail.com';
			if (isHizliAccount) {
				isAdmin = true;
				await loadStats();
				loading = false;
				return;
			}

			const { data: profile, error } = await supabase
				.from('profiles')
				.select('is_admin')
				.eq('id', authUser.id)
				.maybeSingle();

			if (error) {
				accessError =
					"Impossible de verifier ton acces admin. Ton profil n'existe peut-etre pas encore dans la table profiles.";
				loading = false;
				return;
			}

			let checkedProfile = profile;
			if (!checkedProfile) {
				const fallbackFirstName =
					authUser.user_metadata?.full_name?.toString()?.split(' ')[0] ||
					authUser.user_metadata?.name?.toString()?.split(' ')[0] ||
					authUser.email?.split('@')[0] ||
					'User';

				await supabase.from('profiles').insert({
					id: authUser.id,
					first_name: fallbackFirstName
				});

				const { data: retryProfile } = await supabase
					.from('profiles')
					.select('is_admin')
					.eq('id', authUser.id)
					.maybeSingle();

				checkedProfile = retryProfile;
			}

			if (!checkedProfile?.is_admin) {
				accessError = "Ton compte est connecte, mais il n'a pas encore le role admin.";
				loading = false;
				return;
			}

			isAdmin = true;
			await loadStats();
			await loadUsers();
			loading = false;
		}

		initializeAdminPage();

		return () => unsubscribe();
	});

	async function loadStats() {
		const [usersRes, ridesRes, bookingsRes, verifyRes] = await Promise.all([
			supabase.from('profiles').select('id', { count: 'exact', head: true }),
			supabase.from('rides').select('id', { count: 'exact', head: true }),
			supabase.from('bookings').select('id', { count: 'exact', head: true }),
			supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_verified', false)
		]);

		stats = {
			totalUsers: usersRes.count ?? 0,
			totalRides: ridesRes.count ?? 0,
			totalBookings: bookingsRes.count ?? 0,
			pendingVerifications: verifyRes.count ?? 0
		};
	}

	async function loadUsers() {
		usersLoading = true;
		usersError = '';

		const { data, error } = await supabase
			.from('profiles')
			.select('id, first_name, last_name, email, is_admin, is_verified, created_at')
			.order('created_at', { ascending: false });

		if (error) {
			usersError = "Impossible de charger les utilisateurs pour le moment.";
			users = [];
			usersLoading = false;
			return;
		}

		users = (data ?? []) as AdminUser[];
		usersLoading = false;
	}

	async function updateUserFlag(targetUser: AdminUser, field: 'is_admin' | 'is_verified', value: boolean) {
		actionUserId = targetUser.id;
		usersActionMessage = '';

		const { error } = await supabase
			.from('profiles')
			.update({ [field]: value, updated_at: new Date().toISOString() })
			.eq('id', targetUser.id);

		if (error) {
			usersActionMessage =
				"Action impossible pour le moment. Verifie que ton compte a bien le role admin dans profiles.";
			actionUserId = null;
			return;
		}

		users = users.map((u) => (u.id === targetUser.id ? { ...u, [field]: value } : u));
		usersActionMessage =
			field === 'is_admin'
				? value
					? 'Le compte est maintenant admin.'
					: "Le role admin a ete retire."
				: value
					? 'Le compte est maintenant verifie.'
					: 'Le compte est repasse non verifie.';

		actionUserId = null;
	}

	$: normalizedSearch = userSearch.trim().toLowerCase();
	$: filteredUsers = users.filter((u) => {
		if (!normalizedSearch) {
			return true;
		}

		const searchable = `${u.first_name ?? ''} ${u.last_name ?? ''} ${u.email ?? ''}`.toLowerCase();
		return searchable.includes(normalizedSearch);
	});

	function setTab(tab: string) {
		activeTab = tab;
	}
</script>

{#if loading}
	<div class="min-h-screen flex items-center justify-center">
		<div class="animate-spin rounded-full h-10 w-10 border-4 border-green-500 border-t-transparent"></div>
	</div>
{:else if accessError}
	<div class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
		<div class="max-w-xl w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
			<h1 class="text-xl font-bold text-gray-900 mb-2">Acces admin indisponible</h1>
			<p class="text-sm text-gray-600 mb-4">{accessError}</p>
			<p class="text-sm text-gray-500 mb-6">Compte connecte: {currentUser?.email ?? 'non detecte'}</p>
			<div class="flex gap-3">
				<a href="/profile" class="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700">Aller au profil</a>
				<a href="/" class="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">Retour accueil</a>
			</div>
		</div>
	</div>
{:else if isAdmin}
	<div class="min-h-screen bg-gray-50">
		<!-- Admin header bar -->
		<div class="bg-white border-b border-gray-200 px-6 py-4">
			<div class="max-w-7xl mx-auto flex items-center justify-between">
				<div class="flex items-center gap-3">
					<span class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-green-100">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
						</svg>
					</span>
					<div>
						<h1 class="text-lg font-bold text-gray-900">Panneau d'administration</h1>
						<p class="text-xs text-gray-500">Accès restreint</p>
					</div>
				</div>
				<span class="text-sm text-gray-500">{currentUser?.email}</span>
			</div>
		</div>

		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
			<!-- Stats cards -->
			<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
				<div class="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
					<p class="text-sm text-gray-500 mb-1">Utilisateurs</p>
					<p class="text-3xl font-bold text-gray-900">{stats.totalUsers}</p>
				</div>
				<div class="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
					<p class="text-sm text-gray-500 mb-1">Trajets publiés</p>
					<p class="text-3xl font-bold text-gray-900">{stats.totalRides}</p>
				</div>
				<div class="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
					<p class="text-sm text-gray-500 mb-1">Réservations</p>
					<p class="text-3xl font-bold text-gray-900">{stats.totalBookings}</p>
				</div>
				<div class="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
					<p class="text-sm text-gray-500 mb-1">En attente de vérification</p>
					<p class="text-3xl font-bold {stats.pendingVerifications > 0 ? 'text-orange-500' : 'text-gray-900'}">{stats.pendingVerifications}</p>
				</div>
			</div>

			<!-- Tab navigation -->
			<div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
				<div class="flex border-b border-gray-100">
					{#each [
						{ id: 'overview', label: 'Vue d\'ensemble' },
						{ id: 'users', label: 'Utilisateurs' },
						{ id: 'rides', label: 'Trajets' },
						{ id: 'reports', label: 'Signalements' }
					] as tab}
						<button
							class="px-5 py-3 text-sm font-medium transition-colors cursor-pointer
								{activeTab === tab.id
									? 'text-green-600 border-b-2 border-green-500 bg-green-50'
									: 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}"
							on:click={() => setTab(tab.id)}
						>
							{tab.label}
						</button>
					{/each}
				</div>

				<div class="p-6">
					{#if activeTab === 'overview'}
						<p class="text-gray-500 text-sm">Bienvenue dans le panneau d'administration. Utilise les onglets ci-dessus pour gérer les utilisateurs, trajets et signalements.</p>
					{:else if activeTab === 'users'}
						<div class="space-y-4">
							<div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
								<div>
									<h2 class="text-lg font-semibold text-gray-900">Gestion des utilisateurs</h2>
									<p class="text-sm text-gray-500">Recherche par nom ou email, gestion des droits et verification.</p>
								</div>
								<div class="flex gap-2">
									<input
										type="text"
										bind:value={userSearch}
										placeholder="Rechercher un nom ou un email"
										class="w-72 max-w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
									/>
									<button
										type="button"
										on:click={loadUsers}
										class="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
									>
										Rafraichir
									</button>
								</div>
							</div>

							{#if usersActionMessage}
								<p class="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{usersActionMessage}</p>
							{/if}

							{#if usersError}
								<p class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{usersError}</p>
							{:else if usersLoading}
								<p class="text-sm text-gray-500">Chargement des utilisateurs...</p>
							{:else if filteredUsers.length === 0}
								<p class="text-sm text-gray-500">Aucun utilisateur ne correspond a la recherche.</p>
							{:else}
								<div class="overflow-x-auto border border-gray-100 rounded-xl">
									<table class="w-full text-sm">
										<thead class="bg-gray-50 text-left text-gray-600">
											<tr>
												<th class="px-4 py-3 font-medium">Utilisateur</th>
												<th class="px-4 py-3 font-medium">Statut</th>
												<th class="px-4 py-3 font-medium">Inscription</th>
												<th class="px-4 py-3 font-medium">Actions</th>
											</tr>
										</thead>
										<tbody class="divide-y divide-gray-100">
											{#each filteredUsers as adminUser}
												<tr class="hover:bg-gray-50">
													<td class="px-4 py-3 align-top">
														<p class="font-medium text-gray-900">
															{`${adminUser.first_name ?? ''} ${adminUser.last_name ?? ''}`.trim() || 'Sans nom'}
														</p>
														<p class="text-xs text-gray-500">{adminUser.email ?? 'Email non renseigne'}</p>
														<p class="text-xs text-gray-400 break-all">{adminUser.id}</p>
													</td>
													<td class="px-4 py-3 align-top">
														<div class="flex flex-wrap gap-2">
															<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium {adminUser.is_admin ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700'}">
																{adminUser.is_admin ? 'Admin' : 'Utilisateur'}
															</span>
															<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium {adminUser.is_verified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
																{adminUser.is_verified ? 'Verifie' : 'Non verifie'}
															</span>
														</div>
													</td>
													<td class="px-4 py-3 align-top text-gray-500">
														{#if adminUser.created_at}
															{new Date(adminUser.created_at).toLocaleDateString('fr-FR')}
														{:else}
															-
														{/if}
													</td>
													<td class="px-4 py-3 align-top">
														<div class="flex flex-wrap gap-2">
															<button
																type="button"
																disabled={actionUserId === adminUser.id}
																on:click={() => updateUserFlag(adminUser, 'is_admin', !adminUser.is_admin)}
																class="px-3 py-1.5 rounded-lg text-xs font-medium border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
															>
																{adminUser.is_admin ? 'Retirer admin' : 'Rendre admin'}
															</button>
															<button
																type="button"
																disabled={actionUserId === adminUser.id}
																on:click={() => updateUserFlag(adminUser, 'is_verified', !adminUser.is_verified)}
																class="px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
															>
																{adminUser.is_verified ? 'Passer non verifie' : 'Verifier'}
															</button>
														</div>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</div>
					{:else if activeTab === 'rides'}
						<p class="text-gray-400 text-sm italic">Gestion des trajets — à venir</p>
					{:else if activeTab === 'reports'}
						<p class="text-gray-400 text-sm italic">Gestion des signalements — à venir</p>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
