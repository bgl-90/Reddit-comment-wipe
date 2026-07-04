# Reddit Comment Wipe

![If you like it, buy me a coffee https://donatr.ee/bgl-90

A Tampermonkey userscript that bulk-overwrites and deletes **your own comments** on old.reddit.com. Each comment is first edited (so the original text is not the last stored revision), then deleted. Runs fully automated across all comment sorts with adaptive rate limiting and a live status panel.

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
- Use at your own risk. Bulk automation is a gray area under Reddit's Terms of Service.

## Support

If this script saved you time: [donatr.ee/bgl-90](https://donatr.ee/bgl-90) ☕

## License

MIT
