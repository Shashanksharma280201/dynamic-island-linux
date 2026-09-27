# Claude Code approval hook

Approve or deny Claude Code's permission prompts **from the Dynamic Island**.

## Install

From the island's tray menu (**Claude Code approvals**), or:

```bash
node hook/install.cjs              # install (creates ~/.claude/settings.json if needed)
node hook/install.cjs --uninstall  # remove
```

The installer backs up `settings.json` to `settings.json.bak`, refuses to touch a
file that isn't valid JSON, honours `CLAUDE_CONFIG_DIR`, and removes older island
entries (including the old broken `PreToolUse` `"*"` wiring) so it's idempotent.

Why `PermissionRequest` (not `PreToolUse`): it fires only when Claude is about to
ask for permission, so the island shows exactly the prompts Claude would show.
(Claude matchers are regex, so the installer uses `".*"`, not `"*"`.)

## Manual install

Add to `~/.claude/settings.json`, using the absolute path of your checkout:

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"/path/to/dynamic-island-linux/hook/claude-island-hook.cjs\"",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

## Behaviour

- **Fail-open no-op:** if the island isn't running, the request or reply is
  malformed, the island hangs up, or you don't respond in time, the hook prints
  **nothing** and exits 0, and Claude shows its normal terminal prompt.
- **Decisions:** `allow`, `deny` (optionally with a `message` for Claude), or
  `allow` with the `permission_suggestions` Claude offered echoed back as
  `updatedPermissions` (**Always allow**). "Answer in terminal" is a no-op.
- The island drops the card as soon as the hook disconnects.

## Environment overrides

- `DYNAMIC_ISLAND_SOCK`: socket path (default `$XDG_RUNTIME_DIR/dynamic-island.sock`,
  else `/tmp/dynamic-island-<uid>.sock`).
- `DYNAMIC_ISLAND_TIMEOUT`: seconds to wait for an answer (default 45).
- `DYNAMIC_ISLAND_DEBUG_LOG`: append hook invocations to this file for troubleshooting.
