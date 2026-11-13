import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Design system: sfondo #0B0F19, superfici #131C2E, bordi #1E293B (slate-800),
        // verde #10B981 (emerald-500), ambra #F59E0B (amber-500), testo secondario #94A3B8 (slate-400)
        slate: {
          900: "#131C2E",
          950: "#0B0F19",
        },
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Token semantici Light / Dark (globals.css): bg-app, bg-card, bg-card-hover, text-primary, text-secondary,
        // border-line, bg-accent / text-accent, text-on-accent (testo sopra il verde), text-accent-text (link e testi verdi piccoli)
        app: "rgb(var(--bg-app) / <alpha-value>)",
        card: {
          DEFAULT: "rgb(var(--bg-card) / <alpha-value>)",
          hover: "rgb(var(--bg-card-hover) / <alpha-value>)",
        },
        primary: "rgb(var(--text-primary) / <alpha-value>)",
        secondary: "rgb(var(--text-secondary) / <alpha-value>)",
        line: "rgb(var(--border-color) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--accent-primary) / <alpha-value>)",
          text: "rgb(var(--accent-text) / <alpha-value>)",
        },
        "on-accent": "rgb(var(--accent-contrast) / <alpha-value>)",
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
