/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans Thai"', 'system-ui', 'sans-serif'],
        display: ['Mitr', '"Noto Sans Thai"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
