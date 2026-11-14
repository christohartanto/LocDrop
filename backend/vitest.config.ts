import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { TABLE_NAME: "LocDropTest" },
    globalSetup: "tests/global-setup.ts",
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
