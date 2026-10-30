# Set it up

Everything here is optional: the island works without any accounts. Most of it is also in the island's **Settings**; the commands are for when you run it from the code.

## Connect Claude Code

To follow your Claude Code sessions on the island and answer their permission
prompts, questions and plans there, either tick **Claude Code approvals** in the
tray menu (or **Follow every Claude Code session on the island** in Settings →
Claude), or run:

```bash
npm run hook:install      # adds the hooks to ~/.claude/settings.json (backs it up first)
```

To see **Codex, Gemini CLI or Cursor Agent** sessions too, turn them on under
Settings → Claude, or run `node hook/agents.cjs codex` (or `gemini`, `cursor`;
add `--uninstall` to remove). Codex asks you to trust new hooks once with `/hooks`.

Restart any running Claude Code sessions. From now on each session shows on the
island while it works (and in the **Sessions** tab), and whenever Claude asks for
permission or asks you a question, the island expands with it. To remove it:
`npm run hook:uninstall` (or untick it in the tray menu).

The hook **fails open**: if the island isn't running, or you don't answer within
45 seconds, Claude shows its normal terminal prompt as usual. It never blocks
Claude. More detail in [`hook/README.md`](../hook/README.md).

## Talk to Claude Code and see your limits

1. Make sure `claude` works in a terminal and you're logged in.
2. Open the island (click it or **Ctrl+I**) and pick the **✳ Claude** icon.
3. Click the folder chip at the top to choose the project Claude should work in.
4. Tap the mic and say what you want, for example "run the tests and fix any
   failures". The first time, the speech model (about 40 to 80 MB) is
   downloaded; after that everything runs on your computer. Or type instead.
5. Click **Show My Limits** once to see your session and weekly usage. This adds
   a tiny status line to Claude Code that reports usage to the island; a
   status line you already had keeps working and comes back if you turn it off.

When Claude needs permission for something (running a command, editing a file),
the island asks you with **Allow** / **Don't Allow**, even if you haven't
installed the approvals hook. In Settings you can let it edit files without
asking (**Allow edits**), or use Claude Code's **Auto** mode.

Claude Code also gets **the island's own tools**: the packages you turned on
in Settings → Packages (your notes, chats, mail, music, documents and CRM).
So "add Rahul from Acme to my CRM and remind me to call him Friday" or "merge
the PDFs I dropped on the island" work with Claude Code too. They're offered
to each run as an MCP server inside the island, reachable only from this
computer with a secret key the island makes when it starts; anything that acts for you (sending
a message, deleting from the CRM, moving a file to the Trash) still asks you on
the island first.

## Use any AI

