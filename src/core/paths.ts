import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

/**
 * Where Claude Code keeps its state on disk.
 *
 * Claude Code (and therefore the official Claude VS Code extension, which wraps
 * the CLI) reads two files:
 *
 *   - `<configDir>/.credentials.json` -- the OAuth tokens for the logged-in account.
 *   - `.claude.json`                  -- general config, including an `oauthAccount`
 *                                        block describing who is logged in.
 *
 * On Windows `configDir` defaults to `%USERPROFILE%\.claude`, and `.claude.json`
 * historically lives next to it in `%USERPROFILE%`. When `CLAUDE_CONFIG_DIR` is
 * set, both move under that directory.
 */
export interface ClaudePaths {
  /** Directory holding `.credentials.json`. */
  configDir: string;
  /** Absolute path to `.credentials.json`. */
  credentialsFile: string;
  /** Absolute path to the `.claude.json` config file actually in use. */
  configFile: string;
  /** The user's home directory as Claude Code resolves it. */
  homeDir: string;
}

export interface ResolveOptions {
  /** Explicit override from extension settings. Empty string means "auto-detect". */
  configDirOverride?: string;
  /** Injected for tests. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Injected for tests. Defaults to `os.homedir()`. */
  homeDir?: string;
  /** Injected for tests. Defaults to `fs.existsSync`. */
  exists?: (p: string) => boolean;
}

/**
 * Resolves the Claude Code paths for the current machine.
 *
 * Precedence for the config directory:
 *   1. `configDirOverride` (extension setting)
 *   2. `CLAUDE_CONFIG_DIR` environment variable
 *   3. `<home>/.claude`
 *
 * For `.claude.json` we prefer a copy inside the config directory when one
 * exists (the layout used when `CLAUDE_CONFIG_DIR` is set) and otherwise fall
 * back to `<home>/.claude.json`.
 */
export function resolveClaudePaths(options: ResolveOptions = {}): ClaudePaths {
  const env = options.env ?? process.env;
  const exists = options.exists ?? ((p: string) => fs.existsSync(p));

  const homeDir =
    options.homeDir ??
    // On Windows, Claude Code resolves the home directory from USERPROFILE.
    (process.platform === "win32" && env.USERPROFILE
      ? env.USERPROFILE
      : os.homedir());

  const override = (options.configDirOverride ?? "").trim();
  const fromEnv = (env.CLAUDE_CONFIG_DIR ?? "").trim();

  let configDir: string;
  if (override) {
    configDir = path.resolve(override);
  } else if (fromEnv) {
    configDir = path.resolve(fromEnv);
  } else {
    configDir = path.join(homeDir, ".claude");
  }

  const scopedConfigFile = path.join(configDir, ".claude.json");
  const homeConfigFile = path.join(homeDir, ".claude.json");

  return {
    configDir,
    credentialsFile: path.join(configDir, ".credentials.json"),
    configFile: exists(scopedConfigFile) ? scopedConfigFile : homeConfigFile,
    homeDir,
  };
}

/**
 * True when `child` is inside `parent` (or is `parent` itself).
 *
 * Used as a guard before writing: we refuse to write credentials to a location
 * outside the resolved config directory, so a malformed setting cannot make the
 * extension scatter tokens across the filesystem.
 */
export function isInsideDirectory(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  if (rel === "") {
    return true;
  }
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}
