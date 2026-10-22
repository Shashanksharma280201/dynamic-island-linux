# Configuration, privacy and security

## Settings and environment variables

Environment variables (set them before starting the app):

| Variable | Meaning |
| --- | --- |
| `DI_DISPLAY` | Index of the monitor to show the island on (default: primary monitor) |
| `DI_DEMO` | Demo mode `1`, `2`, `3` or `4` (see above) |
| `DI_DEBUG` | Log when the island becomes clickable / click-through (polling mode) |
| `DI_INPUT` | `poll` forces the cursor-polling fallback instead of the X11 input shape |
| `DYNAMIC_ISLAND_SOCK` | Socket shared with the Claude hook (default `$XDG_RUNTIME_DIR/dynamic-island.sock`, else `/tmp/dynamic-island-<uid>.sock`) |
| `DYNAMIC_ISLAND_TIMEOUT` | Seconds the Claude hook waits for your answer (default `45`) |
| `DI_USER_DATA` | Use a different profile folder (settings, WhatsApp login, notes) |
| `DI_BACKDROP` | `off` disables the frosted-glass screen snapshot |
| `DI_CLAUDE_BIN` | Path of the `claude` command (otherwise found on `PATH` and in the usual install folders) |
| `DI_STT_MODELS_DIR` | Folder with ready Whisper models (`<org>/<name>/…`), used instead of downloading |
| `DI_SPOTIFY_API`, `DI_SPOTIFY_ACCOUNTS` | Point Spotify at another server (the tests use a local stand-in) |
| `DI_STT_MODEL` | Use this Whisper model id instead of the one picked in Settings |
| `DI_DOCS_OUT` | Folder where the Documents package saves new files (default `~/Documents/Dynamic Island`) |
| `DI_SOFFICE` | LibreOffice command for conversions (found automatically; empty to not use it) |

Settings are saved in `~/.config/dynamic-island-linux/config.json`. Notes are
plain Markdown files in `~/.config/dynamic-island-linux/notes/` (one `.md`
file per note; the first line is its title), so you can back them up, sync
them or edit them with any editor. Settings has an **Open Folder** button. Mail
passwords are encrypted with your desktop keyring (GNOME Keyring); if no keyring
is available, Settings warns you that they are only obfuscated.

## Privacy and security

- **WhatsApp** runs WhatsApp Web inside the island as a linked device, using the
  open-source [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)
  library (the same engine as whatsapp-connector). It is not an official
  WhatsApp API; normal personal use is fine, but WhatsApp can restrict accounts
  that automate bulk messaging. Its login lives in the island's profile folder.
- To drive WhatsApp Web, the island opens a Chrome DevTools debugging port on
  `127.0.0.1` (random port) **only while WhatsApp is enabled**. Like any
  whatsapp-web.js setup, other programs running on the same computer could
  connect to it, so don't enable WhatsApp on a shared multi-user machine.
- Messages and mail are shown on the island and never sent anywhere else.
- Notes never leave your computer.
- **Documents** stay on your computer, and the Documents tab's buttons work
  offline. When you ask the agent about a document, the parts it reads are sent
  to the AI provider you chose in Settings → AI (nothing leaves your computer
  with Ollama). The agent only reaches files you added, documents it finds by
  name in Documents, Downloads and Desktop, and documents in your home folder
  outside hidden folders; it never overwrites a file. PDFs are made from HTML
  in a hidden window with JavaScript off and every network request blocked.
- **CRM** data is stored only on this computer (one JSON file in the profile
  folder, plus a week of daily backups). The CRM tab works offline; when you
  ask the agent about your CRM, the details it looks up are sent to the AI
  provider you chose (nothing leaves your computer with Ollama).
- **Spotify**: the island talks to Spotify directly with your own app's Client
  ID. Your Spotify sign-in (tokens) is stored encrypted with the desktop
  keyring in the island's profile folder; Settings → Spotify → Disconnect
  deletes it.
- **Voice** is transcribed on your computer with Whisper (via
  [transformers.js](https://github.com/huggingface/transformers.js), running as
  WebAssembly inside the island). Audio is never saved or uploaded. The only
  network use is downloading the model from Hugging Face the first time.
- Commands you give Claude are run by your own Claude Code (`claude -p`) in the
  folder you chose, with your normal Claude Code settings and permissions.
- The island's tools are offered to those runs over MCP on `127.0.0.1` only,
  behind a random key the island makes when it starts and passes only to the
  runs it starts; other programs can't use them. `DI_MCP=off` turns this off.
- **Plan limits** come from the data Claude Code gives status line scripts
  (`rate_limits`) and from Claude Code's own output; the island never reads
  your Claude login.
- **Services** (GitHub, Vercel, Stripe, Resend, Notion, Cal.com, n8n): their
  keys are stored encrypted with the desktop keyring and sent only to that
  service's own API; the island only reads (pull requests, deploys, payments,
  emails, pages, bookings, executions) and never changes anything there. A
  wrong key is tried before it's kept. Links open only on the service's own
  sites.
- **Claude Code sessions** are followed through hooks that send the island
  what each step is and the diff of edits, over the same private socket as
  approvals; nothing goes over the network.
- The **weekly recap** keeps only counts and project folder names for 12 weeks
  (no prompts, no code), on this computer. Turn it off or clear it in
  Settings → General. **Attach the window you were in** saves that screenshot
  in the profile folder (the newest 20) for Claude to look at.
- **Dictation** uses the same local Whisper as voice; the text goes to the app
  you're in through the clipboard, which is put back right after.
- The frosted-glass snapshot is a small, low-resolution image of the strip of
  screen behind the island, kept only in memory. It is taken only while the
  island is collapsed, so the island never captures itself or your open panel.
