import * as vscode from "vscode";
import { ProfileVault } from "../vault";

/** Status bar entry showing which saved profile is currently applied. */
export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor(private readonly vault: ProfileVault) {
    this.item = vscode.window.createStatusBarItem(
      "claudeProfileSwitch.status",
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.item.name = "Claude Profile";
    this.item.command = "claudeProfileSwitch.switchProfile";
  }

  refresh(liveEmail: string | undefined, loggedIn: boolean): void {
    const enabled = vscode.workspace
      .getConfiguration("claudeProfileSwitch")
      .get<boolean>("showStatusBarItem", true);
    if (!enabled) {
      this.item.hide();
      return;
    }

    const activeId = this.vault.getActiveProfileId();
    const active = activeId ? this.vault.getProfile(activeId) : undefined;

    if (!loggedIn) {
      this.item.text = "$(account) Claude: signed out";
      this.item.tooltip = "No Claude credentials found. Log in, then save a profile.";
    } else if (active) {
      this.item.text = `$(account) Claude: ${active.name}`;
      this.item.tooltip = `Active profile: ${active.name}${
        liveEmail ? ` (${liveEmail})` : ""
      }\nClick to switch profiles.`;
    } else {
      this.item.text = `$(account) Claude: ${liveEmail ?? "unsaved login"}`;
      this.item.tooltip =
        "This login is not saved as a profile yet.\nClick to switch profiles.";
    }
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
