import { defineConfig } from "vite";
import path from "path";

/**
 * Separate build for the storefront-background bundles (see
 * docs/superpowers/specs/2026-08-20-sitewide-forge-journey-background-design.md).
 * Deliberately does NOT reuse vite.config.ts's React plugin/app entry — these
 * bundles must not pull in the app shell, router, auth, Supabase, or Stripe.
 * Run with: npx vite build --config vite.bg.config.ts
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist-bg",
    emptyOutDir: true,
    sourcemap: false,
    lib: {
      entry: {
        "mosh-bg-lite": path.resolve(__dirname, "src/embed/backgroundLite.ts"),
      },
      formats: ["es"],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: {
      output: {
        // No hashed chunk names — the theme references these by fixed
        // filename in theme.liquid.
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
      },
    },
  },
});
