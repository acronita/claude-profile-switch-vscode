import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { ClaudePaths } from "./paths";
import { JsonObject, parseJsonObject } from "./snapshot";

const BOM = "﻿";

/**
 * Reads a JSON file, returning `undefined` when it does not exist.
 * Any other failure (permissions, corruption) throws.
 */
export function readJsonFile(
  filePath: string,
  label: string,
): JsonObject | undefined {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  if (text.trim().length === 0) {
    return undefined;
  }
  // Strip a UTF-8 BOM if one is present.
  const withoutBom = text.startsWith(BOM) ? text.slice(BOM.length) : text;
  return parseJsonObject(withoutBom, label);
}

/**
 * Writes JSON atomically: the payload goes to a uniquely named temporary file
 * in the *same directory* (so the rename stays on one volume and is atomic),
 * then replaces the target.
 *
 * This matters for credentials: a crash mid-write must never leave Claude Code
 * with a half-written token file, which would log the user out of every account
 * at once.
 */
export function writeJsonFileAtomic(
  filePath: string,
  data: JsonObject,
  options: { mode?: number } = {},
): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const mode = options.mode ?? 0o600;
  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );

  const serialized = JSON.stringify(data, null, 2);
  let handle: number | undefined;
  try {
    handle = fs.openSync(tempPath, "wx", mode);
    fs.writeFileSync(handle, serialized, { encoding: "utf8" });
    // Flush to disk before the rename so the replacement is durable.
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = undefined;
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (handle !== undefined) {
      try {
        fs.closeSync(handle);
      } catch {
        /* best effort */
      }
    }
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      /* best effort */
    }
    throw error;
  }

  try {
    fs.chmodSync(filePath, mode);
  } catch {
    // chmod is a no-op for ACLs on Windows; permission hardening is handled by
    // hardenWindowsFilePermissions below.
  }
}

/**
 * Restricts a file to the current Windows user only.
 *
 * `icacls <file> /inheritance:r /grant:r <user>:F` removes every inherited ACE
 * and grants full control to just the current account. Arguments are passed as
 * an array to `execFile` (no shell), so a path containing quotes or `&` cannot
 * turn into command injection.
 *
 * Best-effort: a failure is reported to the caller but is not fatal, because
 * the default location under `%USERPROFILE%` is already user-restricted.
 */
export function hardenWindowsFilePermissions(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.platform !== "win32") {
      resolve();
      return;
    }
    const user = process.env.USERNAME;
    if (!user) {
      reject(new Error("USERNAME is not set; cannot harden file permissions."));
      return;
    }
    execFile(
      "icacls",
      [filePath, "/inheritance:r", "/grant:r", `${user}:F`],
      { windowsHide: true, timeout: 15_000 },
      (error) => {
        if (error) {
          reject(new Error("icacls did not complete successfully."));
          return;
        }
        resolve();
      },
    );
  });
}

/**
 * Guard used before every write.
 *
 * This extension only ever writes two files, and this allowlist makes that
 * literal: a write to anything other than the resolved `.credentials.json` or
 * `.claude.json` throws. A malformed `configDirOverride` therefore fails loudly
 * instead of scattering tokens across the filesystem.
 */
export function assertSafeWriteTarget(
  paths: ClaudePaths,
  filePath: string,
): void {
  if (!path.isAbsolute(filePath) || !path.isAbsolute(paths.configDir)) {
    throw new Error("Refusing to write: paths must be absolute.");
  }

  const configDir = path.resolve(paths.configDir);
  if (configDir === path.parse(configDir).root) {
    throw new Error("Refusing to write: config directory cannot be a drive root.");
  }
  if (configDir === path.resolve(os.homedir())) {
    throw new Error(
      "Refusing to write: config directory cannot be the home directory itself.",
    );
  }

  const allowed = [paths.credentialsFile, paths.configFile].map((p) =>
    path.resolve(p),
  );
  if (!allowed.includes(path.resolve(filePath))) {
    throw new Error(
      "Refusing to write: only .credentials.json and .claude.json may be written.",
    );
  }
}
