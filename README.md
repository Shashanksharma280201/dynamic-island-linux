# Dynamic Island for Linux

A Mac-style **Dynamic Island** for Ubuntu (X11 + GNOME). A frameless, transparent,
always-on-top widget pinned top-center that morphs with spring physics (Framer Motion)
and surfaces live activities: **media playback** and **interactive Claude Code approvals**.

## Run

```bash
npm install
DI_DEMO=1 npm run dev     # demo mode: fake now-playing + fake approval, for animation work
npm run build && npm start # normal run
npm test                   # unit tests (store, protocol, socket, media parser, hook)
```

- At rest the island is a tiny pill top-center; **hover** morphs it open.
- Real events (a Claude approval, a track change) **auto-expand** it, then it settles back.
- The rest of the desktop stays clickable (the transparent window is click-through
  except over the pill).

## Providers

### Media
Reads any **MPRIS** player over D-Bus (Spotify, browsers, etc.) — no `playerctl`
needed. Shows title / artist / album art with play-pause / next / previous controls.

### Claude Code approvals
Approve or deny Claude's tool calls **from the island**. Install the `PreToolUse`
hook (see [`hook/README.md`](hook/README.md)):

```jsonc
// ~/.claude/settings.json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "*", "hooks": [
        { "type": "command",
          "command": "node /home/shanks/Pictures/dynamic-island-linux/hook/claude-island-hook.cjs" }
      ] }
    ]
  }
}
```

The hook **fails open**: if the island isn't running or you don't respond within
30 s, it returns `ask` and Claude's normal terminal prompt takes over. Override the
socket path with `DYNAMIC_ISLAND_SOCK`.

## Architecture

- **Electron main** — transparent always-on-top window, priority activity store,
  and both providers (MPRIS over D-Bus, Claude approvals over a unix socket).
- **Renderer** (React + Framer Motion) — the morphing island; sends approve/deny
  and media commands back over IPC.
- **Hook** (`hook/claude-island-hook.cjs`) — bridges Claude's `PreToolUse` hook to
  the socket.

## Limitations

- **X11 only** for now (Wayland support is a future item).
