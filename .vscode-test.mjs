import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "out/test/integration/**/*.test.js",
  version: "stable",
  mocha: {
    // @vscode/test-cli defaults to mocha's "tdd" UI (suite/test). The unit
    // suite runs under plain mocha, which defaults to "bdd" (describe/it).
    // Pin both to "bdd" so the same test style works in either runner.
    ui: "bdd",
    timeout: 20000,
    reporter: "spec",
  },
});
