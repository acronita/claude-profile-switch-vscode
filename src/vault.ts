import * as vscode from "vscode";
import {
  ProfileMeta,
  ProfileSnapshot,
  isProfileSnapshot,
} from "./core/snapshot";

const META_KEY = "claudeProfileSwitch.profiles";
const ACTIVE_KEY = "claudeProfileSwitch.activeProfileId";
const SECRET_PREFIX = "claudeProfileSwitch.snapshot.";
const RECOVERY_KEY = "claudeProfileSwitch.recoverySnapshot";

/**
 * Stores profile snapshots in VS Code SecretStorage.
 *
 * SecretStorage is backed by the OS credential store -- Windows Credential
 * Manager (DPAPI) on Windows, Keychain on macOS, libsecret on Linux. Tokens are
 * therefore encrypted at rest under the user's account and are never written to
 * a readable file by this extension.
 *
 * Only non-secret metadata (a display name, the account email, a timestamp)
 * lives in `globalState`, which is a plaintext JSON store.
 */
export class ProfileVault {
  constructor(private readonly context: vscode.ExtensionContext) {}

  listProfiles(): ProfileMeta[] {
    const stored = this.context.globalState.get<ProfileMeta[]>(META_KEY, []);
    return Array.isArray(stored) ? [...stored] : [];
  }

  getProfile(id: string): ProfileMeta | undefined {
    return this.listProfiles().find((profile) => profile.id === id);
  }

  findByName(name: string): ProfileMeta | undefined {
    const needle = name.trim().toLowerCase();
    return this.listProfiles().find(
      (profile) => profile.name.trim().toLowerCase() === needle,
    );
  }

  getActiveProfileId(): string | undefined {
    return this.context.globalState.get<string>(ACTIVE_KEY);
  }

  async setActiveProfileId(id: string | undefined): Promise<void> {
    await this.context.globalState.update(ACTIVE_KEY, id);
  }

  /** Creates or replaces a profile and its snapshot. */
  async saveProfile(
    meta: ProfileMeta,
    snapshot: ProfileSnapshot,
  ): Promise<void> {
    await this.context.secrets.store(
      SECRET_PREFIX + meta.id,
      JSON.stringify(snapshot),
    );
    const profiles = this.listProfiles().filter((p) => p.id !== meta.id);
    profiles.push(meta);
    profiles.sort((a, b) => a.name.localeCompare(b.name));
    await this.context.globalState.update(META_KEY, profiles);
  }

  /** Updates metadata only, leaving the stored snapshot alone. */
  async updateMeta(meta: ProfileMeta): Promise<void> {
    const profiles = this.listProfiles().map((p) =>
      p.id === meta.id ? meta : p,
    );
    profiles.sort((a, b) => a.name.localeCompare(b.name));
    await this.context.globalState.update(META_KEY, profiles);
  }

  async readSnapshot(id: string): Promise<ProfileSnapshot | undefined> {
    const raw = await this.context.secrets.get(SECRET_PREFIX + id);
    if (!raw) {
      return undefined;
    }
    return parseSnapshot(raw);
  }

  async deleteProfile(id: string): Promise<void> {
    await this.context.secrets.delete(SECRET_PREFIX + id);
    const profiles = this.listProfiles().filter((p) => p.id !== id);
    await this.context.globalState.update(META_KEY, profiles);
    if (this.getActiveProfileId() === id) {
      await this.setActiveProfileId(undefined);
    }
  }

  /**
   * Keeps the login that was live immediately before the most recent switch, so
   * an unsaved session is always recoverable. Overwritten on every switch.
   */
  async storeRecoverySnapshot(snapshot: ProfileSnapshot): Promise<void> {
    await this.context.secrets.store(RECOVERY_KEY, JSON.stringify(snapshot));
  }

  async readRecoverySnapshot(): Promise<ProfileSnapshot | undefined> {
    const raw = await this.context.secrets.get(RECOVERY_KEY);
    if (!raw) {
      return undefined;
    }
    return parseSnapshot(raw);
  }
}

function parseSnapshot(raw: string): ProfileSnapshot | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  return isProfileSnapshot(parsed) ? parsed : undefined;
}

/** Generates a collision-resistant profile id without pulling in a dependency. */
export function newProfileId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
