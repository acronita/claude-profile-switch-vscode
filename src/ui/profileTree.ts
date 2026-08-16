import * as vscode from "vscode";
import { ProfileMeta } from "../core/snapshot";
import { ProfileVault } from "../vault";

export class ProfileTreeItem extends vscode.TreeItem {
  constructor(
    readonly profile: ProfileMeta,
    isActive: boolean,
  ) {
    super(profile.name, vscode.TreeItemCollapsibleState.None);

    const details: string[] = [];
    if (profile.email) {
      details.push(profile.email);
    }
    if (profile.organization) {
      details.push(profile.organization);
    }
    this.description = details.join(" · ") || "no account details saved";

    this.tooltip = new vscode.MarkdownString(
      [
        `**${profile.name}**${isActive ? " — _active_" : ""}`,
        "",
        profile.email ? `Account: \`${profile.email}\`` : "Account: unknown",
        profile.organization ? `Organization: ${profile.organization}` : "",
        `Saved: ${new Date(profile.savedAt).toLocaleString()}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );

    this.iconPath = new vscode.ThemeIcon(
      isActive ? "pass-filled" : "account",
      isActive ? new vscode.ThemeColor("testing.iconPassed") : undefined,
    );
    this.contextValue = "claudeProfile";
    this.command = {
      command: "claudeProfileSwitch.switchToProfile",
      title: "Switch to This Profile",
      arguments: [profile.id],
    };
  }
}

export class ProfileTreeProvider
  implements vscode.TreeDataProvider<ProfileTreeItem>
{
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly vault: ProfileVault) {}

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: ProfileTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): ProfileTreeItem[] {
    const activeId = this.vault.getActiveProfileId();
    return this.vault
      .listProfiles()
      .map((profile) => new ProfileTreeItem(profile, profile.id === activeId));
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
