import * as vscode from "vscode";
import { ClaudeSession } from "./claudeSession";
import { safeErrorMessage } from "./core/redact";
import {
  ProfileMeta,
  ProfileSnapshot,
  readEmail,
  readOrganization,
} from "./core/snapshot";
import { ProfileTreeProvider, ProfileTreeItem } from "./ui/profileTree";
import { StatusBar } from "./ui/statusBar";
import { ProfileVault, newProfileId } from "./vault";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Claude Profile Switch");
  const vault = new ProfileVault(context);
  const session = new ClaudeSession(output);
  const tree = new ProfileTreeProvider(vault);
  const statusBar = new StatusBar(vault);

  context.subscriptions.push(output, tree, statusBar);
  context.subscriptions.push(
    vscode.window.createTreeView("claudeProfileSwitch.profiles", {
      treeDataProvider: tree,
      showCollapseAll: false,
    }),
  );

  const refreshUi = (): void => {
    tree.refresh();
    try {
      const status = session.status();
      statusBar.refresh(status.email, status.loggedIn);
    } catch (error) {
      output.appendLine(
        `[${new Date().toISOString()}] Could not read Claude state: ${safeErrorMessage(error)}`,
      );
      statusBar.refresh(undefined, false);
    }
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const metaFromSnapshot = (
    id: string,
    name: string,
    snapshot: ProfileSnapshot,
  ): ProfileMeta => ({
    id,
    name,
    email: readEmail(snapshot.identity),
    organization: readOrganization(snapshot.identity),
    savedAt: snapshot.savedAt,
  });

  const pickProfile = async (
    placeHolder: string,
  ): Promise<ProfileMeta | undefined> => {
    const profiles = vault.listProfiles();
    if (profiles.length === 0) {
      void vscode.window.showInformationMessage(
        "No Claude profiles saved yet. Log in to Claude, then run “Claude Profiles: Save Current Login as Profile”.",
      );
      return undefined;
    }
    const activeId = vault.getActiveProfileId();
    const picked = await vscode.window.showQuickPick(
      profiles.map((profile) => ({
        label: `${profile.id === activeId ? "$(pass-filled) " : "$(account) "}${profile.name}`,
        description: profile.email ?? "",
        detail: `Saved ${new Date(profile.savedAt).toLocaleString()}${
          profile.organization ? ` · ${profile.organization}` : ""
        }`,
        profile,
      })),
      { placeHolder, matchOnDescription: true },
    );
    return picked?.profile;
  };

  const resolveTarget = async (
    arg: unknown,
    placeHolder: string,
  ): Promise<ProfileMeta | undefined> => {
    if (typeof arg === "string") {
      return vault.getProfile(arg);
    }
    if (arg instanceof ProfileTreeItem) {
      return arg.profile;
    }
    return pickProfile(placeHolder);
  };

  const maybeReload = async (profileName: string): Promise<void> => {
    const mode = vscode.workspace
      .getConfiguration("claudeProfileSwitch")
      .get<string>("reloadAfterSwitch", "ask");

    if (mode === "never") {
      void vscode.window.showInformationMessage(
        `Switched to “${profileName}”. Reload the window for the Claude extension to pick it up.`,
      );
      return;
    }
    if (mode === "always") {
      await vscode.commands.executeCommand("workbench.action.reloadWindow");
      return;
    }
    const choice = await vscode.window.showInformationMessage(
      `Switched to “${profileName}”. The Claude extension caches your login, so a reload is needed for it to take effect.`,
      "Reload Window",
      "Later",
    );
    if (choice === "Reload Window") {
      await vscode.commands.executeCommand("workbench.action.reloadWindow");
    }
  };

  /**
   * Applies a snapshot, after first stashing whatever is live into the recovery
   * slot. That stash is what makes a switch non-destructive even when the user
   * forgot to save the current login as a profile.
   */
  const applySnapshot = async (
    snapshot: ProfileSnapshot,
    profileId: string | undefined,
  ): Promise<void> => {
    const current = session.capture();
    if (current) {
      await vault.storeRecoverySnapshot(current);
    }
    await session.apply(snapshot);
    await vault.setActiveProfileId(profileId);
    output.appendLine(
      `[${new Date().toISOString()}] Applied profile ${profileId ?? "(recovery)"}.`,
    );
    refreshUi();
  };

  /**
   * Wraps a command body so that every failure is logged and surfaced through a
   * redacted message, and never as an unhandled rejection.
   */
  const run =
    (fn: () => void | Promise<void>) =>
    (): void => {
      void Promise.resolve()
        .then(fn)
        .catch((error: unknown) => {
          const message = safeErrorMessage(error);
          output.appendLine(`[${new Date().toISOString()}] Error: ${message}`);
          void vscode.window.showErrorMessage(
            `Claude Profile Switch: ${message}`,
          );
        });
    };

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  const saveCurrentAsProfile = run(async () => {
    const snapshot = session.capture();
    if (!snapshot) {
      const paths = session.paths();
      void vscode.window.showWarningMessage(
        `No Claude credentials found at ${paths.credentialsFile}. Log in to Claude first, then save the profile.`,
      );
      return;
    }

    const detectedEmail = readEmail(snapshot.identity);
    const name = await vscode.window.showInputBox({
      title: "Save Claude Login as Profile",
      prompt: "Name this profile (for example: personal, work)",
      value: detectedEmail ? detectedEmail.split("@")[0] : "",
      validateInput: (value) => {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
          return "Enter a name.";
        }
        if (trimmed.length > 40) {
          return "Keep the name under 40 characters.";
        }
        return undefined;
      },
    });
    if (!name) {
      return;
    }

    const trimmed = name.trim();
    const existing = vault.findByName(trimmed);
    if (existing) {
      const choice = await vscode.window.showWarningMessage(
        `A profile named “${trimmed}” already exists. Overwrite its saved login?`,
        { modal: true },
        "Overwrite",
      );
      if (choice !== "Overwrite") {
        return;
      }
    }

    const id = existing?.id ?? newProfileId();
    await vault.saveProfile(metaFromSnapshot(id, trimmed, snapshot), snapshot);
    await vault.setActiveProfileId(id);
    refreshUi();
    void vscode.window.showInformationMessage(
      `Saved profile “${trimmed}”${detectedEmail ? ` (${detectedEmail})` : ""}.`,
    );
  });

  const switchProfile = run(async () => {
    const target = await pickProfile("Select the Claude account to switch to");
    if (!target) {
      return;
    }
    await doSwitch(target);
  });

  const switchToProfile = (arg: unknown): void =>
    run(async () => {
      const target = await resolveTarget(
        arg,
        "Select the Claude account to switch to",
      );
      if (target) {
        await doSwitch(target);
      }
    })();

  const doSwitch = async (target: ProfileMeta): Promise<void> => {
    if (vault.getActiveProfileId() === target.id) {
      const status = session.status();
      if (status.loggedIn && status.email === target.email) {
        void vscode.window.showInformationMessage(
          `“${target.name}” is already the active profile.`,
        );
        return;
      }
    }

    const snapshot = await vault.readSnapshot(target.id);
    if (!snapshot) {
      void vscode.window.showErrorMessage(
        `The saved login for “${target.name}” could not be read from the OS credential store. Re-save it while logged in to that account.`,
      );
      return;
    }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Switching to “${target.name}”…` },
      async () => {
        await applySnapshot(snapshot, target.id);
      },
    );
    await maybeReload(target.name);
  };

  const updateProfileFromCurrent = (arg: unknown): void =>
    run(async () => {
      const target = await resolveTarget(arg, "Select the profile to update");
      if (!target) {
        return;
      }
      const snapshot = session.capture();
      if (!snapshot) {
        void vscode.window.showWarningMessage(
          "No Claude credentials found to save. Log in first.",
        );
        return;
      }
      const email = readEmail(snapshot.identity);
      const choice = await vscode.window.showWarningMessage(
        `Replace the saved login for “${target.name}” with the login currently active${
          email ? ` (${email})` : ""
        }?`,
        { modal: true },
        "Update",
      );
      if (choice !== "Update") {
        return;
      }
      await vault.saveProfile(
        metaFromSnapshot(target.id, target.name, snapshot),
        snapshot,
      );
      await vault.setActiveProfileId(target.id);
      refreshUi();
      void vscode.window.showInformationMessage(`Updated “${target.name}”.`);
    })();

  const renameProfile = (arg: unknown): void =>
    run(async () => {
      const target = await resolveTarget(arg, "Select the profile to rename");
      if (!target) {
        return;
      }
      const name = await vscode.window.showInputBox({
        title: "Rename Profile",
        value: target.name,
        validateInput: (value) => {
          const trimmed = value.trim();
          if (trimmed.length === 0) {
            return "Enter a name.";
          }
          const clash = vault.findByName(trimmed);
          if (clash && clash.id !== target.id) {
            return "Another profile already uses that name.";
          }
          return undefined;
        },
      });
      if (!name) {
        return;
      }
      await vault.updateMeta({ ...target, name: name.trim() });
      refreshUi();
    })();

  const deleteProfile = (arg: unknown): void =>
    run(async () => {
      const target = await resolveTarget(arg, "Select the profile to delete");
      if (!target) {
        return;
      }
      const choice = await vscode.window.showWarningMessage(
        `Delete the profile “${target.name}”? Its saved login is removed from the OS credential store. This does not log you out of the account currently in use.`,
        { modal: true },
        "Delete",
      );
      if (choice !== "Delete") {
        return;
      }
      await vault.deleteProfile(target.id);
      refreshUi();
      void vscode.window.showInformationMessage(`Deleted “${target.name}”.`);
    })();

  const restoreLastSession = run(async () => {
    const snapshot = await vault.readRecoverySnapshot();
    if (!snapshot) {
      void vscode.window.showInformationMessage(
        "There is no previous login to restore. A recovery copy is kept automatically each time you switch.",
      );
      return;
    }
    const email = readEmail(snapshot.identity);
    const choice = await vscode.window.showWarningMessage(
      `Restore the login that was active before the last switch${
        email ? ` (${email})` : ""
      }? This overwrites the login currently in use.`,
      { modal: true },
      "Restore",
    );
    if (choice !== "Restore") {
      return;
    }
    const match = vault
      .listProfiles()
      .find((profile) => email && profile.email === email);
    await applySnapshot(snapshot, match?.id);
    await maybeReload(match?.name ?? "the previous login");
  });

  const showStatus = run(() => {
    const status = session.status();
    const activeId = vault.getActiveProfileId();
    const active = activeId ? vault.getProfile(activeId) : undefined;

    output.appendLine("");
    output.appendLine("=== Claude Profile Switch — status ===");
    output.appendLine(`Config directory : ${status.paths.configDir}`);
    output.appendLine(`Credentials file : ${status.paths.credentialsFile}`);
    output.appendLine(`Config file      : ${status.paths.configFile}`);
    output.appendLine(`Logged in        : ${status.loggedIn ? "yes" : "no"}`);
    output.appendLine(`Account email    : ${status.email ?? "unknown"}`);
    output.appendLine(`Organization     : ${status.organization ?? "unknown"}`);
    output.appendLine(`Active profile   : ${active?.name ?? "none"}`);
    output.appendLine(`Saved profiles   : ${vault.listProfiles().length}`);
    output.show(true);
  });

  const refresh = run(() => {
    refreshUi();
  });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "claudeProfileSwitch.saveCurrentAsProfile",
      saveCurrentAsProfile,
    ),
    vscode.commands.registerCommand(
      "claudeProfileSwitch.switchProfile",
      switchProfile,
    ),
    vscode.commands.registerCommand(
      "claudeProfileSwitch.switchToProfile",
      switchToProfile,
    ),
    vscode.commands.registerCommand(
      "claudeProfileSwitch.updateProfileFromCurrent",
      updateProfileFromCurrent,
    ),
    vscode.commands.registerCommand(
      "claudeProfileSwitch.renameProfile",
      renameProfile,
    ),
    vscode.commands.registerCommand(
      "claudeProfileSwitch.deleteProfile",
      deleteProfile,
    ),
    vscode.commands.registerCommand(
      "claudeProfileSwitch.restoreLastSession",
      restoreLastSession,
    ),
    vscode.commands.registerCommand(
      "claudeProfileSwitch.showStatus",
      showStatus,
    ),
    vscode.commands.registerCommand("claudeProfileSwitch.refresh", refresh),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("claudeProfileSwitch")) {
        refreshUi();
      }
    }),
  );

  refreshUi();
}

export function deactivate(): void {
  // Nothing to tear down: all disposables are registered on the context.
}
