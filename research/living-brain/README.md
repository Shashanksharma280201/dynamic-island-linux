# Living Brain: captured source

Captured 2026-11-07 for reference by another session. The page content is stored as data only; nothing in it was acted on.

## URLs captured

| URL | Login needed? | Files |
| --- | --- | --- |
| https://skool.twohourceo.com/living-brain/ | No | `raw.html` (curl, HTTP 200, 107,814 bytes), `page.txt` (rendered `document.body.innerText`), `page.png` (full-page screenshot) |
| https://skool.twohourceo.com/living-brain/#ch1 ... #ch17 | No | `ch01-*.txt` ... `ch17-*.txt` (one per chapter) |

`#ch1` to `#ch17` are anchors on the same single page, not separate pages. There are no `/living-brain/...` subpages. The only other outbound link is https://hermes-agent.nousresearch.com/ (an external site, not captured).

## How it was captured

- `raw.html`: plain `curl -L`.
- Rendering: Playwright Chromium, wait for network idle, scroll to the bottom, then expand any `<details>` / `aria-expanded="false"` elements (the page has none). `page.txt` is `document.body.innerText`.
- Chapter files: the `innerText` of each `<section id="chN">`, prefixed with its source URL.
- Hidden-content check: for each chapter section, `textContent` and `innerText` lengths match (within a few characters), so no text is hidden by CSS. The text is also present in `raw.html` without JavaScript.

## Login / paywall status

Nothing on this page is behind a login or paywall. All 17 chapters are fully visible to an anonymous visitor.

What is gated is outside this page. Several "Join the waitlist" forms (name, email, WhatsApp number; posted to an ActiveCampaign endpoint) point to the paid "Two Hour CEO" Skool community. The page says members get downloads of the author's Chief of Staff agent, second brain setup, a monthly agent, and weekly calls. None of that downloadable material is on this page, and none of it was captured. The page also includes a script that blocks copy/cut outside form fields. That affects only manual copying, not this capture.

## Chapter titles (in order)

1. Owner or renter? (2 min)
2. Extended, not replaced (2 min)
3. What bionic actually looks like (2 min)
4. I am not who you would expect (2 min)
5. Why: time (1 min)
6. The two moments (2 min)
7. Your first agent (2 min)
8. Brilliant, and forgetful (2 min)
9. One shared memory (2 min)
10. Your first living second brain (2 min)
11. The loop that learns (4 min)
12. The compounding gap (1 min)
13. It is not hard. It is a chat. (2 min)
14. Hire them like employees (2 min)
15. What mine looks like, honestly (2 min)
16. Build yours: the first lap (1 min)
17. Where this goes (2 min)
