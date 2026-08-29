/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        glow: "0 0 0 1px rgba(148,163,184,.08), 0 18px 60px rgba(2,6,23,.45)",
      },
    },
  },
  plugins: [],
};
