import { fileURLToPath } from "node:url";

import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

/**
 * Integration tests run against a real Supabase instance (normally the local stack from
 * `npx supabase start`). They exercise Auth, PostgREST, Row Level Security, constraints,
 * the cleanup function and Realtime delivery end to end.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    env: loadEnv("test", process.cwd(), ""),
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
