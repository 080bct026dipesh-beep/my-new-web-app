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
        //
        // Functional mapping used across the app (map legend, route cards,
        // timeline): bus/origin = blue, walking = purple, transfer = orange,
        // destination = red, success/normal = green, congestion = green →
        // amber → red.
        route: {
          bg: "#FFFFFF",
          panel: "#FFFFFF",
          accent: "#2563EB",
          line: "#E3E4DE",
        },
        surface: {
          DEFAULT: "#F7F7F4",
          raised: "#FFFFFF",
          sunken: "#EFEFEA",
        },
        ink: {
          DEFAULT: "#14171C",
          secondary: "#5B6169",
          tertiary: "#8B9098",
        },
        accent: {
          blue: "#2563EB",
          purple: "#7C3AED",
          pink: "#DB2777",
          orange: "#EA580C",
          green: "#16A34A",
          teal: "#0D9488",
          yellow: "#CA8A04",
          red: "#DC2626",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        sheet: "0 -4px 24px rgba(20, 23, 28, 0.10)",
        card: "0 1px 2px rgba(20, 23, 28, 0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