The agent in the **Claude** tab (with your character's face and name) can run
on Claude Code (your Claude subscription, above) or on any of these with your
own API key: **Claude (API key)**, **ChatGPT (OpenAI)**, **Gemini (Google)**,
**DeepSeek**, **OpenRouter** (one key for hundreds of models), **Ollama** (free
models on your own computer, no key), or **any other OpenAI-compatible
service** (LM Studio, vLLM, Groq…).

1. Open **Settings → AI** and pick the provider.
2. Paste your API key and click **Save**. The island checks it right away and
   lists the models you can use. Keys are stored encrypted with your desktop
   keyring and only ever sent to that provider.
3. Pick a model (or type any model name) and click **Save**.

Ask by voice or typing as before. What the agent can do comes from
**packages** (Settings → Packages), each with its own tab:

| Package | The agent can |
|---|---|
| Basics (always on) | tell the date and time |
| Notes | find, read and write your notes |
| WhatsApp | list and read your chats, **send a message** |
| Mail | list and read your mail, **reply** |
| Music | say what's playing, play / pause / skip, find and play something on Spotify |
| Documents | find, read, merge, split, rotate, stamp, convert and compare documents, correct Word files with tracked changes, edit spreadsheets, write new documents, **move a file to the Trash** |
| CRM | find people, read someone's page, add and update contacts, log calls and notes, add and tick off follow-ups, add and move deals, import and export, undo its own last changes, **delete** a contact, deal or follow-up |

Anything that acts for you (the bold ones) **asks first**: a card shows exactly
what will be sent, with **Allow** and **Don't Allow**. Turn a package off and
its tab disappears and the agent can't use it. Small local models can
struggle with multi-step requests; if a model doesn't support tools, the
island still answers without them.

## Work with documents

Drag files from your file manager onto the island (it turns into a drop
target as you drag over it), or open the **Documents** tab and click **+**.
Then select one or more files:

- The buttons work **without any AI** and offline: **Merge** (two or more
  PDFs, in the order you selected them), **Pages…** (type `1-3, 5` and keep or
  delete them; `3, 1-2` reorders), **Rotate**, **Split** (one file per page),
  **Number pages**, **Convert…**, **Open** and **Show in Folder**.
- The box at the bottom asks the agent about the selected files. It suggests
  requests that fit them (for a Word file: **Fix spelling and grammar**,
  **Review it**); the ☆ button saves what you typed as a recipe.
- Every result is a **new file** in `~/Documents/Dynamic Island` (shown first in
  the list, with a purple dot); originals are only read. Corrections to a Word
  file are made as **tracked changes** in the agent's name, so you see exactly
  what changed and accept or reject each one in Word or LibreOffice. Moving a
  file to the Trash asks you first.
- For exact Word / Excel / PowerPoint to PDF conversions, install LibreOffice
  (`sudo apt install libreoffice`); without it, Word and Excel files are
  converted the simple way (text, headings, lists and tables) and PowerPoint
  can't be converted.

The agent can also find documents by name in your Documents, Downloads and
Desktop folders (“merge the two March invoices in my Downloads”), and open
documents by path in your home folder.

## Drag actions

On by default on Linux (X11), macOS and Windows. Start dragging any file, from your file manager,
the desktop or anywhere else, and **hold still** for half a second (or press
**Alt**). A ring opens under the pointer:

| Action | What it does |
| --- | --- |
| **Convert** | Fans out the formats it can become; let go on one. PDF → Word, text or Markdown; Word → PDF, text or Markdown; **spreadsheets** (Excel, OpenDocument `.ods`, CSV, TSV, and old `.xls` with LibreOffice) → Excel, CSV, PDF, Word (as a table), JSON (one object per row), Markdown or a web page; Markdown or text → Word, PDF; PNG, JPEG and WebP → each other or PDF; PowerPoint → PDF with LibreOffice; OpenDocument, RTF and old Office files → Word or PDF with LibreOffice, or their text; web pages and code → PDF or text |
| **Edit** | Opens the Claude tab with the file named, so you say what to change (Word, spreadsheets, text). Needs Claude Code or an AI in Settings |
| **Capture** | Copies an image to the clipboard, ready to paste |
| **Ask Claude** | Fans out questions: **Summarize**, **Translate**, **Explain**, and more for each kind of file. The answer appears on the island |
| **Shrink** | A smaller copy of a photo (at most 2560 px, recompressed) or a PDF (with Ghostscript if installed, `sudo apt install ghostscript`) |
| **Copy text** | All of a document's text on the clipboard, from **any document**: PDF, Word, OpenDocument, RTF, slides, web pages, code, JSON, logs and other text files (old `.doc` and `.ppt` with LibreOffice). A spreadsheet comes as rows that paste into any sheet as a table. With [tesseract](https://github.com/tesseract-ocr/tesseract) installed (`sudo apt install tesseract-ocr`) it also copies the words in **images** and **scanned PDFs** |

Results are **new files next to the original** (or in Downloads when that
folder can't be written, or always, if you choose it in Settings); nothing is
overwritten, and **Undo** on the island moves what was made to the Trash.
Several files dragged together get the actions all of them share.

Moving more than a few centimetres away closes the ring and the drag goes on
as if nothing happened, and letting go in its middle cancels. Over the island
itself the ring stays shut, so dropping files into Documents works as before. **Settings →
Drag actions** sets whether it opens when you hold still, press Alt or either,
how long to hold still, and where results go; the tray menu turns it off in
one click.

## Your own CRM

Open the **CRM** tab. Add people with **+**, or **••• → Import contacts…**
to bring them in from a CSV (Google Contacts or Outlook export, any
spreadsheet), an Excel file or a vCard (`.vcf`, from your phone). People who
are already there are filled in, not duplicated, and **Undo** takes an
import back.

- **People**: tap someone to see their page. Set them as a **Lead**,
  **Customer** or **Partner**; tap an email or phone number to copy it; log a
  **call**, **meeting**, **email**, **message** or **note** on their
  timeline; add **follow-ups** with a due date (Today, Tomorrow, Next week or
  any date and time) and **deals**.
- **Deals** shows your open pipeline and its total; move a deal through
  **New → Qualified → Proposal → Negotiation → Won / Lost** with one tap.
  Set your currency under **•••**.
- **Follow-ups** lists what's overdue, due today and coming up. When one is
  due, a card pops up on the island (date-only follow-ups at 9:00).
- **The agent**: the box at the bottom asks about what's on screen (on a
  person's page, about them). It can log calls, add follow-ups, update
  details and move deals for you. Its changes appear in a bar with **Undo**,
  which takes back everything it did in that answer (anything you changed
  yourself since is kept). Deleting anything asks you first.
- **••• → Export** saves contacts, deals or follow-ups as CSV in
  `~/Documents/Dynamic Island` (they show up in the Documents tab).

Everything is kept in `~/.config/dynamic-island-linux/crm/crm.json`, with a
copy each day for the last week in `crm/backups/`.

## Phone Drop: files from your phone

Send photos and files from your Android phone to this computer with a flick,
using the **Island Drop** app (in [`mobile/`](../mobile)).

1. Open **Settings → Phone Drop** and turn on **Receive files from your phone**.
   Pick where files go (Downloads, the Desktop or a folder).
2. Install the app on your phone: download `island-drop.apk` from the latest
   [Island Drop (Android)](https://github.com/Shashanksharma280201/dynamic-island-linux/actions/workflows/android.yml)
   run (open the run, then **Artifacts**), and open it on your phone (allow
   "install unknown apps" for your browser or files app once). To build it
   yourself, see [mobile/README.md](../mobile/README.md).
3. In **Settings → Phone Drop**, click **Show QR** and scan it with the app.
   Your phone and computer need the same Wi-Fi, or Tailscale on both.
4. Hold your phone next to the screen, hold a photo or file in the app, and
   move it toward the computer. The screen's edge lights up; let go (or flick)
   and it flies across into the island.

Only phones that scanned the QR can send. **Forget paired phones** makes a new
QR; phones paired before have to scan it again.

Once paired, the app is also **the island on your phone**:

- Anything waiting for your answer on the computer (Claude Code's permission
  requests, questions and plans, the assistant acting for you, your trading
  engine's trades) is on the app's **Island** tab and comes as a notification
  with its buttons. Answer it there or on the island; the other one updates.
  Allow notifications when the app asks.
- **Settings → Stay connected in the background** (on by default) keeps the
  link open with a quiet ongoing notification, so these reach the phone
  within seconds even when the app is closed.
- The app's **Claude**, **Inbox** and **More** tabs do what the island does,
  on the computer: talk to Claude Code, answer WhatsApp and mail, trading,
  notes, music, controls, the CRM, documents and services.
- To send a file to the phone, drag it from any app to the edge of the screen
  where your phone is (the side its files come in from; the right edge until
  it has sent one). The edge lights up and says **Send to <your phone>**; let
  go there. Or click the tray icon, then **Send a file to <your phone>…**. It
  lands in the app's **Files → Received**.

## Connect your trading engine

The **Connected** package shows the [Day-Trading](https://github.com/Shashanksharma280201/Day-Trading)
engine on the island: today's P&L on the capsule, each trade it wants to make
as a card you answer, and a **Trading** tab.

1. Start the engine on this computer (paper trading by default):
   `python3 -m daytrader.cli serve --feed replay --data data/sample.csv` to try
   it with sample data, or `--feed groww` for live Groww prices.
2. Open **Settings → Connected**, turn it on, keep the address
   `http://127.0.0.1:8765`, and paste the token from the engine's
   `state/api_token` file. It's tried before it's saved.
3. When a trade comes up, a card shows it with a countdown: **Buy** (or
   **Sell**) to approve, **Skip** to say no, or the approval shortcuts. No
   answer means no trade.

To approve from your phone too, start the engine with
`--phone-host <your Tailscale IP>`, then **Settings → Connected → Show QR** and
scan it with the Day-Trading Android app. Whichever device answers first wins.

Turn the tab and capsule off any time in **Settings → Packages → Connected**.

## Connect Spotify

Spotify only lets apps you register yourself use its Web API, so there's a
one-time setup (about a minute). Open Settings → **Spotify** and follow the
steps shown there:

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard),
   log in and click **Create app**.
2. Any name and description. Add the Redirect URI
   `http://127.0.0.1:43117/callback` and tick **Web API**. Save.
3. Copy the app's **Client ID** into Settings and press **Connect**. Your
   browser opens to log in to Spotify; after that the Music tab is ready.

Good to know (Spotify's rules since February 2026): the app's owner needs
Spotify **Premium**, an app can have up to 5 users, Spotify only lists the
songs of playlists you made or collaborate on (others can still be played as a
whole), and search returns up to 10 results per type. No password or client
secret is involved (OAuth with PKCE); your sign-in is stored encrypted with
your desktop keyring.

## Connect WhatsApp

1. Open **Settings…** from the tray menu and turn on **Show WhatsApp messages and
   reply from the island**.
2. Click **Restart now** (the island needs one restart the first time).
3. A QR code appears in the WhatsApp section. On your phone open WhatsApp →
   **Settings → Linked devices → Link a device** and scan it. Or type your phone
   number to get an 8-character code to enter on the phone instead.
4. It shows **Connected as …**. New messages now pop up on the island; click
   **Reply** to answer.

The login is remembered, so you only link once. **Unlink** in Settings logs the
island out (it also disappears from Linked devices on your phone).

## Add a mail account

1. Open **Settings…** from the tray menu, then **Add account** under Mail.
2. Type your email address. For Gmail, Yahoo, iCloud and Fastmail the server
   settings fill in automatically; for anything else enter your provider's IMAP
   and SMTP servers.
3. Enter an **app password**. With 2-step verification on (Gmail requires it),
   your normal password won't work; create one at
   [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   (Gmail) or in your provider's security settings.
4. Click **Test**, then **Save**. The dot next to the account turns green when it's
   connected.

New mail arrives instantly (IMAP IDLE). Replies are sent over SMTP as a proper
reply in the same thread and saved to your Sent folder. You can add several
accounts; each card then shows which account it's for.

## Start it automatically at login

Tick **Start at login** in the tray menu. This writes
`~/.config/autostart/dynamic-island-linux.desktop`; untick it to remove.
