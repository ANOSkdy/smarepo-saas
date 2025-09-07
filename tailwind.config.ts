import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        base: '#F9F9F9',
        primary: '#4A90E2',
        secondary: '#50E3C2',
        'accent-2': '#F25F5C',
      },
    },
  },
  plugins: [],
};
export default config;
