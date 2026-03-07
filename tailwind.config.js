/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#020510",
        accent: "#7df7ff",
        muted: "rgba(247, 248, 251, 0.7)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "Plus Jakarta Sans",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
      },
      boxShadow: {
        panel: "0 20px 45px rgba(2, 5, 16, 0.45)",
      },
    },
  },
  plugins: [],
};
