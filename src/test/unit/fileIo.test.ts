import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  assertSafeWriteTarget,
  readJsonFile,
  writeJsonFileAtomic,
} from "../../core/fileIo";
import { ClaudePaths } from "../../core/paths";

describe("readJsonFile / writeJsonFileAtomic", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cps-test-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns undefined for a missing file", () => {
    assert.equal(readJsonFile(path.join(dir, "nope.json"), "test"), undefined);
  });

  it("returns undefined for an empty file", () => {
    const file = path.join(dir, "empty.json");
    fs.writeFileSync(file, "   ");
    assert.equal(readJsonFile(file, "test"), undefined);
  });

  it("tolerates a UTF-8 BOM", () => {
    const file = path.join(dir, "bom.json");
    fs.writeFileSync(file, "﻿" + JSON.stringify({ a: 1 }));
    assert.deepEqual(readJsonFile(file, "test"), { a: 1 });
  });

  it("round-trips a written object", () => {
    const file = path.join(dir, "creds.json");
    const payload = { claudeAiOauth: { accessToken: "abc", expiresAt: 1 } };
    writeJsonFileAtomic(file, payload);
    assert.deepEqual(readJsonFile(file, "test"), payload);
  });

  it("leaves no temporary files behind", () => {
    const file = path.join(dir, "creds.json");
    writeJsonFileAtomic(file, { a: 1 });
    const leftovers = fs.readdirSync(dir).filter((n) => n.endsWith(".tmp"));
    assert.deepEqual(leftovers, []);
  });

  it("creates missing parent directories", () => {
    const file = path.join(dir, "nested", "deeper", "creds.json");
    writeJsonFileAtomic(file, { a: 1 });
    assert.equal(fs.existsSync(file), true);
  });

  it("overwrites an existing file completely", () => {
    const file = path.join(dir, "creds.json");
    writeJsonFileAtomic(file, { old: "value", extra: "gone" });
    writeJsonFileAtomic(file, { fresh: "value" });
    assert.deepEqual(readJsonFile(file, "test"), { fresh: "value" });
  });

  it("writes owner-only permissions on POSIX", function () {
    if (process.platform === "win32") {
      this.skip();
      return;
    }
    const file = path.join(dir, "creds.json");
    writeJsonFileAtomic(file, { a: 1 });
    const mode = fs.statSync(file).mode & 0o777;
    assert.equal(mode, 0o600);
  });
});

describe("assertSafeWriteTarget", () => {
  const configDir = path.join(path.sep, "home-dir", ".claude");
  const paths: ClaudePaths = {
    configDir,
    credentialsFile: path.join(configDir, ".credentials.json"),
    configFile: path.join(path.sep, "home-dir", ".claude.json"),
    homeDir: path.join(path.sep, "home-dir"),
  };

  it("allows the credentials file", () => {
    assert.doesNotThrow(() =>
      assertSafeWriteTarget(paths, paths.credentialsFile),
    );
  });

  it("allows the config file even though it sits outside the config dir", () => {
    assert.doesNotThrow(() => assertSafeWriteTarget(paths, paths.configFile));
  });

  it("rejects any other file inside the config directory", () => {
    assert.throws(
      () => assertSafeWriteTarget(paths, path.join(configDir, "other.json")),
      /only .credentials.json and .claude.json/,
    );
  });

  it("rejects a path outside both allowed targets", () => {
    assert.throws(
      () =>
        assertSafeWriteTarget(paths, path.join(path.sep, "etc", "passwd")),
      /only .credentials.json and .claude.json/,
    );
  });

  it("rejects a relative path", () => {
    assert.throws(
      () => assertSafeWriteTarget(paths, "relative.json"),
      /must be absolute/,
    );
  });

  it("rejects a config directory at the filesystem root", () => {
    const root = path.parse(process.cwd()).root;
    assert.throws(
      () =>
        assertSafeWriteTarget(
          {
            ...paths,
            configDir: root,
            credentialsFile: path.join(root, ".credentials.json"),
          },
          path.join(root, ".credentials.json"),
        ),
      /drive root/,
    );
  });

  it("rejects a config directory equal to the home directory", () => {
    const home = os.homedir();
    assert.throws(
      () =>
        assertSafeWriteTarget(
          {
            ...paths,
            configDir: home,
            credentialsFile: path.join(home, ".credentials.json"),
          },
          path.join(home, ".credentials.json"),
        ),
      /home directory itself/,
    );
  });
});
