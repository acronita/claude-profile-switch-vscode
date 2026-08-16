import * as assert from "node:assert/strict";
import {
  JsonObject,
  SNAPSHOT_VERSION,
  applyIdentity,
  extractIdentity,
  isProfileSnapshot,
  parseJsonObject,
  readEmail,
  readOrganization,
} from "../../core/snapshot";

const IDENTITY_KEYS = [
  "oauthAccount",
  "userID",
  "organizationUUID",
  "hasCompletedOnboarding",
];

const workConfig: JsonObject = {
  oauthAccount: {
    emailAddress: "lucas@company.com",
    organizationName: "Company Inc",
    accountUuid: "uuid-work",
  },
  userID: "user-work",
  organizationUUID: "org-work",
  hasCompletedOnboarding: true,
  projects: { "C:\\code\\api": { allowedTools: ["Bash"] } },
  mcpServers: { local: { command: "node" } },
  editorMode: "vim",
};

describe("extractIdentity", () => {
  it("takes only the listed keys", () => {
    const identity = extractIdentity(workConfig, IDENTITY_KEYS);
    assert.deepEqual(Object.keys(identity).sort(), [
      "hasCompletedOnboarding",
      "oauthAccount",
      "organizationUUID",
      "userID",
    ]);
  });

  it("skips keys that are absent instead of writing undefined", () => {
    const identity = extractIdentity({ userID: "u" }, IDENTITY_KEYS);
    assert.deepEqual(identity, { userID: "u" });
    assert.equal("oauthAccount" in identity, false);
  });

  it("does not pick up inherited prototype properties", () => {
    const hostile = Object.create({ userID: "inherited" }) as JsonObject;
    hostile.organizationUUID = "own";
    const identity = extractIdentity(hostile, IDENTITY_KEYS);
    assert.deepEqual(identity, { organizationUUID: "own" });
  });
});

describe("applyIdentity", () => {
  it("preserves every non-identity key", () => {
    const personal = extractIdentity(
      {
        oauthAccount: { emailAddress: "me@personal.com" },
        userID: "user-personal",
      },
      IDENTITY_KEYS,
    );
    const next = applyIdentity(workConfig, personal, IDENTITY_KEYS);

    assert.deepEqual(next.projects, workConfig.projects);
    assert.deepEqual(next.mcpServers, workConfig.mcpServers);
    assert.equal(next.editorMode, "vim");
  });

  it("replaces identity keys with the incoming values", () => {
    const personal = { userID: "user-personal" } as JsonObject;
    const next = applyIdentity(workConfig, personal, IDENTITY_KEYS);
    assert.equal(next.userID, "user-personal");
  });

  it("removes stale identity keys the incoming profile does not have", () => {
    const personal = { userID: "user-personal" } as JsonObject;
    const next = applyIdentity(workConfig, personal, IDENTITY_KEYS);
    assert.equal("oauthAccount" in next, false);
    assert.equal("organizationUUID" in next, false);
    assert.equal("hasCompletedOnboarding" in next, false);
  });

  it("does not mutate the input config", () => {
    const before = JSON.stringify(workConfig);
    applyIdentity(workConfig, { userID: "x" }, IDENTITY_KEYS);
    assert.equal(JSON.stringify(workConfig), before);
  });

  it("round-trips: extract then apply restores the original", () => {
    const identity = extractIdentity(workConfig, IDENTITY_KEYS);
    const stripped = applyIdentity(workConfig, {}, IDENTITY_KEYS);
    const restored = applyIdentity(stripped, identity, IDENTITY_KEYS);
    assert.deepEqual(restored, workConfig);
  });
});

describe("readEmail / readOrganization", () => {
  it("reads the oauth email", () => {
    assert.equal(readEmail(workConfig), "lucas@company.com");
  });

  it("falls back to primaryApiKeyEmail", () => {
    assert.equal(
      readEmail({ primaryApiKeyEmail: "api@example.com" }),
      "api@example.com",
    );
  });

  it("returns undefined when nothing is known", () => {
    assert.equal(readEmail({}), undefined);
    assert.equal(readOrganization({}), undefined);
  });

  it("reads the organization name", () => {
    assert.equal(readOrganization(workConfig), "Company Inc");
  });
});

describe("parseJsonObject", () => {
  it("parses an object", () => {
    assert.deepEqual(parseJsonObject('{"a":1}', "test"), { a: 1 });
  });

  it("rejects arrays", () => {
    assert.throws(() => parseJsonObject("[1,2]", "test"), /does not contain a JSON object/);
  });

  it("rejects invalid JSON without echoing the content", () => {
    try {
      parseJsonObject('{"token":"super-secret-value"', "Credentials file");
      assert.fail("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      assert.match(message, /not valid JSON/);
      assert.equal(message.includes("super-secret-value"), false);
    }
  });
});

describe("isProfileSnapshot", () => {
  const valid = {
    version: SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    credentials: { claudeAiOauth: { accessToken: "x" } },
    identity: {},
  };

  it("accepts a well-formed snapshot", () => {
    assert.equal(isProfileSnapshot(valid), true);
  });

  it("rejects a wrong version", () => {
    assert.equal(isProfileSnapshot({ ...valid, version: 99 }), false);
  });

  it("rejects a missing credentials object", () => {
    assert.equal(isProfileSnapshot({ ...valid, credentials: "nope" }), false);
  });

  it("rejects non-objects", () => {
    assert.equal(isProfileSnapshot(null), false);
    assert.equal(isProfileSnapshot("string"), false);
    assert.equal(isProfileSnapshot([]), false);
  });
});
