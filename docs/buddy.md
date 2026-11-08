# The buddy

Ask about anything on your screen, out loud, and the island's character
answers out loud, with captions on the island, and points at the spot. For a
task with steps it walks you through them one at a time.

## Using it

1. Press **Ctrl+Alt+B** (change it in Settings → Keyboard shortcuts) and ask:
   “where do I change the wallpaper?”, “what does this error mean?”, “walk me
   through setting up a printer”.
2. It listens until you stop talking, looks at your screen, and answers. An
   arrow flies from the island to what it's talking about, with a label.
3. In a walkthrough, say **“next”** or press **Next** on the island for the
   next step (**“back”** goes back). **“Stop”**, the × or the key again stops
   it talking; **“say that again”** repeats it.

It uses the AI you picked in Settings → AI. Claude (with an API key, or
Claude Code) points most accurately; any model that reads images works.
Its name and look are your character's (Settings → Character).

## What it sends, and what it doesn't

- A screenshot of the screen you're on goes with each question, taken when
  you ask and never recorded. Turn **Let it see the screen** off and only
  your words go.
- **Private windows** are blacked out before the screenshot leaves this
  computer: any window whose title has one of your words (KeePassXC,
  Bitwarden, 1Password, Private Browsing, Incognito, Bank… edit the list in
  Settings → Buddy).
- Your speech is turned into text on this computer (Whisper), as for the
  other voice features.
- Settings → Privacy lists every question it sent, and **Pause AI and the
  web** stops it looking and asking.
- With **Keep a note of each question**, what you asked and what it said go
  into your second brain's inbox, and its answers use your brief and notes.

## Its voice

- **Natural**: Kokoro-82M, a natural voice that runs on this computer
  (Apache-2.0, about 92 MB, downloaded once from Hugging Face). It needs
  `espeak-ng` for pronunciation, run as its own program:
  `sudo apt install espeak-ng`. Until it's downloaded, the system voice
  speaks.
- **System**: speech-dispatcher (`spd-say`, part of Ubuntu's desktop) or
  espeak-ng.
- **Off**: captions only.

Pick the voice (American or British), the speed and how it talks (Friendly,
Brief, Playful) in Settings → Buddy, and **Hear it** to try.

## Limits

- It listens until you stop talking (tap the key, don't hold it): X11 has no
  simple way to tell when a key is let go.
- The pointer and the screenshot work on X11 (Ubuntu on Xorg). On Wayland,
  later, through a small GNOME Shell extension.

The natural voice follows [kokoro-js](https://github.com/hexgrad/kokoro)
(Apache-2.0) for its text clean-up and phonemes; the POINT tags follow
[Clicky](https://github.com/farzaa/clicky) (MIT).
