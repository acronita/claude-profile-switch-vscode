# Claude Profile Switch

Switch the account used by the **official Claude Code VS Code extension** between as many Claude logins as you like — personal, work, a client's, whatever.

Built for people who are (rightly) nervous about handing their OAuth tokens to an unreviewed extension. The security posture is the point:

- **Zero runtime dependencies.** The published `.vsix` contains nothing but this repo's own compiled TypeScript. No third-party code runs in your editor. CI fails the build if a runtime dependency is ever added.
- **No network access, ever.** There is no HTTP client in the source. A lint rule blocks importing `http`/`https`/`net`, and a test asserts the shipped sources contain no network calls. Your tokens have nowhere to go.
- **Credentials live in the OS keychain.** Saved logins go into VS Code SecretStorage, which on Windows is the Credential Manager (DPAPI). The extension never writes a plaintext copy of your tokens to disk.
- **Everything is auditable.** ~600 lines of commented TypeScript. You can read all of it in one sitting — and you should, before trusting anything with your credentials.

---

## How it works

Claude Code — and therefore the official VS Code extension, which wraps the CLI — keeps its login in two files:

| File | Contents |
|---|---|
| `%USERPROFILE%\.claude\.credentials.json` | The OAuth tokens for the logged-in account |
| `%USERPROFILE%\.claude.json` | General config, including an `oauthAccount` block naming who is logged in |

Switching accounts means swapping those. This extension:

1. **Captures** the current login — the whole credentials file, plus only the account-identifying keys from `.claude.json` — into an encrypted profile in your OS keychain.
2. **Applies** a saved profile by writing those files back atomically (temp file + rename, so a crash can never leave you with a half-written token file).
3. **Leaves everything else alone.** Project history, MCP server definitions, and editor preferences in `.claude.json` are preserved byte-for-byte across a switch. Only the identity keys move.

Before every switch, the login that is currently live is stashed in a recovery slot, so **"Restore Login From Before Last Switch"** always has something to give you back — even if you forgot to save the old login as a profile.

### Why not the other approaches?

Two existing extensions solve this differently, and both have trade-offs this one avoids:

- **Symlinking `~/.claude`** to per-profile directories requires Developer Mode or an elevated prompt on Windows, and leaves every account's tokens sitting in plaintext directories in your home folder.
- **Overriding `HOME`/`USERPROFILE`** for a spawned terminal isolates the *CLI* but does not change which account the official VS Code extension itself uses, and typically pulls in a native `node-pty` dependency.

This extension swaps the real files in place, so the official extension picks up the change, and keeps the tokens encrypted at rest between switches.

---

## Install

The extension is not on the Marketplace. Build it yourself — which is rather the point, given the concern that started this.

**Requirements:** Node.js 20 or newer, and VS Code 1.100 or newer.

```powershell
git clone https://github.com/is-cout/claude-profile-switch-vscode.git
cd claude-profile-switch-vscode

# Install pinned dev dependencies without running any install scripts
npm ci --ignore-scripts

# Lint, type-check, unit-test, and audit in one go
npm run verify

# Produce claude-profile-switch.vsix
npm run package

# Install it into VS Code
code --install-extension claude-profile-switch.vsix
```

Then reload VS Code. A **Claude Profiles** icon appears in the Activity Bar.

To try it without installing, open the folder in VS Code and press <kbd>F5</kbd> — that launches an Extension Development Host with the extension loaded.

### Updating

```powershell
git pull
npm ci --ignore-scripts
npm run package
code --install-extension claude-profile-switch.vsix --force
```

Your saved profiles live in the OS keychain, not in the extension, so they survive reinstalls.

---

## Use

### First run: save your existing accounts

The extension can only save a login that is currently active, so you save them one at a time.

1. Log in to Claude with your **personal** account (via the Claude extension, or `claude /login` in a terminal).
2. Run **`Claude Profiles: Save Current Login as Profile`** from the Command Palette (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>), or click **+** in the Claude Profiles sidebar.
3. Name it `personal`.
4. Now log out and log in with your **work** account.
5. Save that one as `work`.

Repeat for any further accounts — there is no two-account limit.

### Day to day

- **Switch:** click the account in the Claude Profiles sidebar, or click the status bar item (`⏻ Claude: work`), or run **`Claude Profiles: Switch Profile…`**.
- **Reload when prompted.** The official Claude extension caches your login in memory, so the switch only fully lands after a window reload. Set `claudeProfileSwitch.reloadAfterSwitch` to `always` to skip the prompt.
- **Refresh a stored token.** OAuth tokens rotate. If a profile stops working, log in to that account normally, then right-click the profile → **Update Profile from Current Login**.

### Commands

| Command | What it does |
|---|---|
| `Save Current Login as Profile` | Captures the active login into a new encrypted profile |
| `Switch Profile…` | Picks a profile and makes it the active login |
| `Update Profile from Current Login` | Refreshes a profile's stored tokens |
| `Rename Profile` | Renames a profile (display only) |
| `Delete Profile` | Removes the profile and its secret from the keychain |
| `Restore Login From Before Last Switch` | Puts back the login that was live before your most recent switch |
| `Show Current Login Status` | Prints resolved paths, the live account, and profile count to the output channel |

### Settings

| Setting | Default | Purpose |
|---|---|---|
| `claudeProfileSwitch.showStatusBarItem` | `true` | Show the active profile in the status bar |
| `claudeProfileSwitch.reloadAfterSwitch` | `ask` | `ask`, `always`, or `never` reload the window after switching |
| `claudeProfileSwitch.hardenFilePermissions` | `true` | Restrict the credentials file to your Windows user via `icacls` after writing |
| `claudeProfileSwitch.identityKeys` | see below | Which `.claude.json` keys count as "who is logged in" |
| `claudeProfileSwitch.configDirOverride` | `""` | Point at a non-standard Claude config directory |

`identityKeys` defaults to `oauthAccount`, `userID`, `organizationUUID`, `primaryApiKey`, `primaryApiKeyEmail`, `customApiKeyResponses`, `hasCompletedOnboarding`, `hasAvailableSubscription`, `hasAvailableMaxSubscription`, `subscriptionNoticeCount`, `subscriptionUpsellShownCount`. Keys that don't exist in your `.claude.json` are skipped, so this tolerates schema changes in Claude Code. If a future Claude release adds an account-scoped key, add it here rather than waiting for an extension update.

---

## Platform support

Developed and tested for **Windows**. The path resolution and file swapping are platform-neutral and will very likely work on Linux and WSL, but:

- On **macOS**, Claude Code stores credentials in the Keychain rather than `.credentials.json`, so this approach does not apply as written.
- The `icacls` permission hardening step is a no-op off Windows (POSIX `chmod 0600` is applied instead).

---

## Security

See [SECURITY.md](SECURITY.md) for the full threat model, the list of everything the extension reads and writes, and how to verify the claims above yourself.

Short version: this extension handles OAuth tokens for your Claude account. **Read the source before you install it.** It is deliberately small enough that you can.

## License

MIT — see [LICENSE](LICENSE).
