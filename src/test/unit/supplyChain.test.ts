import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Executable versions of the promises made in SECURITY.md. If someone (or some
 * future refactor) adds a runtime dependency or a network call, CI fails.
 */

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const srcRoot = path.join(repoRoot, "src");

/**
 * Every `.ts` file that actually ships in the VSIX. Test sources are excluded:
 * they contain the forbidden patterns as literals in the assertions below.
 */
function shippedSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "test") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...shippedSourceFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("supply chain invariants", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  it("ships zero runtime dependencies", () => {
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}), []);
  });

  it("pins every devDependency to an exact version", () => {
    for (const [name, range] of Object.entries(pkg.devDependencies ?? {})) {
      assert.match(
        range,
        /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/,
        `${name} must be pinned to an exact version, got "${range}"`,
      );
    }
  });
});

describe("source invariants", () => {
  const files = shippedSourceFiles(srcRoot);

  it("finds source files to scan", () => {
    assert.ok(files.length >= 6, `expected to scan the shipped sources, found ${files.length}`);
  });

  it("makes no network calls", () => {
    const forbidden =
      /\b(fetch\s*\(|XMLHttpRequest|require\(\s*['"](node:)?(http|https|net|dgram|tls)['"]|from\s+['"](node:)?(http|https|net|dgram|tls)['"])/;
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      assert.equal(
        forbidden.test(text),
        false,
        `${path.relative(repoRoot, file)} appears to perform network I/O`,
      );
    }
  });

  it("never uses eval or dynamic code construction", () => {
    const forbidden = /\b(eval\s*\(|new\s+Function\s*\(|vm\.runIn)/;
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      assert.equal(
        forbidden.test(text),
        false,
        `${path.relative(repoRoot, file)} uses dynamic code evaluation`,
      );
    }
  });

  it("never spawns a shell", () => {
    // execFile with an argument array is allowed; exec/spawn with shell:true is not.
    const forbidden = /\b(child_process\.exec\s*\(|\bexecSync\s*\(|shell\s*:\s*true)/;
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      assert.equal(
        forbidden.test(text),
        false,
        `${path.relative(repoRoot, file)} spawns a shell`,
      );
    }
  });

  it("keeps core modules free of the vscode API so they stay unit-testable", () => {
    const coreFiles = files.filter((f) =>
      f.startsWith(path.join(srcRoot, "core") + path.sep),
    );
    assert.ok(coreFiles.length > 0);
    for (const file of coreFiles) {
      const text = fs.readFileSync(file, "utf8");
      assert.equal(
        /from\s+['"]vscode['"]/.test(text),
        false,
        `${path.relative(repoRoot, file)} should not import vscode`,
      );
    }
  });
});
