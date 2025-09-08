/** @type {import('tailwindcss').Config} */
const config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        base: "#F9F9F9",
        primary: "#4A90E2",
        secondary: "#50E3C2",
        accent1: "#FFD166",
        accent2: "#F25F5C",
        accent3: "#9DB4C0",
        dark: "#2C3E50",
        light: "#FFFFFF",
      },
    },
  },
  plugins: [],
};

export default config;
