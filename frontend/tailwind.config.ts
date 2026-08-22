import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light, documentation-style base palette. `route.accent` stays as
        // the single default interactive color (blue) so existing
        // hover/focus states don't need per-file color decisions; sections
        // that want a specific semantic hue reach for `accent.*` instead.
        route: {
          bg: "#FFFFFF",
          panel: "#FFFFFF",
          accent: "#2563EB",
          line: "#E4E4DF",
        },
        surface: "#FAFAF7",
        ink: {
          DEFAULT: "#171717",
          secondary: "#666666",
        },
        accent: {
          blue: "#2563EB",
          purple: "#7C3AED",
          pink: "#DB2777",
          orange: "#EA580C",
          green: "#16A34A",
          teal: "#0D9488",
          yellow: "#CA8A04",
        },
      },
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
