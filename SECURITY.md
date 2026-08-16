# Security

This extension handles OAuth tokens that grant access to your Claude account. That deserves an explicit threat model rather than a reassuring sentence.

## What the extension does with your credentials

**Reads exactly two files:**

- `<configDir>/.credentials.json` — your Claude OAuth tokens
- `.claude.json` — Claude Code's config, for the `oauthAccount` identity block

`<configDir>` resolves as: the `claudeProfileSwitch.configDirOverride` setting → the `CLAUDE_CONFIG_DIR` environment variable → `%USERPROFILE%\.claude`.

**Writes exactly those same two files, and nothing else.** `assertSafeWriteTarget()` in `src/core/fileIo.ts` is an allowlist check that runs before every write; a target that is not one of those two resolved paths throws. It additionally refuses a config directory that is a drive root or your home directory itself, so a mistyped setting fails loudly instead of scattering tokens.

**Stores saved profiles in VS Code SecretStorage**, which is backed by the OS credential store — Windows Credential Manager (DPAPI) on Windows, Keychain on macOS, libsecret on Linux. Tokens are encrypted at rest under your user account. The extension never writes a plaintext copy of a token to a file.

**Stores non-secret metadata in `globalState`** (a plaintext JSON store managed by VS Code): the profile's display name, the account email, the organization name, and a timestamp. If you consider your work email address sensitive, name your profiles something neutral — but note the email is also already in `.claude.json` in plaintext.

## What the extension does not do

| | |
|---|---|
| **Network access** | None. There is no HTTP client anywhere in the source. `no-restricted-imports` blocks `http`, `https`, `net`, and `dgram`; `no-restricted-globals` blocks `fetch` and `XMLHttpRequest`; and `src/test/unit/supplyChain.test.ts` greps every shipped source file for network I/O and fails CI if it finds any. |
| **Telemetry** | None. Nothing is collected, counted, or reported. |
| **Runtime dependencies** | Zero. `npm run verify:no-runtime-deps` fails the build if `dependencies` is non-empty, and it runs before `vsce package`, so a `.vsix` cannot be produced with third-party code in it. |
| **Shell execution** | The only subprocess is `icacls` (Windows permission hardening), invoked via `execFile` with an **argument array** — never a shell string — so a path containing quotes, `&`, or `|` cannot become command injection. A test asserts no shell is ever spawned. |
| **Dynamic code** | No `eval`, no `new Function`, no `vm`. Asserted by test. |
| **Logging tokens** | Nothing containing credential material is written to the output channel. `src/core/redact.ts` masks sensitive-looking keys and token-shaped strings, and JSON parse failures deliberately do not echo file contents. |

## Integrity guarantees

- **Atomic writes.** Credentials are written to a uniquely named temp file in the same directory, `fsync`'d, then `rename`'d over the target. A crash mid-write cannot leave Claude Code with a truncated token file.
- **Recovery slot.** Before every switch, the currently live login is stashed in a separate secret. `Restore Login From Before Last Switch` brings it back — so a switch is never destructive, even for a login you forgot to save.
- **Non-identity config is preserved.** A switch rewrites only the keys listed in `claudeProfileSwitch.identityKeys`. Project history, MCP server definitions, and preferences in `.claude.json` are carried through untouched. Identity keys present on disk but absent from the incoming profile are removed, so no fragment of the previous account lingers.
- **File permissions.** New files are created with mode `0600`. On Windows, `icacls <file> /inheritance:r /grant:r <user>:F` strips inherited ACEs and grants full control only to your account. This is best-effort: if it fails, the extension falls back to the inherited `%USERPROFILE%` ACLs (already user-restricted by default) and says so in the output channel.

## Residual risks — things this cannot protect against

Be clear-eyed about the limits:

- **Any process running as you can read the credentials file while it is live.** That is true of Claude Code itself and is not something an extension can change. This extension reduces the *window* — inactive profiles are encrypted in the keychain rather than sitting in plaintext directories — but the active login is a readable file, by design, because that is how Claude Code consumes it.
- **VS Code extensions are not sandboxed from each other.** Any other extension you have installed runs with the same privileges and can read the same files. Auditing this extension does not audit the rest of your editor.
- **SecretStorage is unlocked while VS Code runs as you.** DPAPI protects data at rest against other users and offline disk access, not against code already running in your session.
- **Your `.claude.json` metadata is plaintext regardless.** Emails and organization names are readable by anything running as you, with or without this extension.

## Verifying the claims yourself

```powershell
npm ci --ignore-scripts     # no install scripts execute
npm run verify              # supply-chain check, lint, types, unit tests, npm audit
```

`npm run verify` runs, in order: the zero-runtime-dependency check, ESLint with the network/shell/eval restrictions, `tsc --noEmit` in strict mode, the unit suite (including the supply-chain and source-invariant assertions), and `npm audit --audit-level=low`.

Worth reading in full, in this order:

1. `src/core/fileIo.ts` — every filesystem write in the extension
2. `src/claudeSession.ts` — the capture/apply logic
3. `src/vault.ts` — how secrets enter and leave the keychain
4. `src/core/redact.ts` — the logging guards

## Dependency policy

- **Runtime dependencies: none.** Not "few" — none. This is enforced, not aspirational.
- **Dev dependencies are pinned to exact versions.** No `^`, no `~`, no `latest`. A caret range means a future patch release you never reviewed can enter your build; an exact pin means upgrades are deliberate, reviewable commits. `npm run verify:no-runtime-deps` fails if any range appears.
- **`.npmrc` sets `save-exact=true`** so `npm install <pkg>` cannot accidentally introduce a range.
- **Transitive advisories are pinned out via `overrides`.** As of this release, `diff` and `serialize-javascript` (both reached only through `mocha`, both test-only, neither shipped) are forced to patched versions so `npm audit` reports zero vulnerabilities at every severity including `low`.
- **CI audits weekly** on a schedule, not just on push, so a newly disclosed advisory surfaces even when the repo is idle.
- **`npm ci --ignore-scripts`** is used in CI and recommended for local installs, so no package's install script executes.
- **CodeQL** runs with the `security-extended` query set on every push and pull request.

## Reporting a vulnerability

Open a private security advisory on the repository:
<https://github.com/is-cout/claude-profile-switch-vscode/security/advisories/new>

Please do not open a public issue for a credential-handling flaw.
