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
		has_profile?: boolean;
	};

	let usersLoading = false;
	let usersError = '';
	let usersActionMessage = '';
	let userSearch = '';
	let users: AdminUser[] = [];
	let actionUserId: string | null = null;
	let statsError = '';

	// Dashboard overview stats
	let stats = {
		totalUsers: 0,
		activeRides: 0,
		completedRides: 0,
		reservationsInProgress: 0,
		revenue: {
			hasPaymentIntegration: false,
			estimatedRevenue: 0
		},
		alerts: {
			total: 0,
			reports: 0,
			accountsToVerify: 0
		}
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
		statsError = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			statsError = 'Session expirée. Merci de te reconnecter.';
			return;
		}

		const response = await fetch('/api/admin/overview', {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${session.access_token}`
			}
		});

		const payload = await response.json();
		if (!response.ok) {
			statsError = payload?.error || 'Impossible de charger le tableau de bord.';
			return;
		}

		if (payload?.stats) {
			stats = payload.stats;
		}
	}

	async function loadUsers() {
		usersLoading = true;
		usersError = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			usersError = 'Session expirée. Merci de te reconnecter.';
			users = [];
			usersLoading = false;
			return;
		}

		const response = await fetch('/api/admin/users', {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${session.access_token}`
			}
		});

		const payload = await response.json();
		if (!response.ok) {
			usersError = payload?.error || "Impossible de charger les utilisateurs pour le moment.";
			users = [];
			usersLoading = false;
			return;
		}

		users = ((payload?.users ?? []) as AdminUser[]).sort((a, b) => {
			const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
			const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
			return bDate - aDate;
		});
		usersLoading = false;
	}

	async function updateUserFlag(targetUser: AdminUser, field: 'is_admin' | 'is_verified', value: boolean) {
		actionUserId = targetUser.id;
		usersActionMessage = '';

		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session?.access_token) {
			usersActionMessage = 'Session expirée. Merci de te reconnecter.';
			actionUserId = null;
			return;
		}

		const response = await fetch('/api/admin/users', {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${session.access_token}`
			},
			body: JSON.stringify({
				userId: targetUser.id,
				field,
				value,
				email: targetUser.email,
				firstName: targetUser.first_name,
				lastName: targetUser.last_name
			})
		});

		const payload = await response.json();
		if (!response.ok) {
			usersActionMessage =
				payload?.error ||
				"Action impossible pour le moment. Verifie que ton compte a bien le role admin dans profiles.";
			actionUserId = null;
			return;
		}

		users = users.map((u) =>
			u.id === targetUser.id ? { ...u, [field]: value, has_profile: true } : u
		);
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

		const searchable = `${u.first_name ?? ''} ${u.last_name ?? ''} ${u.email ?? ''} ${u.id}`.toLowerCase();
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
			{#if statsError}
				<div class="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					{statsError}
				</div>
			{/if}

			<!-- Stats cards -->
			<div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
				<!-- Utilisateurs -->
				<div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
					<div class="shrink-0 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
					</div>
					<div>
						<p class="text-xs text-gray-500">Utilisateurs</p>
						<p class="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
					</div>
				</div>
				<!-- Trajets actifs -->
				<div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
					<div class="shrink-0 w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
					</div>
					<div>
						<p class="text-xs text-gray-500">Trajets actifs</p>
						<p class="text-2xl font-bold text-gray-900">{stats.activeRides}</p>
					</div>
				</div>
				<!-- Trajets terminés -->
				<div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
					<div class="shrink-0 w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<div>
						<p class="text-xs text-gray-500">Terminés</p>
						<p class="text-2xl font-bold text-gray-900">{stats.completedRides}</p>
					</div>
				</div>
				<!-- Réservations -->
				<div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
					<div class="shrink-0 w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
						</svg>
					</div>
					<div>
						<p class="text-xs text-gray-500">Réservations</p>
						<p class="text-2xl font-bold text-gray-900">{stats.reservationsInProgress}</p>
					</div>
				</div>
				<!-- Alertes -->
				<div class="bg-white rounded-xl border p-4 shadow-sm flex items-center gap-3 {stats.alerts.total > 0 ? 'border-orange-200' : 'border-gray-100'}">
					<div class="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center {stats.alerts.total > 0 ? 'bg-orange-50' : 'bg-gray-100'}">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 {stats.alerts.total > 0 ? 'text-orange-500' : 'text-gray-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
						</svg>
					</div>
					<div>
						<p class="text-xs text-gray-500">Alertes</p>
						<p class="text-2xl font-bold {stats.alerts.total > 0 ? 'text-orange-500' : 'text-gray-900'}">{stats.alerts.total}</p>
					</div>
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
						<div class="space-y-6">
							<!-- Titre section -->
							<div>
								<h2 class="text-base font-semibold text-gray-900">Aperçu de la plateforme</h2>
								<p class="text-sm text-gray-500 mt-0.5">Indicateurs clés en temps réel.</p>
							</div>

							<!-- Trajets -->
							<div>
								<h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Trajets</h3>
								<div class="grid md:grid-cols-2 gap-4">
									<div class="rounded-xl border border-green-200 bg-green-50 p-5">
										<div class="flex items-center justify-between mb-2">
											<p class="text-sm font-semibold text-green-800">Trajets actifs</p>
											<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">{stats.activeRides}</span>
										</div>
										<p class="text-xs text-green-700 mb-3">Date de départ à venir — disponibles à la réservation.</p>
										{#if stats.activeRides + stats.completedRides > 0}
											<div>
												<div class="flex justify-between text-xs text-green-700 mb-1">
													<span>Part des actifs</span>
													<span>{Math.round(stats.activeRides / (stats.activeRides + stats.completedRides) * 100)} %</span>
												</div>
												<div class="w-full bg-green-200 rounded-full h-1.5">
													<div class="bg-green-500 h-1.5 rounded-full transition-all" style="width: {Math.round(stats.activeRides / (stats.activeRides + stats.completedRides) * 100)}%"></div>
												</div>
											</div>
										{/if}
									</div>
									<div class="rounded-xl border border-gray-200 bg-gray-50 p-5">
										<div class="flex items-center justify-between mb-2">
											<p class="text-sm font-semibold text-gray-700">Trajets terminés</p>
											<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-200 text-gray-600">{stats.completedRides}</span>
										</div>
										<p class="text-xs text-gray-500 mb-1">Date de départ passée.</p>
										<p class="text-xs text-gray-500">
											Total créés : <span class="font-semibold text-gray-700">{stats.activeRides + stats.completedRides}</span>
										</p>
									</div>
								</div>
							</div>

							<!-- Réservations + Revenus -->
							<div class="grid md:grid-cols-2 gap-4">
								<div class="rounded-xl border border-purple-200 bg-purple-50 p-5">
									<div class="flex items-center justify-between mb-2">
										<p class="text-sm font-semibold text-purple-800">Réservations en cours</p>
										<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">{stats.reservationsInProgress}</span>
									</div>
									<p class="text-xs text-purple-700">Statut <strong>En attente</strong> ou <strong>Confirmée</strong> — départ pas encore effectué.</p>
								</div>
								<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
									<div class="flex items-center justify-between mb-2">
										<p class="text-sm font-semibold text-emerald-800">Revenus estimés</p>
										{#if stats.revenue.hasPaymentIntegration}
											<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-200 text-emerald-700">Intégré</span>
										{:else}
											<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Estimation</span>
										{/if}
									</div>
									<p class="text-2xl font-bold text-emerald-700">
										{stats.revenue.estimatedRevenue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
									</p>
									{#if !stats.revenue.hasPaymentIntegration}
										<p class="text-xs text-emerald-700 mt-1">Calculé sur les réservations confirmées (prix × sièges). Paiements non intégrés.</p>
									{/if}
								</div>
							</div>

							<!-- Alertes -->
							<div>
								<h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Alertes</h3>
								<div class="grid md:grid-cols-2 gap-4">
									<div class="rounded-xl border p-5 {stats.alerts.reports > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}">
										<div class="flex items-center justify-between mb-2">
											<p class="text-sm font-semibold {stats.alerts.reports > 0 ? 'text-red-800' : 'text-gray-600'}">Signalements</p>
											<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold {stats.alerts.reports > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'}">{stats.alerts.reports}</span>
										</div>
										{#if stats.alerts.reports === 0}
											<p class="text-xs text-gray-500">Aucun signalement en attente.</p>
										{:else}
											<p class="text-xs text-red-700 mb-2">Des signalements nécessitent une action.</p>
											<button type="button" on:click={() => setTab('reports')} class="text-xs font-medium text-red-700 underline hover:text-red-900 cursor-pointer">
												Voir les signalements →
											</button>
										{/if}
									</div>
									<div class="rounded-xl border p-5 {stats.alerts.accountsToVerify > 0 ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-gray-50'}">
										<div class="flex items-center justify-between mb-2">
											<p class="text-sm font-semibold {stats.alerts.accountsToVerify > 0 ? 'text-orange-800' : 'text-gray-600'}">Comptes à vérifier</p>
											<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold {stats.alerts.accountsToVerify > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'}">{stats.alerts.accountsToVerify}</span>
										</div>
										{#if stats.alerts.accountsToVerify === 0}
											<p class="text-xs text-gray-500">Tous les comptes sont vérifiés.</p>
										{:else}
											<p class="text-xs text-orange-700 mb-2">Profils non vérifiés ou sans entrée dans la table profiles.</p>
											<button type="button" on:click={() => setTab('users')} class="text-xs font-medium text-orange-700 underline hover:text-orange-900 cursor-pointer">
												Voir les utilisateurs →
											</button>
										{/if}
									</div>
								</div>
							</div>
						</div>
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
														{#if adminUser.has_profile === false}
															<p class="text-xs text-amber-600">Profil manquant dans profiles (compte auth detecte)</p>
														{/if}
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
