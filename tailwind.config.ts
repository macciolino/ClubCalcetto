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
