<script>
	let isMenuOpen = false;

	function toggleMenu() {
		isMenuOpen = !isMenuOpen;
	}
</script>

<div class="min-h-screen flex flex-col font-sans text-gray-900">
	<!-- Navbar -->
	<nav class="bg-white shadow-sm sticky top-0 z-50">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex items-center justify-between h-24">
				<div class="flex items-center">
					<a href="/" class="flex items-center gap-3 font-bold" style="color: #2BB573; margin-left: -1cm;">
						<!-- Logo: Assurez-vous d'avoir un fichier "Logo sans phrase.png" dans le dossier 'static' -->
						<img src="/Logo sans phrase.png" alt="Hizli Logo" class="h-20 w-auto object-contain" />
					</a>
				</div>

				<!-- Desktop Menu -->
				<div class="hidden md:flex items-center space-x-8">
					<a href="#publish" class="transition font-medium" style="color: #2BB573;"
						>Publish a ride</a
					>
					<a href="/login" class="p-2 rounded-full hover:bg-gray-100">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-600">
							<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
							<circle cx="12" cy="7" r="4"/>
						</svg>
					</a>
				</div>

				<!-- Mobile Menu Button -->
				<div class="md:hidden flex items-center">
					<button on:click={toggleMenu} class="text-gray-600 hover:text-gray-900 focus:outline-none">
						<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							{#if isMenuOpen}
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M6 18L18 6M6 6l12 12"
								/>
							{:else}
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M4 6h16M4 12h16M4 18h16"
								/>
							{/if}
						</svg>
					</button>
				</div>
			</div>
		</div>

		<!-- Mobile Menu -->
		{#if isMenuOpen}
			<div class="md:hidden bg-white border-t">
				<div class="px-2 pt-2 pb-3 space-y-1 sm:px-3">
					<a
						href="#publish"
						class="block px-3 py-2 rounded-md hover:bg-gray-50" style="color: #2BB573;"
						>Publish a ride</a
					>
					<a
						href="/login"
						class="block px-3 py-2 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-md"
						>Login / Sign Up</a
					>
				</div>
			</div>
		{/if}
	</nav>

	<!-- Hero Section -->
	<!-- Assurez-vous que votre image (ex: header-bg.jpg) est bien dans le dossier 'static' -->
	<section id="search" class="relative text-white py-20 px-4 md:px-8 bg-cover bg-center" style="background-image: url('/header-bg.jpg');">
		<!-- Calque sombre (overlay) pour que le texte reste lisible sur l'image -->
		<div class="absolute inset-0 bg-black/50"></div>
		
		<div class="relative max-w-4xl mx-auto text-center z-10">
			<h1 class="text-5xl md:text-7xl font-bold mb-4 tracking-tight">
				Safety. Simplicity. Saving.
			</h1>
			<div class="text-xl md:text-2xl mb-10 text-blue-100 max-w-2xl mx-auto">
				<p>The long-distance carpooling platform designed for trust.</p>
				<p>With Hizli it's easy</p>
			</div>

			<!-- Search Box -->
			<div
				class="bg-white p-4 rounded-xl shadow-2xl w-full flex flex-col lg:flex-row gap-2 text-gray-900"
			>
				<div class="flex-1 flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400">
						<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
						<circle cx="12" cy="10" r="3"/>
					</svg>
					<input
						type="text"
						placeholder="Leaving from..."
						class="w-full bg-transparent focus:outline-none"
					/>
				</div>
				<div class="flex-1 flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400">
						<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
						<circle cx="12" cy="10" r="3"/>
					</svg>
					<input
						type="text"
						placeholder="Going to..."
						class="w-full bg-transparent focus:outline-none"
					/>
				</div>
				<div class="flex-1 flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50">
					<input type="date" class="w-full bg-transparent focus:outline-none text-gray-500" />
				</div>
				<div class="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400">
						<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
						<circle cx="9" cy="7" r="4"/>
						<path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
						<path d="M16 3.13a4 4 0 0 1 0 7.75"/>
					</svg>
					<input
						type="number"
						min="1"
						value="1"
						class="w-16 bg-transparent focus:outline-none"
					/>
				</div>
				<button
					class="text-white px-8 py-3 rounded-lg font-bold hover:opacity-90 transition flex items-center justify-center gap-2"
					style="background-color: #2BB573;"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
						<circle cx="11" cy="11" r="8"/>
						<path d="m21 21-4.3-4.3"/>
					</svg>
					<span>Search</span>
				</button>
			</div>
		</div>
	</section>

	<!-- Features Section -->
	<section id="features" class="py-20 bg-white">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="text-center mb-16">
				<h2 class="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Why choose Hizli?</h2>
				<p class="text-xl text-gray-600">We prioritize your safety and convenience above all else.</p>
			</div>

			<div class="grid md:grid-cols-3 gap-8">
				<!-- Feature 1: Safety -->
				<div class="p-6 text-center">
					<div
						class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 mx-auto text-primary"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
						</svg>
					</div>
					<h3 class="text-xl font-semibold mb-2">Safety First</h3>
					<p class="text-gray-600">
						Verified profiles and manual validation for drivers. We focus on creating a secure
						community for everyone.
					</p>
				</div>

				<!-- Feature 2: Girls Only -->
				<div class="p-6 text-center">
					<div
						class="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center mb-4 mx-auto text-secondary"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5 4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
						</svg>
					</div>
					<h3 class="text-xl font-semibold mb-2">Girls Only Option</h3>
					<p class="text-gray-600">
						A unique feature allowing female drivers to offer rides exclusively to female passengers for
						added peace of mind.
					</p>
				</div>

				<!-- Feature 3: Saving -->
				<div class="p-6 text-center">
					<div
						class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 mx-auto text-green-600"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="12" x2="12" y1="2" y2="22"/>
							<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
						</svg>
					</div>
					<h3 class="text-xl font-semibold mb-2">Save Money</h3>
					<p class="text-gray-600">
						Cut travel costs by sharing the ride. Transparent pricing with no hidden fees for a
						simple, saving-focused experience.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- How it works / CTA -->
	<section id="publish" class="py-20 px-4 bg-gray-50">
		<div class="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
			<div>
				<h2 class="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
					Simple, Fluid, Reliable.
				</h2>
				<p class="text-lg text-gray-600 mb-8">
					Whether you're driving or riding, Hizli makes long-distance travel easy. No complex
					logic, just direct connections.
				</p>
				<div class="flex flex-col sm:flex-row gap-4">
					<a
						href="/publish"
						class="bg-primary text-white px-8 py-4 rounded-lg font-bold text-center hover:bg-blue-600 transition"
					>
						Publish a Ride
					</a>
					<a
						href="#search"
						class="bg-white text-gray-900 border border-gray-300 px-8 py-4 rounded-lg font-bold text-center hover:bg-gray-100 transition"
					>
						Find a Ride
					</a>
				</div>
			</div>
			<div class="bg-white p-8 rounded-2xl shadow-lg space-y-6">
				<div class="flex items-center gap-4">
					<div
						class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-primary"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="11" cy="11" r="8"/>
							<path d="m21 21-4.3-4.3"/>
						</svg>
					</div>
					<div>
						<h4 class="font-bold text-lg">1. Search for a ride</h4>
						<p class="text-sm text-gray-500">Find the perfect ride for your destination.</p>
					</div>
				</div>
				<div class="flex items-center gap-4">
					<div
						class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-primary"
					>
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
							class="lucide lucide-check-circle"
							><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg
						>
					</div>
					<div>
						<h4 class="font-bold text-lg">2. Book your seat</h4>
						<p class="text-sm text-gray-500">Reserve and pay securely on the platform.</p>
					</div>
				</div>
				<div class="flex items-center gap-4">
					<div
						class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-primary"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
							<circle cx="7" cy="17" r="2"/>
							<path d="M9 17h6"/>
							<circle cx="17" cy="17" r="2"/>
						</svg>
					</div>
					<div>
						<h4 class="font-bold text-lg">3. Travel together</h4>
						<p class="text-sm text-gray-500">Meet your driver and enjoy the ride.</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="text-white py-12 mt-auto" style="background-color: #2BB573;">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="grid md:grid-cols-4 gap-8 mb-8">
				<!-- Brand -->
				<div class="col-span-1 md:col-span-1">
					<div class="flex items-center gap-2 mb-4">
						<img src="/logo.png" alt="Hizli Logo" class="h-12 w-auto object-contain" />
						<span class="text-xl font-bold">Hizli</span>
					</div>
					<p class="text-gray-50 text-sm">
						Safety. Simplicity. Saving. The long-distance carpooling platform designed for trust.
					</p>
				</div>

				<!-- About -->
				<div>
					<h4 class="text-lg font-bold mb-4">About</h4>
					<ul class="space-y-2 text-gray-50">
						<li><a href="/about" class="hover:text-white transition">About Us</a></li>
						<li><a href="/how-it-works" class="hover:text-white transition">How it works</a></li>
					</ul>
				</div>

				<!-- Support -->
				<div>
					<h4 class="text-lg font-bold mb-4">Support</h4>
					<ul class="space-y-2 text-gray-50">
						<li><a href="/faq" class="hover:text-white transition">FAQ</a></li>
						<li><a href="/help" class="hover:text-white transition">Help Center</a></li>
						<li><a href="/contact" class="hover:text-white transition">Contact</a></li>
					</ul>
				</div>

				<!-- Legal -->
				<div>
					<h4 class="text-lg font-bold mb-4">Legal</h4>
					<ul class="space-y-2 text-gray-50">
						<li><a href="/privacy" class="hover:text-white transition">Privacy Policy</a></li>
						<li><a href="/terms" class="hover:text-white transition">Terms of Service</a></li>
					</ul>
				</div>
			</div>
			
			<div class="border-t border-white/20 pt-8 text-center">
				<p class="text-gray-50">&copy; {new Date().getFullYear()} Hizli Carpooling. All rights reserved.</p>
			</div>
		</div>
	</footer>
</div>
