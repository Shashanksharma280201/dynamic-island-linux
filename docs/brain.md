# Your second brain

One memory for you and every AI you use, kept as plain notes on your own
computer. Claude Code in any terminal, the island's assistant, Codex and
Gemini CLI read it to know who you are and what you're working on, and add
what they learn. It follows the
[Living Brain](https://skool.twohourceo.com/living-brain/) method: own the map,
rent the model. The plan behind it is in
[research/island-brain-and-buddy.md](research/island-brain-and-buddy.md).

## Make it

**Settings → Second brain → Make my brain.** It makes `~/Brain` (or a folder
you choose; an existing Obsidian vault works too, and its notes are kept):

| Folder | What goes in it |
|---|---|
| `00-me/` | Who you are: `profile.md`, `preferences.md`, `goals.md`, `voice.md`. Every AI loads the brief built from these. |
| `01-inbox/` | Every capture lands here first. |
| `02-projects/` | One folder per project: its page (`<name>/<name>.md`) and its `sessions/`. |
| `03-areas/` | The parts of your life and work, one hub note each. |
| `04-resources/` | Reference: setups, how-tos, snippets. |
| `05-archives/` | Finished things, never deleted. |
| `06-brain/` | Distilled notes only. |
| `07-world-model/` | People, orgs, products, `decisions/` (dated, never edited) and `ledgers/` (promises, predictions). |
| `08-restricted/` | Private. No AI, search or index ever reads it. |
| `09-sources/` | Raw captures, such as what was said in each Claude Code session. |
| `_system/` | The machinery: `brief.md`, `index.md`, `log.md`. |

`AGENTS.md` at the top holds the rules every AI follows there. The folder is
a git repo of its own, so every change the island makes can be undone with
git. Open it in [Obsidian](https://obsidian.md) (Open folder as vault) to
read, link and edit your notes. Nothing depends on Obsidian running.

## Tell it who you are

**Settings → You.** Edit the four notes there, or press **Interview me**:
Claude Code opens in a terminal in the brain folder, asks you about fifteen
questions one at a time, and saves the four notes when you agree.

**Your brief** (`_system/brief.md`) is built from them and your active
projects, and kept under 6,000 characters so it always loads whole. **Show**
displays it.

## Connect your AI tools

**Settings → Second brain → Connect your AI tools.** Each switch shows what it
changes, backs up every file before changing it (`.bak`), and switching it off
undoes it.

- **Claude Code**:
  - adds `@~/Brain/_system/brief.md` to `~/.claude/CLAUDE.md`, so every
    session knows you;
  - adds two hooks to `~/.claude/settings.json`: at the start of a session
    Claude gets this project's page, its last three sessions and your open
    promises; at the end, the session is queued to be filed (this works
    even when the island isn't running; it's filed when the island next
    starts);
  - adds the brain's tools as the `brain` MCP server (user scope), so Claude
    can search the brain, read notes, look up a person or project, and add
    to the inbox, decisions and promises. They're allowed without a prompt,
    because they only read or add.
- **Codex CLI** and **Gemini CLI**: your brief, kept up to date, in
  `~/.codex/AGENTS.md` and `~/.gemini/GEMINI.md`.
- **The island's assistant** always has the brief and the tools while the
  brain is on.

The brain's tools listen on `127.0.0.1` only (port 47823, or the next free
one) and need a key, which the island keeps in its own folder.

## What it captures

- **Every Claude Code session** (Settings → *File a note for every Claude Code
  session*): when a session ends, or goes quiet for half an hour, it gets a
  note with five lines: what shipped, what was decided, what was promised,
  the number that matters, and the next step. The note goes to the
  project's `sessions/` folder, or to the inbox until the project has a page.
  What was said is kept in `09-sources/claude-code/`.
  - **Written by your AI**: the session is sent to the island's AI (Settings →
    AI) to write the five lines; when that's Claude Code, it uses Haiku and
    leaves no session of its own. **Plain** writes the note from the session
    alone (what you asked, what changed, how it ended) and sends nothing.
  - **Never file sessions from**: folders whose sessions stay out.
- **Find my projects** reads your past Claude Code sessions and the git
  history of their folders, and drafts a page for each project in the inbox:
  what you worked on, recent commits, the files you touch most.
- **The inbox**: **Keep** files a note where it suggests (a kept project takes
  its waiting session notes with it); **Archive** moves it to `05-archives/`.

## Search by meaning

Brain search finds notes by their words. Turn on **Search by meaning**
(Settings → Second brain) and it also finds notes that say it in other
words: a small model (all-MiniLM-L6-v2, 23 MB, downloaded once from Hugging
Face) reads each note on this computer and keeps a vector for it in
`_system/index/`. Every search (yours, Claude Code's, the buddy's) then
fuses the two rankings. New and changed notes are read a few at a time in
the background; `08-restricted/` never is.

## The loop

Jobs that keep the brain up to date without you, listed in Settings → Second
brain with how each last went:

| Job | When | What it does |
|---|---|---|
| Your commits | Every evening, 20:45 | Today's commits in your projects' repos (the folders on their pages), kept in `09-sources/git/` |
| Evening filing | 21:00 | Where each inbox note should go: people to `07-world-model/people`, notes about a project to its folder, ideas and facts to `06-brain` shelves, questions to the buddy to `04-resources/asked`. **Nothing moves until you press Apply**, and Undo puts them back |
| Daily signal | 21:15 | Five lines on your day (shipped, decided, promised, the number, next) in `06-brain/signals/daily/` |
| Weekly signal | Sundays, 21:30 | Three to five patterns in your week, each with a count, in `06-brain/signals/weekly/` |
| Morning card | 06:30 | The one thing for today, why, and a draft if it's a message. It waits on the island: **Send** hands the draft to the assistant (which still asks before sending), **Edit** opens it in the Claude tab, **Hold** brings it back in three hours |

A job the computer slept through runs as soon as it wakes. Each says how it
went; one that didn't run says "Not run yet", and one that failed says why.
The signals and the card are written by the AI that writes your session
notes, or plainly (counts, your oldest open promise) without one. Turn any
job off, or run it now, in Settings.

## Privacy

The brain is plain files on your computer and the island never uploads it.
An AI you use sees the parts it reads: your brief, the notes it searches, and
(when *Written by your AI* is on) the sessions it summarises. Claude, for
example, sends those to Anthropic. `08-restricted/` is never read by any tool,
index or search. Captured material is marked as data, never instructions,
and AI tools can only add to the inbox, decisions and ledgers, never edit
your other notes.

## Coming next

The [plan](research/island-brain-and-buddy.md#the-roadmap): the Jarvis
layer, and Ubuntu as an AI OS.
