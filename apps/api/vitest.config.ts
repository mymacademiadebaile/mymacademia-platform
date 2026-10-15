import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // These integration suites share an in-memory MongoDB resource. Running
    // files concurrently makes timing-sensitive billing tests intermittently
    // exceed their per-test timeout, despite passing in isolation.
    fileParallelism: false
  }
});
