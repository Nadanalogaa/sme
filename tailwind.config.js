/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          base: '#0f1016',
          raised: '#161821',
        },
        accent: '#eab308',
      },
    },
  },
  plugins: [],
}
