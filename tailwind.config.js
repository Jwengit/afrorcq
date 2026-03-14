/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{html,js,svelte,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2BB573', // Vert du site
        secondary: '#EC4899', // Pour l'accent "Girls Only" par exemple
      }
    },
  },
  plugins: [],
}