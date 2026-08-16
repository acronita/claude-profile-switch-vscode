import * as vscode from "vscode";
import {
  assertSafeWriteTarget,
  hardenWindowsFilePermissions,
  readJsonFile,
  writeJsonFileAtomic,
} from "./core/fileIo";
import { ClaudePaths, resolveClaudePaths } from "./core/paths";
import {
  ProfileSnapshot,
  SNAPSHOT_VERSION,
  applyIdentity,
  extractIdentity,
  readEmail,
  readOrganization,
} from "./core/snapshot";

export interface LiveStatus {
  paths: ClaudePaths;
  loggedIn: boolean;
  email?: string;
  organization?: string;
}

/**
 * Reads and writes the live Claude Code login on disk.
 *
 * Everything the extension does to the filesystem goes through this class, and
 * it touches exactly two files: `.credentials.json` and `.claude.json`.
 */
export class ClaudeSession {
  constructor(private readonly output: vscode.OutputChannel) {}

  paths(): ClaudePaths {
    const override = vscode.workspace
      .getConfiguration("claudeProfileSwitch")
      .get<string>("configDirOverride", "");
    return resolveClaudePaths({ configDirOverride: override });
  }

  identityKeys(): string[] {
    const configured = vscode.workspace
      .getConfiguration("claudeProfileSwitch")
      .get<string[]>("identityKeys", []);
    return configured.filter(
      (key) => typeof key === "string" && key.length > 0,
    );
  }

  /** Describes the account currently logged in on disk. */
  status(): LiveStatus {
    const paths = this.paths();
    const credentials = readJsonFile(paths.credentialsFile, "Credentials file");
    const config = readJsonFile(paths.configFile, "Claude config file");
    return {
      paths,
      loggedIn: credentials !== undefined,
      email: config ? readEmail(config) : undefined,
      organization: config ? readOrganization(config) : undefined,
    };
  }

  /**
   * Captures the current login as a snapshot.
   * Returns `undefined` when no credentials file exists (nobody is logged in).
   */
  capture(): ProfileSnapshot | undefined {
    const paths = this.paths();
    const credentials = readJsonFile(paths.credentialsFile, "Credentials file");
    if (!credentials) {
      return undefined;
    }
    const config =
      readJsonFile(paths.configFile, "Claude config file") ?? {};
    return {
      version: SNAPSHOT_VERSION,
      savedAt: new Date().toISOString(),
      credentials,
      identity: extractIdentity(config, this.identityKeys()),
    };
  }

  /**
   * Writes a snapshot over the live login.
   *
   * Order matters: credentials first, then the identity block in
   * `.claude.json`. If the second write fails the credentials are already valid,
   * which is the recoverable direction -- Claude Code re-derives account display
   * info from the token, whereas a config claiming an account whose token is
   * missing looks like a broken login.
   */
  async apply(snapshot: ProfileSnapshot): Promise<void> {
    const paths = this.paths();
    const keys = this.identityKeys();

    assertSafeWriteTarget(paths, paths.credentialsFile);
    assertSafeWriteTarget(paths, paths.configFile);

    writeJsonFileAtomic(paths.credentialsFile, snapshot.credentials, {
      mode: 0o600,
    });

    const existingConfig =
      readJsonFile(paths.configFile, "Claude config file") ?? {};
    const nextConfig = applyIdentity(existingConfig, snapshot.identity, keys);
    writeJsonFileAtomic(paths.configFile, nextConfig, { mode: 0o600 });

    await this.harden(paths.credentialsFile);
  }

  private async harden(filePath: string): Promise<void> {
    const enabled = vscode.workspace
      .getConfiguration("claudeProfileSwitch")
      .get<boolean>("hardenFilePermissions", true);
    if (!enabled) {
      return;
    }
    try {
      await hardenWindowsFilePermissions(filePath);
      this.output.appendLine(
        `[${new Date().toISOString()}] Restricted credentials file to the current user.`,
      );
    } catch {
      // Non-fatal: the default location under %USERPROFILE% is already
      // restricted to the signed-in user by inherited ACLs.
      this.output.appendLine(
        `[${new Date().toISOString()}] Could not tighten file ACLs; relying on inherited profile permissions.`,
      );
    }
  }
}
