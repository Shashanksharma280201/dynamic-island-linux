# Claude Code hooks

Two small scripts connect Claude Code to the **Dynamic Island**:

- `claude-island-hook.cjs` (on `PermissionRequest`): approve or deny Claude's
  permission prompts, answer its questions (`AskUserQuestion`) and start its
  plans (`ExitPlanMode`) from the island.
- `claude-island-hook-events.cjs` (on `SessionStart`, `UserPromptSubmit`,
  `PreToolUse`, `PostToolUse`, `Notification`, `Stop`, `SessionEnd`): tells the
  island what each session is doing, so it can show it live (its steps, the files
  it changes with their diffs, when it needs you, its last answer). It is fire
  and forget: it never prints anything, never blocks or changes what Claude does,
  and always exits 0 within a second.

Other agents (Codex, Gemini CLI, Cursor Agent) run the session hook too, with
`--agent <id>`; `node hook/agents.cjs <codex|gemini|cursor> [--uninstall]` adds
or removes it in their own hook file (`~/.codex/hooks.json`,
`~/.gemini/settings.json`, `~/.cursor/hooks.json`), backed up first. Their
approvals stay in the agent.

## Install

From the island's tray menu (**Claude Code approvals**), or:

```bash
node hook/install.cjs              # install (creates ~/.claude/settings.json if needed)
node hook/install.cjs --uninstall  # remove
```

The installer backs up `settings.json` to `settings.json.bak`, refuses to touch a
file that isn't valid JSON, honours `CLAUDE_CONFIG_DIR`, and removes older island
entries (including the old broken `PreToolUse` `"*"` wiring) so it's idempotent.

Why approvals use `PermissionRequest` (not `PreToolUse`): it fires only when
Claude is about to ask for permission, so the island shows exactly the prompts
Claude would show. (Claude matchers are regex, so the installer uses `".*"`, not
`"*"`.) An island that was set up before sessions were followed adds the session
hook by itself the next time it starts.

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
- **Questions:** the answers go back as `updatedInput` (Claude's own input with
  `answers` filled in, by question text), and only when they answer every
  question; otherwise the hook prints nothing and Claude asks in the terminal.
- The island drops the card as soon as the hook disconnects.

## Environment overrides

- `DYNAMIC_ISLAND_SOCK`: socket path (default `$XDG_RUNTIME_DIR/dynamic-island.sock`,
  else `/tmp/dynamic-island-<uid>.sock`).
- `DYNAMIC_ISLAND_TIMEOUT`: seconds to wait for an answer (default 45).
- `DYNAMIC_ISLAND_DEBUG_LOG`: append hook invocations to this file for troubleshooting.
- `DI_AGENT`: what the session hook calls the agent (default `claude-code`).
- Runs the island starts itself (`DYNAMIC_ISLAND_RUN=1`) aren't reported as
  sessions: the Claude tab shows them already.

# Plan-limits status line

`claude-island-status.cjs` is a Claude Code
[status line](https://code.claude.com/docs/en/statusline) script. Claude Code
runs it with session data on stdin, which includes your subscription's
`rate_limits` (5-hour session and 7-day usage). The script forwards those to the
island over the same socket, then prints your previous status line (or a short
one of its own: `Opus 5 · session 24% · week 41%`).

```bash
node hook/statusline.cjs              # install
node hook/statusline.cjs --uninstall  # remove, and put your old status line back
```

Your previous `statusLine` is saved in
`~/.claude/dynamic-island-statusline.json` and restored on uninstall. Like the
approval hook, it never blocks: if the island isn't running, it just prints the
status line.
