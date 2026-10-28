import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        pitch: {
          dark: "#14532d",
          DEFAULT: "#15803d",
          light: "#22c55e",
          line: "#ffffff",
        },
      },
    },
  },
  plugins: [],
};
export default config;
