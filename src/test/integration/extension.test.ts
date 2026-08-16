import * as assert from "node:assert/strict";
import * as vscode from "vscode";

const EXTENSION_ID = "is-cout.claude-profile-switch";

const EXPECTED_COMMANDS = [
  "claudeProfileSwitch.saveCurrentAsProfile",
  "claudeProfileSwitch.switchProfile",
  "claudeProfileSwitch.switchToProfile",
  "claudeProfileSwitch.updateProfileFromCurrent",
  "claudeProfileSwitch.renameProfile",
  "claudeProfileSwitch.deleteProfile",
  "claudeProfileSwitch.restoreLastSession",
  "claudeProfileSwitch.showStatus",
  "claudeProfileSwitch.refresh",
];

describe("extension activation", () => {
  it("is present", () => {
    assert.ok(vscode.extensions.getExtension(EXTENSION_ID));
  });

  it("activates without throwing", async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    await extension?.activate();
    assert.equal(extension?.isActive, true);
  });

  it("registers every contributed command", async () => {
    await vscode.extensions.getExtension(EXTENSION_ID)?.activate();
    const registered = await vscode.commands.getCommands(true);
    for (const command of EXPECTED_COMMANDS) {
      assert.ok(
        registered.includes(command),
        `command ${command} was not registered`,
      );
    }
  });

  it("exposes its configuration with safe defaults", () => {
    const config = vscode.workspace.getConfiguration("claudeProfileSwitch");
    assert.equal(config.get("showStatusBarItem"), true);
    assert.equal(config.get("reloadAfterSwitch"), "ask");
    assert.equal(config.get("hardenFilePermissions"), true);
    assert.equal(config.get("configDirOverride"), "");
    const keys = config.get<string[]>("identityKeys", []);
    assert.ok(keys.includes("oauthAccount"));
  });

  it("reports status without touching credentials", async () => {
    await vscode.extensions.getExtension(EXTENSION_ID)?.activate();
    // Should not throw even on a machine with no Claude login at all.
    await vscode.commands.executeCommand("claudeProfileSwitch.showStatus");
    await vscode.commands.executeCommand("claudeProfileSwitch.refresh");
  });
});
