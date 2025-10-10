/** @type {import('tailwindcss').Config} */
const config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}", "./tests/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          surface: "var(--color-surface)",
          surfaceAlt: "var(--color-surface-alt)",
          "surface-alt": "var(--color-surface-alt)",
          text: "var(--color-text)",
          muted: "var(--color-muted)",
          border: "var(--color-border)",
          primary: "var(--color-primary)",
          primaryText: "var(--color-on-primary)",
          error: "var(--color-error)",
          focus: "var(--color-focus)",
        },
        base: "var(--color-surface)",
        primary: "var(--color-primary)",
        secondary: "var(--color-secondary)",
        accent1: "var(--color-accent1)",
        accent2: "var(--color-accent2)",
        accent3: "var(--color-accent3)",
        dark: "var(--color-text)",
        light: "var(--color-surface-alt)",
      },
    },
  },
  plugins: [],
};

export default config;
