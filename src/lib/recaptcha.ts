const RECAPTCHA_SCRIPT_SRC = 'https://www.google.com/recaptcha/api.js?render=explicit';

type RecaptchaApi = {
	ready: (callback: () => void) => void;
	render: (container: HTMLElement, params: Record<string, unknown>) => number;
	reset: (widgetId?: number) => void;
};

declare global {
	interface Window {
		grecaptcha?: RecaptchaApi;
		__recaptchaScriptPromise?: Promise<RecaptchaApi>;
	}
}

function getExistingScript() {
	return document.querySelector(
		'script[src^="https://www.google.com/recaptcha/api.js"]'
	) as HTMLScriptElement | null;
}

export function loadRecaptchaScript() {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('reCAPTCHA can only load in the browser'));
	}

	if (window.grecaptcha) {
		return Promise.resolve(window.grecaptcha);
	}

	if (window.__recaptchaScriptPromise) {
		return window.__recaptchaScriptPromise;
	}

	window.__recaptchaScriptPromise = new Promise<RecaptchaApi>((resolve, reject) => {
		const waitForApi = (attempt = 0) => {
			if (window.grecaptcha) {
				resolveWhenReady();
				return;
			}

			if (attempt >= 100) {
				window.__recaptchaScriptPromise = undefined;
				reject(new Error('Timed out waiting for reCAPTCHA to become available'));
				return;
			}

			window.setTimeout(() => waitForApi(attempt + 1), 50);
		};

		const resolveWhenReady = () => {
			if (!window.grecaptcha) {
				reject(new Error('reCAPTCHA loaded but grecaptcha is unavailable'));
				window.__recaptchaScriptPromise = undefined;
				return;
			}

			window.grecaptcha.ready(() => resolve(window.grecaptcha!));
		};

		const existingScript = getExistingScript();

		if (existingScript) {
			if (window.grecaptcha) {
				resolveWhenReady();
				return;
			}

			existingScript.addEventListener(
				'load',
				() => {
					existingScript.dataset.loaded = 'true';
					resolveWhenReady();
				},
				{ once: true }
			);
			existingScript.addEventListener(
				'error',
				() => {
					window.__recaptchaScriptPromise = undefined;
					reject(new Error('Failed to load reCAPTCHA script'));
				},
				{ once: true }
			);
			waitForApi();
			return;
		}

		const script = document.createElement('script');
		script.src = RECAPTCHA_SCRIPT_SRC;
		script.async = true;
		script.defer = true;
		script.onload = () => {
			script.dataset.loaded = 'true';
			resolveWhenReady();
		};
		script.onerror = () => {
			window.__recaptchaScriptPromise = undefined;
			reject(new Error('Failed to load reCAPTCHA script'));
		};
		document.head.appendChild(script);
	});

	return window.__recaptchaScriptPromise;
}

export type { RecaptchaApi };