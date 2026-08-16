import * as assert from "node:assert/strict";
import {
  maskTokenLikeStrings,
  redact,
  safeErrorMessage,
} from "../../core/redact";

describe("redact", () => {
  it("masks token-like keys at any depth", () => {
    const input = {
      claudeAiOauth: {
        accessToken: "sk-ant-oat01-realvalue",
        refreshToken: "refresh-realvalue",
        expiresAt: 1234,
        scopes: ["user:inference"],
      },
    };
    const output = redact(input) as Record<string, Record<string, unknown>>;
    assert.equal(output.claudeAiOauth!.accessToken, "[redacted]");
    assert.equal(output.claudeAiOauth!.refreshToken, "[redacted]");
    assert.equal(output.claudeAiOauth!.expiresAt, 1234);
  });

  it("masks case-insensitively and across naming styles", () => {
    const output = redact({
      API_KEY: "a",
      apiKey: "b",
      Authorization: "c",
      password: "d",
      sessionKey: "e",
      email: "keep@example.com",
    }) as Record<string, unknown>;
    assert.equal(output.API_KEY, "[redacted]");
    assert.equal(output.apiKey, "[redacted]");
    assert.equal(output.Authorization, "[redacted]");
    assert.equal(output.password, "[redacted]");
    assert.equal(output.sessionKey, "[redacted]");
    assert.equal(output.email, "keep@example.com");
  });

  it("walks arrays", () => {
    const output = redact([{ token: "x" }, { safe: "y" }]) as Record<
      string,
      unknown
    >[];
    assert.equal(output[0]!.token, "[redacted]");
    assert.equal(output[1]!.safe, "y");
  });

  it("does not mutate its input", () => {
    const input = { token: "secret" };
    redact(input);
    assert.equal(input.token, "secret");
  });

  it("stops at a depth limit rather than recursing forever", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    assert.doesNotThrow(() => redact(cyclic));
  });
});

describe("maskTokenLikeStrings", () => {
  it("masks JWT-shaped strings", () => {
    const masked = maskTokenLikeStrings(
      "failed with eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N",
    );
    assert.equal(masked.includes("eyJhbGciOiJIUzI1NiIs"), false);
    assert.match(masked, /\[redacted\]/);
  });

  it("masks sk- prefixed keys", () => {
    const masked = maskTokenLikeStrings("key sk-ant-api03-abcdefghijklmnop failed");
    assert.equal(masked.includes("sk-ant-api03-abcdefghijklmnop"), false);
  });

  it("leaves ordinary prose alone", () => {
    const text = "Could not read the credentials file.";
    assert.equal(maskTokenLikeStrings(text), text);
  });
});

describe("safeErrorMessage", () => {
  it("uses the message of an Error", () => {
    assert.equal(safeErrorMessage(new Error("boom")), "boom");
  });

  it("passes through a string", () => {
    assert.equal(safeErrorMessage("plain"), "plain");
  });

  it("handles a non-error value", () => {
    assert.equal(safeErrorMessage({ weird: true }), "Unknown error.");
  });

  it("masks a token embedded in the message", () => {
    const message = safeErrorMessage(
      new Error("ENOENT reading sk-ant-oat01-abcdefghijklmnopqrstuv"),
    );
    assert.equal(message.includes("sk-ant-oat01-abcdefghijklmnopqrstuv"), false);
  });
});
