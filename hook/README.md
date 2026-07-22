# Claude Code approval hook

Add to `~/.claude/settings.json` (adjust the absolute path):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /home/shanks/Pictures/dynamic-island-linux/hook/claude-island-hook.cjs"
          }
        ]
      }
    ]
  }
}
```

The hook fails open: if the island isn't running or you don't respond within
30s, it returns `ask` and Claude's normal terminal prompt takes over.
Override the socket path with `DYNAMIC_ISLAND_SOCK`.
