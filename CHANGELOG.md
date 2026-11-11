# Changelog

What changed in each release of Dynamic Island. Download a release from
[Releases](https://github.com/shashanksharma280201/dynamic-island-linux/releases),
or install it with one command (see the [README](https://github.com/shashanksharma280201/dynamic-island-linux#download)).

## 0.9.0 (2026-11-11)

**Widgets, and a sharper brain**

- **The island as a widget, on any Android phone**: **Island** (4 by 1)
  shows the orb in its colour, what it's doing and which computer;
  **Island · Dots** (2 by 2) shows the same in black and white dot matrix,
  in the style of Nothing phones, with a red dot when something needs you,
  and fits a Nothing lock screen. Add them from More → Settings → Widgets.
- **On the lock screen**: with Stay connected on, the quiet ongoing
  notification is the island in one line ("Orbit · 2 waiting for you"),
  with no project names; on Android 16 it's a Live Update with a chip in
  the status bar. On a Nothing phone, Settings shows how to keep a Glyph
  light on for approvals.
- **A calmer phone app**: no more screens sliding in, cards springing or
  badges zooming. Tabs switch at once, a pushed screen slides in quickly,
  a press dims, and the tab bar holds still. Motion is left where it says
  something is happening: the orb, files flying, the link's capsule.
- **Brain search by meaning, section by section**: each section of a note
  is read on its own, so a fact deep in a long note (a line in a log, a
  message in a chat) is found as easily as one at the top, and a note found
  this way shows the section that matched. The model is now gte-small
  (34 MB), chosen by comparing small models on a test vault: the right note
  first for 84% of questions (61% before) and every fact deep in a long
  note (1 in 7 before). With search by meaning on, it downloads on the next
  start and your notes are read again in the background.

## 0.8.0 (2026-11-09)

**The orb on your phone**

- **The island's orb on the Island Drop app**: the phone's Island tab opens
  on the same dotted orb as your computer, in its colour (or the one you
  picked), with the mood's ring, its name and what it's doing ("2 waiting
  for you", "At work" and the project, "Offline"). "Hold to talk" uses its
  name. It draws a few times a second at most, and not at all in the
  background.
- **A cleaner phone app**: More is a grouped list with a drawn icon and a
  line for every item; drawn icons replace the last typed marks (ticks,
  the approval cards' marks); missing album art shows a music icon;
  Today's date is in words; the link's figure moved to Settings; a
  permission card's command is readable in the light theme.
- **Side edges fixed**: docked on the left or right, the island is where
  it belongs from the moment it starts (it showed at the top for a few
  seconds first), and the open panel stays still as you switch sections,
  instead of moving its row of icons out from under the pointer.

## 0.7.0 (2026-11-09)

**One island**

- **One island, opening in one movement**: clicking the island grows it into
  the panel as a single shape (the separate column of icons beside it is
  gone). Its sections are a row across the top: drawn line icons, the open
  one lit in your accent, names under the pointer, counts and a running dot.
  The panel is a little wider so they all fit, and a new section slides in
  from the side you went.

## 0.6.0 (2026-11-09)

**At the top, in orbs**

- **The island starts at the top centre**, like a Mac's (it was on the right
  edge). Drag it to an edge, or pick Left, Top or Right in Settings → General;
  where you put it is kept.
- **Ubuntu's top bar hides like a Mac's menu bar** (Settings → Desktop →
  Hide Top Bar, **Get it**): always hidden, and back while you push the
  pointer against the top edge or open the overview. The island moves to the
  top centre where the bar was. Its switch turns it off with its settings put
  back, and Undo puts back everything.
- **Orbs instead of faces**: Orbit, Bolt and Puff are dotted orbs (coral,
  blue with fine dots, pink with soft dots, or the colour you pick). Resting,
  each is a globe of dots turning slowly; it moves the way the agent works,
  with the ring around it in the mood's colour. The faces, hats and outfits
  are gone; right-click the island to change its colour.
- **Orbs easier to see**: bolder dots on the small ones, the dots at the back
  no longer fade into the glass, and on the light island they're drawn in a
  deeper shade (white dots used to vanish there).
- **No emoji**: Claude's mark, the morning and evening cards, the command
  bar, The Agency's agents, WhatsApp's photo and voice labels, Notion pages
  and the phone app use drawn icons, initials or words.
- **Lighter at rest**: with the orb always showing, the resting island uses
  about half the processor it did in 0.5.0 (measured without a graphics
  card: 6.4% of one core, down from 14.2%). Orbs are drawn on a timer only
  when a frame is due (they used to wake on every screen refresh), each
  frame paints its dots in a handful of fills, the resting orb draws 10
  frames a second and busy ones 24, nothing else moves while it rests, and
  the pointer is checked four times a second instead of fifteen.
- Switching parts of the desktop look on and off quickly no longer loses what
  Undo puts back (changes to the look now happen one at a time).

## 0.5.0 (2026-11-08)

**Island OS: your computer as one AI**

- **This computer first**: when Ollama is running, answers are made here
  (free, nothing leaves); the cloud answers only after your yes, or always,
  or never (Settings → Model). Every answer says where it ran, how long it
  took and what it cost, with **Ask cloud** beside it.
- **Sources**: GitHub (through `gh`, read only), your terminal's history
  (secrets taken out), a calendar, screen time (app names, never pictures)
  and Codex and Gemini sessions, each off until you turn it on, kept as one
  note per day in the brain.
- **Today**: the one thing, your day by hour, what's next, and “what did I
  do last week?” answered with numbered sources.
- **Agents**: research over your brain, monitors (“tell me when PR #43 is
  reviewed”), and the roster that keeps people, promises and projects up to
  date.
- **The Agency**: hundreds of specialist agents, downloaded when you ask, to
  start in Claude or a terminal or install into Claude Code.
- **Agent Skills**: Anthropic's skills for Claude Code (documents, design,
  testing web apps and more), downloaded when you ask and installed a whole
  folder at a time, each credited with its own licence.
- **The resting island** counts the notes waiting to be filed, and on hover
  says the time, that count and what's next today.
- **Today and Agents on your phone**, in the Island Drop app under More.
- **Voice**: call notes made out on this computer (audio deleted), the
  morning brief out loud, and talking over the buddy to stop it.
- **A more modern look** for the island, Settings and the phone app.
- **On a Mac and Windows too**: call notes (the default input on a Mac,
  plus BlackHole when you have it; a microphone and Stereo Mix on Windows),
  screen time (app names on a Mac; Windows sees titles too), PowerShell
  history, and `gh` and ffmpeg found where Homebrew and winget put them.

**What was kept quiet, and the rest of Ubuntu**

- **An evening digest**: once a day (18:00 at first) the island shows what
  the buddy didn't say out loud and what wasn't urgent, with the
  notifications you didn't get to, by app. **Quiet hours** are yours to set
  (Settings → Buddy). [The guide](docs/buddy.md#beyond-questions).
- **Notification summaries**: one line when Do Not Disturb ends; the stack
  names the apps waiting; a busy app says who it's from; **Sum up** puts the
  whole list in a few sentences with your AI.
- **Talk to the buddy from your phone**: hold to talk in Island Drop, and
  the buddy answers out loud on the computer.
- **The brain keeps WhatsApp, mail and notes from your phone**, each off
  until you turn it on; what people wrote is kept as data, never
  instructions. [The guide](docs/brain.md#what-it-captures).
- **Blur my Shell and Just Perfection** in Settings → Desktop, from
  extensions.gnome.org, turned on with the look and undone with it.
- **The login screen and boot splash** in the island's look (with your
  password): the accent, light or dark, and the island's orb while Ubuntu
  starts. [How it works](docs/desktop.md).

**Ubuntu, the island's way**

- **Settings → Desktop → Make Ubuntu match the island**: light or dark and
  the accent colour for all of Ubuntu (its own Yaru themes), following the
  island as they change, with the Dock at the bottom like macOS's and,
  if you like, window buttons on the left. Plain gsettings, no password;
  **Undo** puts back exactly what was there.
- **The command bar** (Ctrl+Alt+K): open apps (with their icons), files you
  had open, notes and settings; work out sums; “dark mode”, “volume 40”,
  “lock”, “wallpaper misty forest”; or ask the buddy or Claude.
- **The System package** for the assistant: open an app, set the volume, go
  light or dark, Do Not Disturb, lock the screen; each one asks first.
  [How it works](docs/desktop.md).

**The Jarvis layer: the buddy in front of the real work**

- **Hands real work to the assistant** and follows it: “how far is it?”,
  “stop”, “actually, use vitest” steer it; it says when it's done.
- **Say yes or no** to a permission prompt from Claude Code or the
  assistant.
- **Offers, then acts on your yes**: keep a fact about you (into your
  brain's `00-me`), click something it can see (pointed at first), or
  type for you.
- **Speaks up, sparingly**: a session waiting on you, a permission prompt,
  finished work; never in quiet hours, never twice in three days.
- **Routines** (Settings → Buddy): standing orders the assistant runs at
  their time, still asking before it sends or changes anything.
- **“Hey <name>”**, off by default, heard on this computer.
  [The guide](docs/buddy.md#beyond-questions).

**Search by meaning**

- Settings → Second brain → **Search by meaning**: a small model on this
  computer (23 MB, downloaded once) reads your notes, so a search finds the
  ones that say it in other words too. Every AI's brain search uses it,
  fused with the keyword ranking. Private notes are never read.
  [How it works](docs/brain.md#search-by-meaning).

**The loop: your brain keeps itself up to date**

- Five jobs, listed in Settings → Second brain with how each last went:
  **your commits** (each evening, kept as a source), **the evening filing**
  (where each inbox note should go; nothing moves until you press Apply,
  and Undo puts it back), the **daily signal** (five lines on your day),
  the **weekly signal** (patterns with counts, on Sundays) and the
  **morning card**.
- **The morning card**: the one thing for today, why, and a draft if it's a
  message, waiting on the island. **Send** hands the draft to the assistant
  (which still asks before sending, on the island and your phone),
  **Edit** opens it in the Claude tab, **Hold** brings it back in three
  hours.
- A job the computer slept through runs when it wakes. A job that didn't
  run says so, and one that failed says why; nothing shows as fine that
  isn't. Each can be turned off or run now. [How it works](docs/brain.md#the-loop).

**The buddy: ask about your screen, out loud**

- Press **Ctrl+Alt+B** and ask: “where do I change the wallpaper?”, “walk me
  through setting up a printer”. Your character answers out loud, with
  captions on the island, and an arrow flies from the island to the spot.
  A walkthrough goes one step at a time: say “next” or press **Next**;
  “stop” and “say that again” work too. [The guide](docs/buddy.md).
- It looks at a screenshot taken when you ask, with **private windows**
  (password managers, private browsing, your bank…) blacked out before it
  leaves; its answers use your second brain, and each question can be kept
  in the brain's inbox.
- **Its voice**: Kokoro, a natural voice that runs on this computer
  (downloaded once, about 92 MB, with espeak-ng for pronunciation), the
  system's voice, or captions only. **Settings → Buddy** has the voice,
  speed, tone, the private-window words and **Hear it**.
- Settings → Privacy lists what it sent, and **Pause AI and the web** stops
  it looking.

**A look closer to macOS**

- **The icon rail works like the Dock**: icons grow under the pointer (their
  neighbours a little), show their name beside them, bounce when their count
  goes up, and a dot marks what's running (music playing, Claude working,
  sessions, a connected service). Reduced motion turns the movement off.
- **Control Center** is laid out like macOS: Wi-Fi and Bluetooth in one
  module, Do Not Disturb and a Wallpaper tile beside it, the sliders below.
- **Banners** put the app's icon large on the left with the words beside it;
  the close button shows on hover.
- **Settings is laid out like System Settings**: a sidebar with coloured
  icons in groups, one pane at a time, and a search field that finds any
  setting by its name and takes you to it.
- **Light and dark**: Settings and the island follow Ubuntu's own style
  (Settings → Appearance → Style) as it changes, or stay Light or Dark
  (Settings → General → Light or dark). In light, the panel, the Dock and
  the cards are pale glass like macOS's; **Island colours → Always dark**
  keeps the island black like a notch. Spotify keeps its own dark look.
- **Accent colour**: eight, as on macOS, for buttons, links and what's
  selected, on the island and in Settings.

**Privacy**

- **Settings → Privacy** lists what has left this computer, where it went
  and when: your questions to the assistant, session summaries for your
  brain, wallpaper searches and downloads, and services checking your
  accounts. It says what was sent, never what it said, and stays on this
  computer for 30 days.
- **Pause AI and the web** stops all of that until you turn it off.
  Session notes are written without an AI meanwhile; WhatsApp, mail,
  Spotify and an AI on this computer (Ollama) keep working.

**Wallpaper by asking**

- Ask the assistant (typed or spoken): “set my background to misty mountains
  at sunrise”, “make it a video of rain on a window”, “another one”, “put
  the old one back”. It finds a match on the web, downloads it to Pictures ›
  Dynamic Island Wallpapers and sets it.
- **Settings → Wallpaper**: search photos and videos, five live animations
  (Soft glow, Aurora, Waves, Starfield, Gradient), recent wallpapers,
  Previous, and the desktop's own background back.
- Photos and videos from Openverse and Wikimedia Commons with no setup, and
  Pexels, Unsplash and Pixabay with your free keys. Every wallpaper keeps
  its credit and licence.
- Videos and animations play live behind everything and rest while a window
  covers the screen or on battery.

**A second brain for you and every AI you use**

- **Settings → Second brain** makes a folder of plain notes (`~/Brain`, in
  the Living Brain layout) that Claude Code, Codex, Gemini CLI and the
  island's assistant all share. Open it in Obsidian; it keeps its own git
  history. [The guide](docs/brain.md).
- **Settings → You**: four short notes about you (profile, how you work,
  goals, how you write) become the brief every AI loads. **Interview me**
  has Claude Code ask you about yourself and write them.
- **Connect Claude Code** in one switch: your brief in `CLAUDE.md`, the
  project's page and last sessions at the start of each session, and the
  brain's tools (search, read, capture, decisions, promises) over MCP.
  Switching it off undoes it.
- **Every Claude Code session gets a note**: five lines (shipped, decided,
  promised, the number, next), filed with its project.
- **Find my projects** drafts a page for each project from your Claude Code
  history and git; keep the ones you want from the inbox.
- `08-restricted/` stays private: no tool, index or search reads it.

**Island Drop: a new look, light and dark, and a steadier link**

- A cleaner design throughout: one type scale, grouped settings lists, line
  icons instead of symbols, calmer buttons and cards, and a proper welcome
  screen with the three steps to pair.
- **Light and dark**: Settings → Appearance: System (follows the phone),
  Light or Dark, with pictures of each.
- **Fig. 1, the link**: the Island tab opens with an isometric drawing of
  your computer and phone on one bench, joined by a glass tube, built with
  the kit from Anatomy (github.com/wheresryan22/anatomy, MIT). A capsule runs
  along the tube while files go, the lamp shows whether they can reach each
  other, and a dial gauge reads the round trip. Tap it to test the link. It
  only moves while it's on screen.
- **Staying connected**: the app reconnects as soon as the phone's Wi-Fi
  changes, follows the computer when its address changes (it tries every
  address it knows, then looks across the Wi-Fi), and learns the computer's
  other addresses (Wi-Fi, Tailscale) each time it connects. Settings →
  Connection shows the route, address and round trip, with **Test the
  connection** and **Find my computer again**.

**Lighter: far less CPU and memory**

- At rest the island used most of a CPU core; it now uses about a fifth of
  what it did. The character's orb drew 60 frames a second, each one also
  redrawing the island's large soft shadow. Now the shadow sits on the
  island's boxes (it looks the same and isn't redrawn), the resting orb
  drifts at 20 frames a second and busy orbs at 30 (following your voice
  still gets every frame).
- While you're away from the computer (a minute without the keyboard or
  mouse) or its screen is locked, the orbs stop drawing altogether; they
  carry on the moment you're back.
- The mail, Word, PDF and AI libraries load the first time they're needed
  instead of at startup: about 40 MB less memory and a quicker start, more
  if you don't use mail or the assistant.
- The drag actions ring, the Phone Drop light and the "Send to phone" strip
  close after three minutes unused (each was a hidden window of 60 to 100
  MB kept for good); they open again in a moment with the next drag.
- The island looks at the pointer less often while it's far away, so the
  computer wakes up less.

**Phone Drop: any files, both ways**

- Up to 500 files at once (it was 20), from the phone or to it.
- Hidden files keep their names: `.env` stays `.env`.
- Whole folders, both ways. Drag a folder to the phone's edge, or use **Send
  a folder to <your phone>…** in the tray menu; on the phone, **+ → A
  folder**. It arrives as the same folder with its folders inside it, called
  "Name (2)" if one by that name is already there. The island shows one card
  for it, counting the files in; the phone shows them coming in as one card
  too and keeps the folder as one entry in **Received**, which opens to list
  its files.
- A long send no longer gives up on files the phone hasn't got to yet: they
  wait while any of the others are still moving.

**Phone Drop: a ribbon of light**

- The colour is now a ribbon of light, red and orange through yellow and
  green to blue, in soft lighter shades: it curls around the light at the
  edge while a file is on its way, and when the file comes out it flows
  across the screen as a smooth rippling wave, with a lighter echo behind
  it, and fades. Sending a file to the phone draws it in toward the edge.
  On the phone too. No more rings of colour.
- Quitting the island while your phone is connected no longer stops on an
  error box.

**Island Drop 3: everything the island does, on your phone**

- The app now has the rest of the island: a **Claude** tab to talk to Claude
  Code on your computer (its steps and reply as they come, Stop, New, your
  plan's limits); an **Inbox** with your WhatsApp chats and mail to read and
  answer, and the computer's notifications (clear, Clear all, Do Not
  Disturb); and **More**: Trading (positions, today's trades, Stop trading
  today / Close everything), Notes, Music (Spotify search, playlists, where
  it plays), Controls (volume, brightness, mute, Wi-Fi, Bluetooth), CRM
  (follow-ups, people, log a call, deals), Documents (convert, merge PDFs,
  page numbers, send a file to the phone) and Services.
- It all runs on the computer through the island's own functions, and what
  changes there (Claude's reply, new mail, the trading view) shows on the
  phone as it happens.
- Only a paired phone can use them, and only those: the island checks every
  call and its arguments.

**Island Drop 2: the island on your phone, and files both ways**

- Answer from your phone: Claude Code's permission requests, its questions
  and plans, the assistant's "about to act for you" and your trading engine's
  trades show up in the app and as phone notifications with **Allow** /
  **Deny** (or **Buy** / **Skip**) buttons. Answer on the phone or on the
  island, whichever is nearer; the other one updates at once, and a
  notification disappears as soon as it's answered anywhere.
- The app now has the island's other parts too: what's playing with its
  controls, today's P&L, your Claude Code sessions and the computer's
  notifications (also as phone notifications, if you want).
- Files go the other way as well: drag a file from any app to the edge of the
  screen where your phone is (the side its files come in from). The edge
  lights up as you get near, following the pointer, and says **Send to <your
  phone>**; let go and the file is pulled into the light. On the phone, the
  edge that faces the computer lights up and the file comes out of the glow
  into **Received** (photos and videos also land in the gallery's **Island
  Drop** album). Or use **Send a file to <your phone>…** in the tray menu.
- Smoother everywhere: the lifted file, the glow and the flick now run on the
  phone's UI thread (Reanimated), with springs and haptics; a new tab bar,
  cards that slide in and out, and a background link that keeps approvals
  arriving within seconds.

**Drag actions: every kind of spreadsheet, and text from any document**

- **Convert** now takes every kind of spreadsheet (Excel, OpenDocument `.ods`,
  CSV, TSV, and old `.xls` with LibreOffice) to Excel, CSV, PDF, Word (as a
  table), JSON (one object per row, named by the first row), Markdown or a web
  page.
- **Copy text** works on any document: OpenDocument, RTF, web pages, code,
  JSON, logs and other text files as well as PDF, Word and slides (old `.doc`
  and `.ppt` with LibreOffice). With tesseract installed it also copies the
  words in images and scanned PDFs.

**Island Drop: Share -> Island Drop**

- Island Drop now appears in Android's share sheet: share photos, files or a
  link from any app and it opens already lifted, to flick toward your computer
  (or send with a tap). Several files go across as one drop.

**Phone Drop: files from your phone, with a glow**

- Flick photos and files from your Android phone to this computer with the new
  **Island Drop** app: hold a file and move it toward the side of the phone
  that faces your computer. That edge of the screen lights up, white with a
  ring of colour; let go and the file comes out of the light, a band of colour
  sweeps across the screen, and the file flies into the island, which shows it
  to open, show in its folder, undo or drag out.
- Turn it on in **Settings → Phone Drop** and pair with its QR. Only paired
  phones can send; files are saved to Downloads (or the Desktop, or a folder
  you pick) and never over another file. Big files carry on in the island
  with a progress bar.
- The app's APK is built by GitHub Actions (**Island Drop (Android)**).

**Connected: your trading engine on the island**

- A new **Connected** package shows a service you run (the first one is the
  [Day-Trading](https://github.com/Shashanksharma280201/Day-Trading) engine)
  right on the island: today's P&L on the capsule, every trade it wants to make
  as a card with **Buy / Skip** and a countdown, and its own tab with open
  positions, today's trades and **Stop trading today**.
- Only your click (or the approval shortcut) answers a card. No answer before
  the countdown ends means no; the island's assistant can read what it shows
  but can't answer for you.
- Set it up in **Settings → Connected** (address and token, tried before
  they're kept; the token is encrypted). The same section shows a QR to pair
  the Day-Trading Android app with the same engine.
- Everything shown comes from the service, so it can change what you see
  without a new island release (protocol in Day-Trading's
  `docs/island-protocol.md`).

**Drag actions on macOS and Windows**

- Drag actions now work on a Mac and on Windows too: drag a file in any app,
  hold still (or press Option / Alt), and the ring opens under the pointer.
- On a Mac the ring opens with its actions at once, and needs no permission:
  it notices drags through the system's drag pasteboard.
- On Windows it opens for drags that show Windows' drag image under the
  pointer, from File Explorer, browsers and most apps.
- Fixed: a drop with a Windows path (`C:\Users\…`) was ignored.

## 0.4.0 (2026-10-22)

**Drag actions**

- Drag any file, in any app, and hold still for a moment (or press **Alt**): a
  ring of six actions opens under the pointer. **Convert** (PDF, Word, Excel,
  CSV, Markdown, text, PNG, JPEG, WebP), **Edit** with Claude, **Capture** an
  image, **Ask Claude** to summarize, translate or explain it, **Shrink** a
  photo or PDF, and **Copy text**. Let go on one and it runs.
- The island shows it working, then the file it made: **Open**, **Show in
  folder**, **Undo**, or drag it straight out of the island. Results are new
  files next to the original; nothing is overwritten.
- Move away or let go in the middle and the drag carries on as usual.
- **Settings → Drag actions** (hold still, Alt or either; how long; where
  results go) and a switch in the tray menu. Linux with X11 for now.

## 0.3.0 (2026-10-15)

**Installing on a Mac**

- A Mac said the downloaded app "is damaged and can't be opened". The Mac
  downloads now include a `.pkg`: open it, click **Open Anyway** once in
  System Settings → Privacy & Security, and it installs and starts the island.
  The one-line install command is still the easiest way on a Mac, and the
  README says how to use the `.dmg` too. (The app isn't signed with an Apple
  Developer ID yet; once it is, the `.dmg` opens normally.)

**Claude Code, live from your terminals**

- Every Claude Code session you run in a terminal shows on the island while it
  works: your character with an orb for what it's doing and a step count, or
  how many sessions are working. A card pops up when one needs you, and when
  one finishes, with its last answer, how long it took and what it changed
  (**+12 −3**). **Open terminal** brings its window to the front.
- New **Sessions** tab: every session with its status and changes; open one to
  see its steps and the diff of every file it touched.
- Answer Claude's **questions** on the island, one at a time, picking options or
  typing your own answer, and read its **plan** before you let it start.
- If you had approvals on, the island adds the new session hook by itself.
- **Codex, Gemini CLI and Cursor Agent** sessions can show too: turn each on in
  Settings → Claude. Their steps read the same way ("Running npm test",
  "Editing app.ts").

**Fixes**

- After you used the icons beside the panel and closed it, an invisible strip
  under the island could keep catching clicks meant for the app below. Gone.
- Typing in a card no longer leaves the island's content shifted.

**Notifications**

- **Clear all**: when several notifications wait on the island, a pill says how
  many and clears them all at once, with **Undo**.
- New **Notifications** tab with everything that arrived, grouped by app, kept
  between restarts. Dismiss one (× or swipe), clear an app, or clear all.
- **Do Not Disturb** in the tab, the Control Center and the tray: nothing pops
  up, and the resting island shows a moon with how many are waiting.

**Easier to use**

- **Show me around:** a one-minute tour on the island with example cards. It's
  offered the first time, and is in the tray menu and Settings any time.
- Cards that close by themselves show a thin countdown. It stops while you
  hover, and the pin keeps the card until you close it.
- **Change any shortcut** in Settings → Keyboard shortcuts: click it and press
  the new keys. Keys another shortcut (or another app) already uses are refused,
  with why.
- **Shortcuts** in the Control Center lists them all, as they're set now.
- **Open on hover** (Settings → General): rest on the island and the panel
  opens, no click needed.
- **Island lives on** (Settings → General): the main display, the display with
  the pointer (it follows you between screens), or a monitor you pick. A
  monitor is found again after you replug it.

**Dictate anywhere**

- Press **Ctrl+Alt+D** in any app and speak: what you said is typed into that
  app (terminals included) when you stop talking, or press it again. Speech is
  recognised on this computer. A pill under the island shows your voice as you
  speak. Turn it off or change the keys in Settings.

**Claude Code, continued**

- Answer Claude's questions from the keyboard without leaving your app:
  **Ctrl+Alt+1…9** picks an option, **Ctrl+Alt+Y** moves on or sends.
- If a request waits on the island too long, Claude asks in the terminal
  instead, and the island now says so as the card goes.
- **Attach the window you were in:** the paperclip in the Claude tab adds a
  screenshot of the app you opened the island from (and its title) to your
  next message, so Claude can see what you mean.

**Services and your week**

- New **Services** tab: GitHub, Vercel, Stripe, Resend, Notion, Cal.com and
  n8n, each with its own card. A failed deploy, CI breaking on your pull
  request, a review request, a new payment or a failed workflow pops up on the
  island. Set them up in Settings → Services; keys are stored encrypted.
- **Weekly recap:** on Monday mornings, last week with your coding agents at a
  glance, with an image to share. From the tray any time, too.

**Your character**

- **Wardrobe:** 13 outfits (beanie, cap, crown, headphones, glasses,
  sunglasses, bow tie, party hat, flower, Santa hat, witch hat, top hat, scarf)
  and a **Seasonal** one that changes with the date, plus a body colour. Pick
  them in Settings → Character, or right-click the island.
- **On your desktop too:** the character can sit on the desktop, acting out
  what's going on (working along with Claude, waving when something needs you,
  dancing to music, dozing when it's quiet). Drag it anywhere; click it to open
  the island.
- **Your own sounds:** put a file named after a sound (done.mp3, ask.wav…) in
  the sounds folder (Settings → General → Sounds) and it plays instead.

**Looks**

- Dotted "thinking orbs" show what's going on: on the capsule and the cards
  while Claude works (a different motion for searching, editing, running),
  around your character while you talk, and wherever something is loading.

## 0.2.0 (2026-10-08)

**A livelier island**

- The island opens and closes with springs you can interrupt halfway, and its
  content swaps without blinking.
- **Peek:** rest the pointer on the island and it shows one line about what's
  going on (Claude's current step, the song playing, or "Ask Orbit anything").
  Keep resting and the full card opens.
- Characters show their mood with a coloured ring, breathe when idle, follow
  your pointer with their eyes and bob along to music. Boop one in the Claude
  tab; boop it three times quickly and it gets dizzy. It says hello once a day.
- **Mochi is now called Puff.** Your settings move over by themselves.
- In the panel, the selected tab slides between icons, and a new tab slides in
  from the direction you went.
- Optional sounds, off by default: Settings → General → Sounds.

**Claude Code**

- Answer permission requests from any app: **Ctrl+Alt+Y** allows, **Ctrl+Alt+N**
  denies, **Ctrl+Alt+A** always allows. Requests waiting behind the first one
  peek out below the card.
- Claude's steps roll by in the peek ("Reading 3 files", "Editing styles.css
  +12 −3"), the capsule counts them, and the working card lists the last few.

**Files**

- Drag files onto the island and it opens a pocket; drop them and the character
  swallows them while they're added to Documents.

**Install and uninstall**

- One command installs or updates it on Linux, macOS and Windows, and checks
  the download first. See [Download](https://github.com/shashanksharma280201/dynamic-island-linux#download).
- **Uninstall** from the island's menu, Settings → General, or `--uninstall`:
  removes the app, starting at login, the Claude Code setup and, if you choose,
  all your data.
- Every release has a `SHA256SUMS.txt` to check the files against.
- Windows: the installer no longer quits without installing now and then on
  Windows 11 24H2 and later.
- Ubuntu 24.04: the .deb sets up the AppArmor profile the app needs there.
- macOS: the app is signed properly (no more "damaged" message) and has its own
  menu bar icon.

## 0.1.0 (2026-10-02)

The first release, for Linux, macOS and Windows: the island with Now Playing,
WhatsApp and mail (with replies), desktop notifications, the Control Center
panel, Claude Code approvals and plan limits, talking or typing to Claude Code,
any AI provider, Documents, the CRM and Spotify.
