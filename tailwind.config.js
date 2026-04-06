/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          navy:    "#0c1f3f",
          teal:    "#0d9488",
          tealLight: "#14b8a6",
          emerald: "#10b981",
          sky:     "#0ea5e9",
        },
      },
    },
  },
  plugins: [],
};
