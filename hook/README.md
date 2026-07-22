# Claude Code approval hook

Approve or deny Claude Code's tool calls **from the Dynamic Island**.

## Install (recommended)

```bash
node hook/install.cjs
```

This registers the hook on the **`PermissionRequest`** event in
`~/.claude/settings.json` (backing up to `settings.json.bak` first). It also
**removes the old broken `PreToolUse` `"*"` entry** if present.

Why `PermissionRequest` (not `PreToolUse`): it fires **only when Claude actually
needs permission**, so the island shows exactly the prompts Claude would show —
no per-tool spam. (Note: `"matcher": "*"` is invalid; Claude matchers are regex,
so the installer uses `".*"`.)

## Manual install

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "node /home/shanks/Pictures/dynamic-island-linux/hook/claude-island-hook.cjs",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

## Behaviour

- **Fail-open no-op:** if the island isn't running, the request is malformed, or
  you don't respond within 45s, the hook prints **nothing** and exits 0 → Claude
  falls back to its normal terminal permission prompt. It never blocks Claude.
- **Decision shape:** on your click it emits
  `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"|"deny"}}}`.

## Environment overrides

- `DYNAMIC_ISLAND_SOCK` — socket path (default `${XDG_RUNTIME_DIR:-/tmp}/dynamic-island.sock`).
- `DYNAMIC_ISLAND_DEBUG_LOG` — append hook invocations to this file for troubleshooting.
