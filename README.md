# Reddit Comment Wipe

[☕ If you like it, buy me a coffee](https://donatr.ee/bgl-90)

**Take back control of your Reddit history — in one click.** Reddit Comment Wipe is a Tampermonkey userscript that bulk-overwrites and then deletes **your own comments** (and optionally posts) on old.reddit.com. Every item is first edited with filler text — so the original never remains as the last stored revision in archives — and only then deleted. Press START, walk away, and come back to a clean profile and a CSV record of everything that was removed.

What sets it apart is that the core machinery is genuinely intelligent and built to survive anything a long unattended run can throw at it:

- **It thinks ahead, not just reacts.** The script reads Reddit's own rate-limit headers and paces itself so it never spends the API quota faster than it refills — 429 errors are avoided before they happen, while the speed stays at the allowed maximum. When errors do occur, TCP-style adaptation backs off sharply and creeps back to the optimum on its own.
- **It's bulletproof by design.** Network drops? It pauses and resumes by itself. A hung request? A watchdog reloads and continues. Tab in the background? Worker timers keep it at full speed. Browser restarted mid-run? It offers to pick up exactly where it left off. Locked or archived threads, stale listings, expired sessions — all handled automatically, without losing a single item or double-counting one.
- **It's transparent.** A live panel shows progress %, dual deletion rates, ETAs and a dozen counters; every deleted item is preserved in a one-click CSV log (with score, subreddit, original text); and a persistent diagnostic log records every decision the engine made, so any run can be analyzed after the fact.
- **You stay in charge.** Dry-run mode shows what *would* be deleted before anything happens; age, karma and subreddit filters protect what you want to keep; a safety lock ensures it only ever runs on your own logged-in profile.

Install `reddit-comment-wipe-7.2.user.js` (latest). Older versions (5.8 minimal, 6.1 with log/filters/dry-run) are kept in `archive/`. Core logic is covered by an automated test suite (`node tests/core.test.mjs`).

## Why edit before delete?

Deleting a Reddit comment removes it from public view, but the last saved text may persist in archives and data dumps. Overwriting the content first (with random filler words or a `.`) reduces what remains recoverable.

## Features

- **Dual engine**: direct Reddit API calls (fast, robust) with automatic DOM-clicking fallback if the API fails; mode manually selectable (AUTO / API / DOM)
- **Full sort cycle**: processes `new → top → hot → controversial`, then runs a final verification pass (Reddit listings cap at ~1000 items per sort, so multiple sorts reach more comments)
- **Adaptive rate limiting**: slows down on errors/429, speeds up after configurable error-free minutes; can be disabled for a fixed manual speed
- **Randomized delays**: every step waits a random interval (average ± jitter %) to avoid a machine-like fixed cadence
- **429 handling**: detects the rate-limit error page, waits 5 minutes, slows down one step, reloads and resumes automatically
- **Crash resilience**: auto-resumes after page reloads, pagination, sort switches and rate-limit pages; stats survive via sessionStorage
- **Status panel**: live counters (edited / deleted / errors / backoffs / restarts), runtime, deletions per minute, ETA, last 5 actions with comment titles, per-sort progress, clickable list of skipped comments
- **API retry**: after a DOM fallback, periodically retries API mode (configurable interval and attempt count, infinite option)
- **Extended counters**: API→DOM and DOM→API switches, 429 and other errors, backoffs, restarts
- **Donate link** in the panel footer
- **Controls**: START / PAUSE / STOP / RESET / EXPORT (stats+settings to clipboard as JSON)

### New in 6.0

- **Deletion log**: every deleted item is recorded (persistent, survives RESET) with the data already visible in the listing — no extra clicks or requests: deletion time, creation date, kind, subreddit, **score (upvotes)**, post title, first 200 characters of the original text, permalink. One click on **⬇ CSV** downloads the whole log (Excel-compatible)
- **Filters**: minimum age (only delete items older than N days), keep-karma threshold (items at/above a score are kept), subreddit list in SKIP (keep listed) or ONLY (process only listed) mode
- **Dry run**: simulates the full run without deleting anything; logs and counts what would be deleted
- **Posts support** (optional): submissions on the overview page — self-posts edited+deleted, link posts deleted
- **Dedup**: items re-shown by stale Reddit listings are recognized and not double-counted
- **Safety lock**: START only works on the logged-in account's own profile
- **Panel**: collapsible and draggable; rough total-run ETA
- Tampermonkey dashboard icon; `@downloadURL`/`@updateURL` template for auto-updates (see comment in the script header)
- **All tunables adjustable in the panel** (persisted across sessions):

| Setting | Range | Default |
|---|---|---|
| Speed (avg delay per step) | 0.1–6.0 s | 1.7 s |
| Jitter (± around average) | 0–90 % | 35 % |
| Backoff rounds | 0–3 | 3 |
| Backoff time | 1–30 s | 30 s |
| API timeout | 5–60 s | 15 s |
| Adaptive speed | ON/OFF, 1–15 min | ON, 3 min |
| Random overwrite text | ON/OFF | ON |
| Page refresh interval | 5–100 deletions | 10 |
| Long break interval | 100–2000 ops | 500 |
| Long break length | 1–30 min | 7 min |
| API retry after fallback | ON/OFF, 1–60 min, 1–10x or ∞ | ON, 10 min, 2x |

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension (Chrome, Firefox, Edge, Safari).
   - On recent Chrome versions, enable **Allow User Scripts** for the extension (Extensions → Tampermonkey → Details), or enable Developer mode — required for any userscript to run.
2. Open the Tampermonkey dashboard → **Create a new script**.
3. Delete the template, paste the full contents of `reddit-comment-wipe.user.js`, save (Ctrl+S).
4. Log in to Reddit and navigate to `https://old.reddit.com/user/YOUR_USERNAME/overview` (must be **old**.reddit.com).

## Usage

1. Open your profile's overview or comments page on old.reddit.com. A dark control panel appears in the bottom-right corner.
2. Optionally adjust settings (speed, mode, random text, etc.).
3. Click **START**. The script processes every comment on the page (edit → delete), paginates, switches sorts and finishes with a verification pass. No further interaction needed.
4. **PAUSE/RESUME** halts between steps. **STOP** aborts and clears session stats. **RESET** restores all settings to defaults and reloads. **EXPORT** copies stats and settings as JSON to the clipboard.
5. The browser tab title flashes `⚠ DONE` when finished. Skipped comments (permanent failures) are listed as clickable links in the panel.

### Notes

- Works only on your **own** comments while logged in.
- Reddit rate limits (~60 requests/min) apply; the defaults stay safely below. If you see frequent 429s, lower the speed or keep adaptive mode on.
- Reddit may cache/archive content; overwrite-then-delete reduces but cannot guarantee complete removal.
- The karma filter and the log's score column rely on scores being visible in the listing (Reddit preferences → "show comment scores"); items with hidden scores can't be protected by the karma filter.
- The deletion log is stored in Tampermonkey's storage on your machine; it contains your deleted text snippets — clear it (✕) if you don't want to keep them.
- Use at your own risk. Bulk automation is a gray area under Reddit's Terms of Service.

## Support

If this script saved you time: [donatr.ee/bgl-90](https://donatr.ee/bgl-90) ☕

## License

MIT
