import * as assert from "node:assert/strict";
import * as path from "node:path";
import { isInsideDirectory, resolveClaudePaths } from "../../core/paths";

describe("resolveClaudePaths", () => {
  const home = path.join(path.sep, "home-dir");

  it("defaults to <home>/.claude on a clean environment", () => {
    const paths = resolveClaudePaths({
      env: {},
      homeDir: home,
      exists: () => false,
    });
    assert.equal(paths.configDir, path.join(home, ".claude"));
    assert.equal(
      paths.credentialsFile,
      path.join(home, ".claude", ".credentials.json"),
    );
    assert.equal(paths.configFile, path.join(home, ".claude.json"));
  });

  it("honours CLAUDE_CONFIG_DIR", () => {
    const custom = path.join(path.sep, "custom", "claude");
    const paths = resolveClaudePaths({
      env: { CLAUDE_CONFIG_DIR: custom },
      homeDir: home,
      exists: () => false,
    });
    assert.equal(paths.configDir, path.resolve(custom));
    assert.equal(
      paths.credentialsFile,
      path.join(path.resolve(custom), ".credentials.json"),
    );
  });

  it("lets the explicit override win over the environment variable", () => {
    const fromEnv = path.join(path.sep, "from", "env");
    const override = path.join(path.sep, "from", "settings");
    const paths = resolveClaudePaths({
      configDirOverride: override,
      env: { CLAUDE_CONFIG_DIR: fromEnv },
      homeDir: home,
      exists: () => false,
    });
    assert.equal(paths.configDir, path.resolve(override));
  });

  it("ignores a whitespace-only override", () => {
    const paths = resolveClaudePaths({
      configDirOverride: "   ",
      env: {},
      homeDir: home,
      exists: () => false,
    });
    assert.equal(paths.configDir, path.join(home, ".claude"));
  });

  it("prefers .claude.json inside the config directory when it exists", () => {
    const scoped = path.join(home, ".claude", ".claude.json");
    const paths = resolveClaudePaths({
      env: {},
      homeDir: home,
      exists: (p) => p === scoped,
    });
    assert.equal(paths.configFile, scoped);
  });
});

describe("isInsideDirectory", () => {
  it("accepts a direct child", () => {
    assert.equal(
      isInsideDirectory(path.join(path.sep, "a"), path.join(path.sep, "a", "b")),
      true,
    );
  });

  it("accepts the directory itself", () => {
    assert.equal(
      isInsideDirectory(path.join(path.sep, "a"), path.join(path.sep, "a")),
      true,
    );
  });

  it("rejects a sibling", () => {
    assert.equal(
      isInsideDirectory(path.join(path.sep, "a"), path.join(path.sep, "b")),
      false,
    );
  });

  it("rejects traversal out of the directory", () => {
    assert.equal(
      isInsideDirectory(
        path.join(path.sep, "a"),
        path.join(path.sep, "a", "..", "b", "c"),
      ),
      false,
    );
  });

  it("rejects a prefix-sharing sibling directory", () => {
    assert.equal(
      isInsideDirectory(
        path.join(path.sep, "a", "claude"),
        path.join(path.sep, "a", "claude-evil", "x"),
      ),
      false,
    );
  });
});
