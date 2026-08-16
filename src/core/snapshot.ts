/**
 * A profile snapshot: everything needed to restore one Claude login.
 *
 * Snapshots are only ever held in memory or inside VS Code SecretStorage
 * (which on Windows is backed by the Credential Manager / DPAPI). They are
 * never written to a plaintext file by this extension.
 */
export const SNAPSHOT_VERSION = 1 as const;

export interface ProfileSnapshot {
  version: typeof SNAPSHOT_VERSION;
  /** ISO-8601 timestamp of when this snapshot was captured. */
  savedAt: string;
  /** Verbatim parsed contents of `.credentials.json`. */
  credentials: JsonObject;
  /** The account-identifying subset of `.claude.json`. */
  identity: JsonObject;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

/** Non-secret information about a profile, safe to keep in globalState. */
export interface ProfileMeta {
  id: string;
  name: string;
  /** Email of the account, shown in the UI. Not a secret. */
  email?: string;
  /** Organization name, when Claude reports one. */
  organization?: string;
  /** ISO-8601 timestamp of the last capture. */
  savedAt: string;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

/**
 * Parses JSON and guarantees the result is a plain object.
 * Throws with a message that never includes file contents, so a corrupt
 * credentials file cannot leak token material into logs or notifications.
 */
export function parseJsonObject(text: string, label: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  if (!isJsonObject(parsed)) {
    throw new Error(`${label} does not contain a JSON object.`);
  }
  return parsed;
}

/**
 * Pulls the account-identifying keys out of a parsed `.claude.json`.
 * Keys that are absent are simply skipped, so this tolerates schema drift in
 * Claude Code without breaking.
 */
export function extractIdentity(
  config: JsonObject,
  identityKeys: readonly string[],
): JsonObject {
  const identity: JsonObject = {};
  for (const key of identityKeys) {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      const value = config[key];
      if (value !== undefined) {
        identity[key] = value;
      }
    }
  }
  return identity;
}

/**
 * Produces the new `.claude.json` contents for a given identity.
 *
 * Every key outside `identityKeys` is preserved untouched -- project history,
 * MCP server definitions and editor preferences all survive a switch. Identity
 * keys present on disk but absent from the snapshot are removed, so no trace of
 * the previous account is left behind.
 */
export function applyIdentity(
  config: JsonObject,
  identity: JsonObject,
  identityKeys: readonly string[],
): JsonObject {
  const next: JsonObject = { ...config };
  for (const key of identityKeys) {
    const value = Object.prototype.hasOwnProperty.call(identity, key)
      ? identity[key]
      : undefined;
    if (value !== undefined) {
      next[key] = value;
    } else {
      delete next[key];
    }
  }
  return next;
}

/** Reads the account email out of a parsed `.claude.json`, when present. */
export function readEmail(config: JsonObject): string | undefined {
  const oauth = config.oauthAccount;
  if (isJsonObject(oauth) && typeof oauth.emailAddress === "string") {
    return oauth.emailAddress;
  }
  if (typeof config.primaryApiKeyEmail === "string") {
    return config.primaryApiKeyEmail;
  }
  return undefined;
}

/** Reads the organization name out of a parsed `.claude.json`, when present. */
export function readOrganization(config: JsonObject): string | undefined {
  const oauth = config.oauthAccount;
  if (!isJsonObject(oauth)) {
    return undefined;
  }
  for (const key of ["organizationName", "organizationRole", "workspaceRole"]) {
    const value = oauth[key];
    if (typeof value === "string" && value.length > 0 && key === "organizationName") {
      return value;
    }
  }
  return undefined;
}

/** Validates an untrusted value read back out of SecretStorage. */
export function isProfileSnapshot(value: unknown): value is ProfileSnapshot {
  if (!isJsonObject(value)) {
    return false;
  }
  return (
    value.version === SNAPSHOT_VERSION &&
    typeof value.savedAt === "string" &&
    isJsonObject(value.credentials) &&
    isJsonObject(value.identity)
  );
}
