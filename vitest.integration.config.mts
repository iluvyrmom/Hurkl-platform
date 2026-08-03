import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: ["**/node_modules/**"],
    // These files share one real Postgres database and each resets its
    // schema in beforeAll/beforeEach — running files in parallel races
    // on DDL (CREATE EXTENSION, DROP/CREATE SCHEMA) against each other.
    fileParallelism: false,
  },
});
