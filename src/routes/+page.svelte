<script lang="ts">
	import { user } from '$lib/authStore';
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { hasPendingReviewBlock } from '$lib/membershipAccess';

	let currentUser: any = null;
	let searchDeparture = '';
	let searchArrival = '';
	let searchDate = '';
	let searchSeats = 1;
	let footerBrandDescription = 'A trusted community of verified carpoolers.';
	let footerAboutUsLabel = 'About Us';
	let footerAboutUsUrl = '/about';
	let footerHowItWorksLabel = 'How it works';
	let footerHowItWorksUrl = '/how-it-works';
	let footerFaqLabel = 'FAQ';
	let footerFaqUrl = '/faq';
	let footerHelpCenterLabel = 'Help Center';
	let footerHelpCenterUrl = '/help';
	let footerPrivacyPolicyLabel = 'Privacy Policy';
	let footerPrivacyPolicyUrl = '/privacy';
	let footerTermsOfServiceLabel = 'Terms of Service';
	let footerTermsOfServiceUrl = '/terms';
	let socialFacebookUrl = 'https://www.facebook.com/HizliCarpooling';
	let socialInstagramUrl = 'https://www.instagram.com/hizli.carpooling/';
	let socialYoutubeUrl = 'https://www.youtube.com/@hizlicarpooling4265';
	user.subscribe((u) => (currentUser = u));

	function normalizeFooterHref(href: string) {
		if (!href) return '/';
		const trimmed = String(href).trim();
		if (/^https?:\/\//.test(trimmed)) return trimmed;
		if (trimmed.startsWith('/')) return trimmed;
		return `/${trimmed}`;
	}

	async function hasReviewPendingBlockForCurrentUser(): Promise<boolean> {
		if (!currentUser?.id) {
			return false;
		}

		await supabase.rpc('refresh_review_pending_for_member', { p_user_id: currentUser.id });

		const { data: profile, error } = await supabase
			.from('profiles')
			.select('status, is_verified, membership_paid, membership_expires_at, review_pending')
			.eq('id', currentUser.id)
			.maybeSingle();

		if (error || !profile) {
			return false;
		}

		return hasPendingReviewBlock({
			status: profile.status,
			isVerified: profile.is_verified,
			membershipPaid: profile.membership_paid,
			membershipExpiresAt: profile.membership_expires_at,
			reviewPending: profile.review_pending
		});
	}

	async function handlePublishClick(departure?: string, arrival?: string) {
		if (!currentUser) {
			goto('/auth/login');
			return;
		}

		if (await hasReviewPendingBlockForCurrentUser()) {
			goto('/dashboard#archive');
			return;
		}

		if (departure && arrival) {
			const params = new URLSearchParams({ departure, arrival });
			goto(`/publish-ride?${params.toString()}`);
			return;
		}

		goto('/publish-ride');
	}

	async function handleSearchSubmit() {
		if (currentUser && (await hasReviewPendingBlockForCurrentUser())) {
			goto('/dashboard#archive');
			return;
		}

		const params = new URLSearchParams();
		if (searchDeparture.trim()) {
			params.set('departure', searchDeparture.trim());
		}
		if (searchArrival.trim()) {
			params.set('arrival', searchArrival.trim());
		}
		if (searchDate) {
			params.set('date', searchDate);
		}
		if (searchSeats > 0) {
			params.set('seats', String(searchSeats));
		}

		goto(`/search${params.toString() ? `?${params.toString()}` : ''}`);
	}

	async function handlePopularRideSearch(departure: string, arrival: string) {
		if (currentUser && (await hasReviewPendingBlockForCurrentUser())) {
			goto('/dashboard#archive');
			return;
		}

		const params = new URLSearchParams();
		params.set('departure', departure);
		params.set('arrival', arrival);
		if (searchDate) {
			params.set('date', searchDate);
		}
		if (searchSeats > 0) {
			params.set('seats', String(searchSeats));
		}

		goto(`/search?${params.toString()}`);
	}

	async function handlePaidPlanGetStarted(plan: 'student' | 'standard') {
		if (!currentUser) {
			goto(`/auth/signup?plan=${plan}`);
			return;
		}

		// If a plan is already chosen and locked in, clicking any plan button
		// should never try to silently switch it — just take the member back
		// to their profile, where the real (already-saved) plan is shown.
		const { data: existingProfile } = await supabase
			.from('profiles')
			.select('membership_plan')
			.eq('id', currentUser.id)
			.maybeSingle();

		const alreadyHasPlan =
			existingProfile?.membership_plan === 'student' ||
			existingProfile?.membership_plan === 'standard';

		if (alreadyHasPlan) {
			goto('/profile#verification-documents');
			return;
		}

		goto(`/profile?plan=${plan}#verification-documents`);
	}

	onMount(async () => {
		try {
			const response = await fetch('/api/platform-settings');
			if (!response.ok) return;

			const payload = await response.json();
			const s = payload?.settings;
			if (!s) return;

			footerBrandDescription = String(s.footer_brand_description ?? footerBrandDescription);
			footerAboutUsLabel = String(s.footer_about_us_label ?? footerAboutUsLabel);
			footerAboutUsUrl = String(s.footer_about_us_url ?? footerAboutUsUrl);
			footerHowItWorksLabel = String(s.footer_how_it_works_label ?? footerHowItWorksLabel);
			footerHowItWorksUrl = String(s.footer_how_it_works_url ?? footerHowItWorksUrl);
			footerFaqLabel = String(s.footer_faq_label ?? footerFaqLabel);
			footerFaqUrl = String(s.footer_faq_url ?? footerFaqUrl);
			footerHelpCenterLabel = String(s.footer_help_center_label ?? footerHelpCenterLabel);
			footerHelpCenterUrl = String(s.footer_help_center_url ?? footerHelpCenterUrl);
			footerPrivacyPolicyLabel = String(s.footer_privacy_policy_label ?? footerPrivacyPolicyLabel);
			footerPrivacyPolicyUrl = String(s.footer_privacy_policy_url ?? footerPrivacyPolicyUrl);
			footerTermsOfServiceLabel = String(
				s.footer_terms_of_service_label ?? footerTermsOfServiceLabel
			);
			footerTermsOfServiceUrl = String(s.footer_terms_of_service_url ?? footerTermsOfServiceUrl);
			socialFacebookUrl = String(s.social_facebook_url ?? socialFacebookUrl);
			socialInstagramUrl = String(s.social_instagram_url ?? socialInstagramUrl);
			socialYoutubeUrl = String(s.social_youtube_url ?? socialYoutubeUrl);
		} catch {
			// Keep default footer content if settings endpoint fails.
		}
	});
</script>

<div class="flex min-h-screen flex-col font-sans text-gray-900">
	<!-- Hero Section -->
	<!-- Assurez-vous que votre image (ex: header-bg.jpg) est bien dans le dossier 'static' -->
	<section
		id="search"
		class="relative bg-cover bg-center px-4 py-24 text-white md:px-8 md:py-28"
		style="background-image: url('/header-bg.jpg');"
	>
		<!-- Calque sombre (overlay) pour que le texte reste lisible sur l'image -->
		<div class="absolute inset-0 bg-black/50"></div>

		<div class="relative z-10 mx-auto max-w-5xl text-center">
			<h1 class="mb-4 text-3xl font-bold tracking-tight md:text-5xl">
				Safety. Simplicity. Saving.
			</h1>
			<div class="mx-auto mb-10 max-w-2xl text-xl text-blue-100 md:text-2xl">
				<p>A trusted community of verified carpoolers.</p>
				<p>With Hizli it's easy</p>
			</div>

			<!-- Search Box -->
			<form
				on:submit|preventDefault={handleSearchSubmit}
				class="mx-auto flex w-full max-w-5xl flex-wrap gap-2 rounded-xl bg-white p-4 text-gray-900 shadow-2xl md:flex-nowrap"
			>
				<div class="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-2 hover:bg-gray-50">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-5 w-5 text-gray-400"
					>
						<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
						<circle cx="12" cy="10" r="3" />
					</svg>
					<input
						type="text"
						placeholder="Leaving from..."
						bind:value={searchDeparture}
						class="w-full min-w-0 bg-transparent focus:outline-none"
					/>
				</div>
				<div class="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-2 hover:bg-gray-50">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-5 w-5 text-gray-400"
					>
						<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
						<circle cx="12" cy="10" r="3" />
					</svg>
					<input
						type="text"
						placeholder="Going to..."
						bind:value={searchArrival}
						class="w-full min-w-0 bg-transparent focus:outline-none"
					/>
				</div>
				<div class="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-2 hover:bg-gray-50">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-5 w-5 text-gray-400"
					>
						<rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
						<line x1="16" x2="16" y1="2" y2="6" />
						<line x1="8" x2="8" y1="2" y2="6" />
						<line x1="3" x2="21" y1="10" y2="10" />
					</svg>
					<input
						type="date"
						bind:value={searchDate}
						class="w-full min-w-0 bg-transparent text-gray-500 focus:outline-none"
					/>
				</div>
				<div class="flex items-center gap-2 rounded-lg p-2 hover:bg-gray-50">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-5 w-5 text-gray-400"
					>
						<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
						<circle cx="9" cy="7" r="4" />
						<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
						<path d="M16 3.13a4 4 0 0 1 0 7.75" />
					</svg>
					<input
						type="number"
						min="1"
						bind:value={searchSeats}
						class="w-16 bg-transparent focus:outline-none"
					/>
				</div>
				<button
					type="submit"
					class="flex min-h-11 w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-5 py-2.5 font-bold text-white transition hover:opacity-90 sm:w-auto"
					style="background-color: #00B050;"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="block h-5 w-5"
					>
						<circle cx="11" cy="11" r="8" />
						<path d="m21 21-4.3-4.3" />
					</svg>
					<span class="leading-none">Search</span>
				</button>
			</form>
		</div>
	</section>

	<!-- Most Popular Rides Section -->
	<section id="popular-rides" class="bg-white px-4 py-14">
		<div class="mx-auto max-w-7xl text-center">
			<h2 class="mb-4 text-3xl font-bold text-gray-900 md:text-4xl">Most popular rides</h2>
			<p class="mx-auto mb-10 max-w-2xl text-gray-600">
				Post a trip or find a seat in our busiest travel corridors.
			</p>
			<div class="grid grid-cols-1 gap-6 text-gray-800 sm:grid-cols-2 lg:grid-cols-3">
				<div
					class="rounded-2xl border border-green-200 bg-white p-6 shadow-sm transition hover:shadow-md"
				>
					<h3
						class="mb-6 flex min-h-16 items-center justify-center text-2xl font-semibold text-gray-900"
					>
						Utah &harr; Idaho
					</h3>
					<div class="flex justify-center gap-3">
						<button
							type="button"
							on:click={() => handlePublishClick('Utah', 'Idaho')}
							class="cursor-pointer rounded-lg border border-gray-300 bg-white px-6 py-3 text-center font-bold text-gray-900 transition hover:bg-gray-100"
						>
							Post
						</button>
						<button
							type="button"
							on:click={() => handlePopularRideSearch('Utah', 'Idaho')}
							class="rounded-lg px-6 py-3 text-center font-bold text-white transition hover:opacity-90"
							style="background-color: #00B050;"
						>
							Search
						</button>
					</div>
				</div>

				<div
					class="rounded-2xl border border-green-200 bg-white p-6 shadow-sm transition hover:shadow-md"
				>
					<h3
						class="mb-6 flex min-h-16 items-center justify-center text-2xl font-semibold text-gray-900"
					>
						Utah &harr; California
					</h3>
					<div class="flex justify-center gap-3">
						<button
							type="button"
							on:click={() => handlePublishClick('Utah', 'California')}
							class="cursor-pointer rounded-lg border border-gray-300 bg-white px-6 py-3 text-center font-bold text-gray-900 transition hover:bg-gray-100"
						>
							Post
						</button>
						<button
							type="button"
							on:click={() => handlePopularRideSearch('Utah', 'California')}
							class="rounded-lg px-6 py-3 text-center font-bold text-white transition hover:opacity-90"
							style="background-color: #00B050;"
						>
							Search
						</button>
					</div>
				</div>

				<div
					class="rounded-2xl border border-green-200 bg-white p-6 shadow-sm transition hover:shadow-md"
				>
					<h3
						class="mb-6 flex min-h-16 items-center justify-center text-2xl font-semibold text-gray-900"
					>
						Utah &harr; Nevada
					</h3>
					<div class="flex justify-center gap-3">
						<button
							type="button"
							on:click={() => handlePublishClick('Utah', 'Nevada')}
							class="cursor-pointer rounded-lg border border-gray-300 bg-white px-6 py-3 text-center font-bold text-gray-900 transition hover:bg-gray-100"
						>
							Post
						</button>
						<button
							type="button"
							on:click={() => handlePopularRideSearch('Utah', 'Nevada')}
							class="rounded-lg px-6 py-3 text-center font-bold text-white transition hover:opacity-90"
							style="background-color: #00B050;"
						>
							Search
						</button>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Features Section -->
	<section id="features" class="bg-white py-20">
		<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
			<div class="mb-16 text-center">
				<h2 class="mb-4 text-3xl font-bold text-gray-900 md:text-4xl">Why choose Hizli?</h2>
				<p class="text-xl text-gray-600">
					We prioritize your safety and convenience above all else.
				</p>
			</div>

			<div class="grid grid-cols-2 gap-4 md:gap-6 xl:grid-cols-5">
				<div class="rounded-2xl border border-green-100 bg-white p-5 text-center shadow-sm">
					<div
						class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-2xl"
						style="background-color: #e8f7ee;"
					>
						♀️
					</div>
					<h3 class="mb-2 text-lg font-semibold">Girls Only</h3>
					<p class="text-sm text-gray-600">
						Female drivers can offer rides exclusively to verified women.
					</p>
				</div>

				<div class="rounded-2xl border border-green-100 bg-white p-5 text-center shadow-sm">
					<div
						class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-2xl"
						style="background-color: #e8f7ee;"
					>
						🛡️
					</div>
					<h3 class="mb-2 text-lg font-semibold">Legality</h3>
					<p class="text-sm text-gray-600">
						Verified profiles and manual validation for every driver.
					</p>
				</div>

				<div class="rounded-2xl border border-green-100 bg-white p-5 text-center shadow-sm">
					<div
						class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-2xl"
						style="background-color: #e8f7ee;"
					>
						⭐
					</div>
					<h3 class="mb-2 text-lg font-semibold">Personality</h3>
					<p class="text-sm text-gray-600">Real reviews from real verified riders, every trip.</p>
				</div>

				<div class="rounded-2xl border border-green-100 bg-white p-5 text-center shadow-sm">
					<div
						class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-2xl"
						style="background-color: #e8f7ee;"
					>
						🆘
					</div>
					<h3 class="mb-2 text-lg font-semibold">Support</h3>
					<p class="text-sm text-gray-600">
						Every report reviewed, bad actors removed from the community.
					</p>
				</div>

				<div
					class="col-span-2 rounded-2xl border border-green-100 bg-white p-5 text-center shadow-sm xl:col-span-1"
				>
					<div
						class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-2xl"
						style="background-color: #e8f7ee;"
					>
						💰
					</div>
					<h3 class="mb-2 text-lg font-semibold">Price</h3>
					<p class="text-sm text-gray-600">Share the ride, share the cost. No hidden fees.</p>
				</div>
			</div>

			<div class="mt-10 text-center">
				<a
					href="/why-hizli"
					class="inline-flex items-center justify-center rounded-lg px-7 py-3 font-bold text-white transition hover:opacity-90"
					style="background-color: #00B050;"
				>
					Learn more
				</a>
			</div>
		</div>
	</section>

	<!-- Plans & Pricing Section -->
	<section id="plans-pricing" class="bg-gray-50 py-16">
		<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
			<div class="mb-10 text-center">
				<h2 class="mb-4 text-3xl font-bold text-gray-900 md:text-4xl">Choose your plan</h2>
				<p class="text-xl text-gray-600">Join Hizli and travel with peace of mind.</p>
			</div>

			<div class="grid items-stretch gap-5 lg:grid-cols-3">
				<div
					class="flex flex-col rounded-2xl border border-gray-200/90 bg-white p-5 shadow-[0_6px_18px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(15,23,42,0.1)]"
				>
					<h3 class="mb-1 text-lg font-semibold tracking-tight text-gray-900">Free</h3>
					<p class="mb-4 text-2xl font-medium tracking-tight text-gray-900">
						$0 <span class="text-sm font-normal text-gray-500">forever</span>
					</p>
					<div class="flex flex-1 flex-col border-t border-gray-100 pt-4">
						<ul class="space-y-2.5 text-sm text-gray-700">
							<li class="flex items-start gap-2">
								<span class="leading-6 font-semibold" style="color: #00B050;">&#10003;</span>
								<span>Search and post rides</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="leading-6 font-semibold" style="color: #FF6B6B;">&#10007;</span>
								<span>No access to verified members</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="leading-6 font-semibold" style="color: #FF6B6B;">&#10007;</span>
								<span>No reviews visible</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="leading-6 font-semibold" style="color: #FF6B6B;">&#10007;</span>
								<span>No Girls Only rides</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="leading-6 font-semibold" style="color: #FF6B6B;">&#10007;</span>
								<span>No support if something goes wrong</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="leading-6 font-semibold" style="color: #FF6B6B;">&#10007;</span>
								<span>You don't know who's in that car</span>
							</li>
						</ul>
					</div>
				</div>

				<div
					class="relative flex flex-col rounded-2xl border bg-white p-5 shadow-[0_14px_34px_rgba(0,176,80,0.16)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(0,176,80,0.22)] lg:-my-2"
					style="border-color: rgba(0, 176, 80, 0.3);"
				>
					<div class="absolute -top-2 left-1/2 -translate-x-1/2">
						<span
							class="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase"
							style="background-color: #ffffff; color: #00B050; border-color: rgba(0, 176, 80, 0.35);"
						>
							Most Popular
						</span>
					</div>
					<h3 class="mb-1 text-lg font-semibold tracking-tight text-gray-900">Student Plan ⭐</h3>
					<p class="mb-4 text-2xl font-medium tracking-tight text-gray-900">
						$25 <span class="text-sm font-normal text-gray-500">/year</span>
					</p>
					<div class="flex flex-1 flex-col border-t border-gray-100 pt-4">
						<ul class="space-y-2.5 text-sm text-gray-700">
							<li class="flex items-start gap-2">
								<span class="leading-6 font-semibold" style="color: #00B050;">&#10003;</span>
								<span>Everything in Free</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="leading-6 font-semibold" style="color: #00B050;">&#10003;</span>
								<span>Ride only with verified members</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="leading-6 font-semibold" style="color: #00B050;">&#10003;</span>
								<span>Driver's license & insurance checked</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="leading-6 font-semibold" style="color: #00B050;">&#10003;</span>
								<span>Real reviews from real riders</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="leading-6 font-semibold" style="color: #00B050;">&#10003;</span>
								<span>Girls Only rides for verified women</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="leading-6 font-semibold" style="color: #00B050;">&#10003;</span>
								<span>Report issues, bad actors removed</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="leading-6 font-semibold" style="color: #00B050;">&#10003;</span>
								<span>Verified badge on your profile</span>
							</li>
						</ul>
						<p class="mt-4 text-sm text-gray-500 italic">Less than $2.10/month</p>
					</div>
					<button
						type="button"
						on:click={() => handlePaidPlanGetStarted('student')}
						class="mt-auto inline-flex w-full items-center justify-center rounded-lg px-5 py-2.5 font-semibold text-white transition hover:opacity-90 hover:shadow-[0_8px_16px_rgba(0,176,80,0.24)]"
						style="background-color: #00B050;"
					>
						Get started
					</button>
				</div>

				<div
					class="flex flex-col rounded-2xl border border-gray-200/90 bg-white p-5 shadow-[0_6px_18px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(15,23,42,0.1)]"
				>
					<h3 class="mb-1 text-lg font-semibold tracking-tight text-gray-900">Standard Plan</h3>
					<p class="mb-4 text-2xl font-medium tracking-tight text-gray-900">
						$35 <span class="text-sm font-normal text-gray-500">/year</span>
					</p>
					<div class="flex flex-1 flex-col border-t border-gray-100 pt-4">
						<ul class="space-y-2.5 text-sm text-gray-700">
							<li class="flex items-start gap-2">
								<span class="leading-6 font-semibold" style="color: #00B050;">&#10003;</span>
								<span>Same features as Student Plan</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="leading-6 font-semibold" style="color: #00B050;">&#10003;</span>
								<span>For non-student members</span>
							</li>
						</ul>
						<p class="mt-4 text-sm text-gray-500 italic">Less than $3/month</p>
					</div>
					<button
						type="button"
						on:click={() => handlePaidPlanGetStarted('standard')}
						class="mt-auto inline-flex w-full items-center justify-center rounded-lg px-5 py-2.5 font-semibold text-white transition hover:opacity-90 hover:shadow-[0_8px_16px_rgba(0,176,80,0.24)]"
						style="background-color: #00B050;"
					>
						Get started
					</button>
				</div>
			</div>
		</div>
	</section>

	<!-- How It Works Section -->
	<section id="how-it-works" class="bg-gray-50 pt-10 pb-20">
		<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
			<div class="mb-16 text-center">
				<h2 class="mb-4 text-3xl font-bold text-gray-900 md:text-4xl">How it works</h2>
				<p class="text-xl text-gray-600">A simple three-step flow to get you moving faster.</p>
			</div>

			<div class="grid grid-cols-1 gap-6 text-center lg:grid-cols-3">
				<div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
					<div
						class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full"
						style="background-color: rgba(0, 176, 80, 0.10);"
					>
						<img src="/sign%20up.svg" alt="Sign up icon" class="h-9 w-9 object-contain" />
					</div>
					<h3 class="mb-2 text-xl font-semibold text-gray-900">Sign up for free</h3>
					<p class="text-gray-600">
						Create your account in seconds and start browsing rides right away.
					</p>
				</div>

				<div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
					<div
						class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full"
						style="background-color: rgba(0, 176, 80, 0.10);"
					>
						<img src="/Car.svg" alt="Car icon" class="h-9 w-9 object-contain" />
					</div>
					<h3 class="mb-2 text-xl font-semibold text-gray-900">Book or post a ride</h3>
					<p class="text-gray-600">
						Find a ride that fits your schedule or share your journey with others.
					</p>
				</div>

				<div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
					<div
						class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full"
						style="background-color: rgba(0, 176, 80, 0.10);"
					>
						<img src="/Road.svg" alt="Road icon" class="h-9 w-9 object-contain" />
					</div>
					<h3 class="mb-2 text-xl font-semibold text-gray-900">Meet &amp; travel</h3>
					<p class="text-gray-600">
						Meet your travel companion at the pickup point and pay directly — simple and
						hassle-free.
					</p>
				</div>
			</div>

			<div class="mt-10 text-center">
				<a
					href="/how-it-works"
					class="inline-flex items-center justify-center rounded-lg px-6 py-3 font-semibold text-white transition hover:opacity-90 hover:shadow-[0_8px_16px_rgba(0,176,80,0.24)]"
					style="background-color: #00B050;"
				>
					Learn how it works in detail
				</a>
			</div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="mt-auto py-12 text-white" style="background-color: #2BB573;">
		<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
			<div class="mb-8 grid grid-cols-1 items-start gap-8 sm:grid-cols-2 lg:grid-cols-5">
				<!-- Brand -->
				<div class="col-span-1 md:col-span-1">
					<div class="mb-4 flex items-center gap-2">
						<img
							src="/logo.png"
							alt="Hizli Logo"
							class="footer-logo-contrast h-12 w-auto object-contain"
						/>
						<span class="text-xl font-bold">Hizli</span>
					</div>
					<p class="text-sm text-gray-50">
						{footerBrandDescription}
					</p>
				</div>

				<!-- About -->
				<div>
					<h4 class="mb-4 text-lg font-bold">About</h4>
					<ul class="space-y-2 text-gray-50">
						<li>
							<a href={normalizeFooterHref(footerAboutUsUrl)} class="transition hover:text-white"
								>{footerAboutUsLabel}</a
							>
						</li>
						<li>
							<a href={normalizeFooterHref(footerHowItWorksUrl)} class="transition hover:text-white"
								>{footerHowItWorksLabel}</a
							>
						</li>
					</ul>
				</div>

				<!-- Support -->
				<div>
					<h4 class="mb-4 text-lg font-bold">Support</h4>
					<ul class="space-y-2 text-gray-50">
						<li>
							<a href={normalizeFooterHref(footerFaqUrl)} class="transition hover:text-white"
								>{footerFaqLabel}</a
							>
						</li>
						<li>
							<a href={normalizeFooterHref(footerHelpCenterUrl)} class="transition hover:text-white"
								>{footerHelpCenterLabel}</a
							>
						</li>
					</ul>
				</div>

				<!-- Legal -->
				<div>
					<h4 class="mb-4 text-lg font-bold">Legal</h4>
					<ul class="space-y-2 text-gray-50">
						<li>
							<a
								href={normalizeFooterHref(footerPrivacyPolicyUrl)}
								class="transition hover:text-white">{footerPrivacyPolicyLabel}</a
							>
						</li>
						<li>
							<a
								href={normalizeFooterHref(footerTermsOfServiceUrl)}
								class="transition hover:text-white">{footerTermsOfServiceLabel}</a
							>
						</li>
					</ul>
				</div>

				<!-- Socials -->
				<div>
					<h4 class="mb-4 text-lg font-bold">Follow Us</h4>
					<div class="flex space-x-4">
						<a
							href={socialFacebookUrl}
							class="text-gray-50 transition hover:text-white"
							target="_blank"
							rel="noreferrer"
						>
							<span class="sr-only">Facebook</span>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="lucide lucide-facebook"
								><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg
							>
						</a>
						<a
							href={socialInstagramUrl}
							class="text-gray-50 transition hover:text-white"
							target="_blank"
							rel="noreferrer"
						>
							<span class="sr-only">Instagram</span>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="lucide lucide-instagram"
								><rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path
									d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"
								/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" /></svg
							>
						</a>
						<a
							href={socialYoutubeUrl}
							class="text-gray-50 transition hover:text-white"
							target="_blank"
							rel="noreferrer"
						>
							<span class="sr-only">YouTube</span>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="lucide lucide-youtube"
								><path
									d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"
								/><path d="m10 15 5-3-5-3z" /></svg
							>
						</a>
					</div>
				</div>
			</div>

			<div class="border-t border-white/20 pt-8 text-center">
				<p class="text-gray-50">
					&copy; {new Date().getFullYear()} Hizli Carpooling. All rights reserved.
				</p>
			</div>
		</div>
	</footer>
</div>

<style>
	.footer-logo-contrast {
		/* Makes the green accent readable on the green footer background. */
		filter: brightness(0) invert(1);
	}
</style>
