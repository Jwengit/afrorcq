<script lang="ts">
	let { data } = $props();
</script>

<section class="min-h-screen bg-gray-50 py-14 px-4 sm:px-6 lg:px-8">
	<div class="max-w-4xl mx-auto bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
		<h1 class="text-3xl font-bold text-gray-900">{data.title}</h1>
		<p class="mt-4 text-gray-700 whitespace-pre-line leading-7">{data.content}</p>
	</div>
</section>
