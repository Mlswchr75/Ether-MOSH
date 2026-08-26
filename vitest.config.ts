import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://test-project.supabase.co"),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("test-anon-key"),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/testSetup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // The visual engine uses dynamic Three/WebGL imports. Running every jsdom
    // file at once lets one environment tear down while another is still
    // resolving that import, producing flaky route failures and false errors.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
