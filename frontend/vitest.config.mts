import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Mirrors tsconfig.json's "@/*" path alias (see next.config.js for the
// equivalent Next.js-side resolution) so test files can import components
// and lib modules the same way app code does. Uses Vite's native
// tsconfig-paths resolution rather than the vite-tsconfig-paths plugin.
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    css: false,
    exclude: ["node_modules/**", ".next/**"],
  },
});
