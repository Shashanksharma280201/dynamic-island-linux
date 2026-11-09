# Island OS

Your computer as one AI: it knows what you did, helps with what's next, and
keeps all of it on this machine. Three promises run through all of it:

- **This computer first.** A model on this computer (through
  [Ollama](https://ollama.com)) answers when it can. The cloud answers only
  after your yes, or as you set it.
- **It remembers what you let it.** Every source is off until you turn it
  on, and turning one off forgets what it kept.
- **It asks first.** Nothing is sent, deleted or run without your Allow.

## The model (Settings → Model)

Install Ollama and pull a model (`ollama pull llama3.2`), then **Look again**.
The island picks a small model for every day and the largest you have for
research; pick others if you like.

**The cloud** is the AI in Settings → AI:

- **Ask me** (the default): a question you ask waits for your yes before it
  goes. Background jobs (session notes, the signals) use it only when this
  computer can't answer.
- **Always**: anything this computer can't answer goes without asking.
- **Never**: nothing goes.

**Each job** can choose its own place: auto (this computer first), always
this computer, or always the cloud.

Every answer says where it ran, how long it took and what it cost, like
`local model · 1.4 s · 0 ¢`, with **Ask cloud** beside it. When you often ask
the cloud again for one kind of question, it learns to send that kind there
first (turn this off with **Learn where questions go**). What it learns from
stays in `engine-traces.json` in the island's profile folder. The week's
answers and cost are at the bottom of the page.

## Sources (Settings → Sources)

| Source | What it keeps | How |
| --- | --- | --- |
| GitHub | Your pull requests, reviews, issues, pushes and releases | Through your own `gh` login (read only), hourly. Install the [GitHub CLI](https://cli.github.com) and run `gh auth login` (found in Homebrew's and winget's folders too) |
| Terminal | The commands you ran | bash, zsh, fish and PowerShell history, from when you turned it on. Passwords, tokens and keys are taken out first; trivial commands (`ls`, `cd`), commands started with a space, and anything with a word you list are left out |
| Calendar | Your events | A `.ics` file, or an https address (Google Calendar: Settings → your calendar → Secret address in iCal format) |
| Screen time | Which app was in front, per hour | Never screenshots; not while you're away; never windows with a private word (Settings → Buddy). Linux (X11) and Windows see the window's title for that; a Mac sees only the app's name (titles would need Screen Recording), so there it keeps app names and minutes only |
| Codex, Gemini | Your Codex CLI and Gemini CLI sessions: the project and what you asked | `~/.codex/sessions` and `~/.gemini/tmp` |
| Mail, WhatsApp | One note a day | The same switches as Settings → Second brain |

Each row says how many it has today and when it last looked, or what went
wrong. **Check now** reads one at once. Each evening at 20:55 **Your
activity** keeps the day as one note per source in the brain
(`09-sources/<source>/<date>.md`); the morning card sees today's calendar.

## Today

The first panel on the island's rail:

- **The one thing** from the morning card, with **Send draft**, **Edit**,
  **Later** and **Say it** (out loud, in the buddy's voice).
- **Ask**: “what did I do last week?”, “what did I ship on the island?”,
  “what happened on Friday?”. The answer cites each fact with a number you
  can hover, lists its sources underneath, and says where it ran. A number
  that isn't one of its sources is dropped.
- **Your day by hour**, from every source you turned on, and **what's next**
  on your calendar.
- **Record call** for call notes (below).

## Agents

The third section in the bar across the top of the open island:

- **Your coding agents** that are working or need you.
- **Research a question…** plans a few questions, reads your notes and
  activity for each, and writes a note with numbered sources in
  `04-resources/research/`.
- **Tell me when…** watches for something and tells you once, on the island:
  “PR #43 is reviewed” (or merged; the repository is your most recent one on
  GitHub unless you say `owner/repo#43`), “CI on me/app main finishes”,
  “https://example.com/pricing changes”, “anyone mentions Acme” (in your
  messages, mail and notifications), “~/Downloads/report.pdf appears”. It
  looks every five minutes.
- **Tending the brain**: **People** (who you were in touch with, and what
  you promised in messages you sent, added to
  `07-world-model/ledgers/promises.md` with who and when), **Inbox** (the
  evening filing) and **Projects** (what moved this week, what's gone quiet),
  with **Run now**.
- **The Agency** and **Agent Skills** (below), and the week's answers and
  cost.

## The Agency

[The Agency](https://github.com/msitarzewski/agency-agents) (MIT, by
AgentLand Contributors) is a catalog of specialist agents: engineering,
design, marketing, product, research, testing and more. In **Agents → The
Agency**, **Get The Agency** downloads it from GitHub (only then; **Update**
gets the latest). Browse by division or search, open an agent to read its
instructions, then:

- **Start in Claude**: it's added to Claude Code and the Claude tab opens
  with a draft (“Use the frontend-developer agent to …”) for you to finish.
- **In a terminal**: Claude Code starts with the agent's instructions
  (Terminal on a Mac, a PowerShell window on Windows).
- **Install for Claude Code**: it's copied to `~/.claude/agents/`, so every
  Claude Code session can use it. It never writes over an agent of yours,
  and **Remove** only removes what it installed.

The command bar (Ctrl+Alt+K) finds the agents too.

## Agent Skills

[Agent Skills](https://github.com/anthropics/skills) are Anthropic's skills
for Claude Code: folders of instructions, scripts and references that Claude
Code loads when they help (Word, Excel, PowerPoint and PDF documents,
design, testing web apps, building MCP servers and more). In **Agents →
Agent Skills**, **Get Agent Skills** downloads them from GitHub (only then;
**Update** gets the latest). Search, open one to read it, its licence and
how many files it has, then:

- **Install for Claude Code**: the whole folder is copied to
  `~/.claude/skills/<name>/`, so every Claude Code session can use it. Each
  skill keeps its own licence (many are Apache 2.0; read each one's
  LICENSE.txt). It never writes over a skill of yours, and **Remove** only
  removes what it installed (it marks its own with a small
  `.from-dynamic-island.json`).
- **Use in Claude**: it's installed, and the Claude tab opens with a draft
  (“Use the pdf skill to …”) for you to finish.

## The resting island

When nothing's going on, the island still says a little: a small count on
the character when notes wait in the brain's inbox to be filed, and on hover
the time, that count and what's next on today's calendar (“10:42 · 2 to
file · Standup at 11:00”).

## On your phone

The Island Drop app has **Today** and **Agents** under **More**, running on
the computer: ask about your days (with the same numbered sources and the
same yes before the cloud), your day by hour and what's next; and add or stop
a “tell me when…”, start research, and run the jobs that tend the brain.

## Voice

- **Call notes**: **Record call** in Today, or “record a call” in the
  command bar, records your microphone and what your speakers play; a red dot
  and the time sit on the island. **Stop** makes it out on this computer
  with Whisper and deletes the audio (whether or not that worked), then sums
  it up with to-dos. **Add to brain** keeps the notes in the inbox (to-dos as
  boxes) and the transcript as a source. It needs ffmpeg
  (`sudo apt install ffmpeg`, `brew install ffmpeg`, `winget install ffmpeg`);
  if the island quits while recording, the audio is deleted.
  - **Linux** records the default input and the default output's monitor
    (what the speakers play), through PulseAudio or PipeWire.
  - **A Mac** records the default input. To hear the other side too, install
    [BlackHole](https://github.com/ExistentialAudio/BlackHole) and send your
    output to it (a Multi-Output Device in Audio MIDI Setup); the island
    adds it when it's there.
  - **Windows** records the first microphone, and **Stereo Mix** when it's
    turned on (Sound settings → More sound settings → Recording).
  - With headphones and no way to hear the speakers, only your side is
    recorded.
- **The morning brief, out loud**: **Say it** in Today, or turn on **Say the
  morning brief out loud** in Settings → Buddy for once a morning when you're
  first at the computer (never in quiet hours).
- **Talk over it**: start talking while the buddy speaks and it stops to
  listen (Settings → Buddy; on by default). The microphone takes out the
  buddy's own voice; with the system voice, headphones help.
