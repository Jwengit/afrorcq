/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{html,js,svelte,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3B82F6', // Un bleu de confiance par défaut
        secondary: '#EC4899', // Pour l'accent "Girls Only" par exemple
      }
    },
  },
  plugins: [],
}