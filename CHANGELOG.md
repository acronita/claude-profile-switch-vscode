# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-08-16

Initial release.

### Added

- Save the active Claude login as a named profile; no limit on how many.
- Switch between profiles from the sidebar, the status bar, or the Command Palette.
- Update a profile's stored tokens from the current login, for when OAuth tokens rotate.
- Rename and delete profiles.
- `Restore Login From Before Last Switch`, backed by an automatic recovery snapshot taken on every switch.
- `Show Current Login Status`, printing resolved paths and the live account to an output channel.
- Configurable `identityKeys`, so a schema change in Claude Code can be handled without an extension update.
- `configDirOverride` setting for non-standard `CLAUDE_CONFIG_DIR` layouts.

### Security

- Zero runtime dependencies, enforced by `npm run verify:no-runtime-deps` in CI and before packaging.
- Profiles stored in VS Code SecretStorage (Windows Credential Manager / DPAPI); no plaintext token files written.
- No network access; enforced by lint rules and a source-scanning test.
- Atomic credential writes (temp file, `fsync`, rename).
- Windows ACL hardening of the credentials file via `icacls`, invoked without a shell.
- Write allowlist restricting the extension to `.credentials.json` and `.claude.json`.
- Redaction helpers so no credential material can reach the output channel.
- `diff` and `serialize-javascript` pinned via `overrides` to patched releases; `npm audit --audit-level=low` reports zero vulnerabilities.
- Weekly scheduled CI audit and CodeQL with `security-extended`.
