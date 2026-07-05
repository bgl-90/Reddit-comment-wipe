# Changelog

## 7.2
- **Web Worker timers**: all waits run in a worker, immune to background-tab throttling (Chrome slows page timers to ~1/min in hidden tabs); automatic setTimeout fallback if workers are blocked; visibility changes logged to diag
- **Storage performance**: deletion log kept in memory and flushed every 5 s (was: full multi-MB GM rewrite per deletion + per-second deserialization for the panel counter); stat saves throttled to ~1/s; all buffers force-flushed before reloads/unload
- **Run-state persistence**: stats + progress saved to GM storage every 10 s; after a tab close or browser restart a resume prompt restores the unfinished run (48 h window, same-user check)
- **Multi-tab lock**: heartbeat lock prevents two tabs running simultaneously (double quota burn); released on finish/stop/unload
- Watchdog suppressed in hidden tabs when worker timers are unavailable (no false reload triggers)
- **Test suite**: `tests/core.test.mjs` — 39 tests over isWiped, filters, CSV escaping, time formatting, ratelimit parsing and panel-ID integrity (`node tests/core.test.mjs`)
- Older versions moved to `archive/` (5.8, 6.1)

## 7.1
- **Diagnostic run log** (persistent, GM storage, 3000-event ring buffer): 31 event types — API errors with endpoint/code/item-ID, rate-limit waits with parsed duration, backoffs, adaptive speed changes, quota waits, engine fallbacks, listing failures with URL+HTTP status, watchdog/reload/429-page triggers with a **live page snapshot** (URL, title, DOM item counts, logged-in state, 429 detection, user agent, viewport), start (full settings snapshot), sort completions, pause/stop/finish/done summaries. Every event carries a context block (engine, sort, delay, quota, counters, online/paused state), so post-run analysis can pinpoint where and why a run degraded
- **⬇ JSON** button in the panel: one-click download of env + settings + stats + all events; ✕ clears; buffered writes (5 s flush + flush before reloads)
- API retry after DOM fallback: default changed from 2x to **∞ (infinite)**
- File renamed to `reddit-comment-wipe-7.1.user.js`

## 7.0 (separate file: `reddit-comment-wipe-7.0.user.js`)
- **JSON listing engine**: in API mode items come from `user/NAME/comments.json` (100/request) instead of DOM pagination — no page reloads, no stale-DOM issues; scores always available for the log and karma filter. DOM engine kept as fallback
- **Predictive rate limiting**: `X-Ratelimit-*` headers are read from every response; pacing never spends the quota faster than it refills, and when <5 requests remain the script waits for the reset — 429s are avoided before they happen. Quota shown in the panel
- **AIMD adaptation**: errors multiply the delay ×1.5, error-free periods reduce it ×0.95 (converges to the optimum much faster than fixed ±0.1 s)
- **Exact RATELIMIT waits**: "try again in X minutes" API messages are parsed and waited exactly, instead of generic backoff rounds
- **Locked/archived handling**: THREAD_LOCKED / TOO_OLD / ARCHIVED edit errors skip the edit and delete immediately ("Locked" counter) — no wasted backoff rounds
- **Offline resilience**: network loss pauses automatically and resumes when back; not counted as errors
- **Watchdog**: 5 minutes without progress → automatic reload + resume
- **Total estimate & progress**: item count probed from listings at start; `deleted/total (%)` in the panel; total ETA from the measured recent rate
- **Dual rate display**: last-5-minutes rate + whole-run average rate
- **Completion summary**: DONE shows deleted/edited/filtered/errors/runtime and auto-downloads the deletion-log CSV
- **Beep option** (default OFF) on DONE
- me.json cached (single shared fetch for safety lock + modhash)

## 6.1
- Backoff time adjustable in 5 s steps (range 5–60 s)
- Runtime always shown as h:mm:ss
- Panel header icon doubled (40×40 px)
- File renamed to `reddit-comment-wipe-6.1.user.js`

## 6.0 (separate file: `reddit-comment-wipe-6.0.user.js`)
- **Deletion log**: every deleted item is saved persistently (GM storage) with the data visible in the listing — no extra clicks/requests: timestamp, creation date, kind, subreddit, **score (upvotes)**, post title, first 200 chars of original text, permalink. One-click **⬇ CSV** download (Excel-compatible, UTF-8 BOM), ✕ clear. Survives RESET; capped at 20 000 entries
- **Filters**: min age (only items older than N days), keep karma ≥ N (protects high-score items), subreddit list with SKIP/ONLY modes; "Filtered" counter
- **Dry run**: full walk-through without any edit/delete; counts and logs (dry_run column) what would be deleted; orange outline on matched items
- **Posts support** (toggle, default OFF): submissions on the overview page; self-posts are edited then deleted, link posts deleted only
- **Dedup fix**: processed item IDs are remembered per session — items reappearing in stale listings are no longer double-counted ("Stale skip" counter)
- **Safety lock**: START verifies via `me.json` that the profile belongs to the logged-in account
- **Panel**: collapsible (– / +), draggable by the header
- **Total ETA**: rough whole-run estimate next to the page ETA
- `@icon` meta (Tampermonkey dashboard icon); commented `@downloadURL`/`@updateURL` template for auto-updates

## 5.8
- "Edit skip" counter in the panel: comments whose text was already overwritten, so only the delete ran (explains Edited < Deleted)

## 5.7
- Small icon (base64-embedded) in the panel header, top-right corner
- README badge markdown fixed

## 5.6
- Panel header with script name + version (from GM_info)
- CSP-safe JS rainbow animation on donate text; coffee↔heart icon swap

## 5.5
- Donate text animation (superseded by 5.6 CSP-safe version)

## 5.4
- Skipped comments retried once via API (edit+delete by ID from permalink) before DONE; list keeps only permanent failures

## 5.3
- Donate link in panel footer; @homepageURL/@supportURL meta; README badge; ethical request appended to LICENSE

## 5.2
- API retry: infinite option (max = ∞)
- New counters in panel: API→DOM, DOM→API switches, 429 count, other error count

## 5.1
- API retry after DOM fallback: toggle, interval (1–60 min), attempt count (1–10)

## 5.0
- Full English translation (code, UI, docs)
- Long break **length** adjustable (1–30 min, default 7)
- README + CHANGELOG for GitHub publication

## 4.3
- Random overwrite text option (3–8 random filler words instead of ".", ON by default) — reduces recoverability and mass-filterability of edits
- Page refresh interval and long break interval adjustable in the panel
- Modhash auto-refresh via `api/me.json` fetch (no reload needed on expiry)
- Code reorganized into sections; Greasy Fork meta headers added

## 4.2
- Adaptive speed toggle (ON/OFF) and speed-up interval (1–15 min) in the panel; OFF disables both auto speed-up and auto slow-down

## 4.1
- Manual mode selector: AUTO / API / DOM (cycling button)
- AUTO mode: automatic DOM fallback when API fails or modhash is missing; fallback state shown in panel and persisted for the session

## 4.0
- API engine: comments edited/deleted via `api/editusertext` and `api/del` (fetch + modhash) instead of DOM clicking — faster, more robust
- Final verification pass: after all sorts finish, one more `new` cycle before declaring DONE
- Adaptive speed: +0.1 s on every backoff, −0.1 s after 3 error-free minutes
- API timeout adjustable (5–60 s)
- Empty-page confirmation: a sort is marked done only after a second empty load (guards against transient failures)
- EXPORT button: stats + settings to clipboard as JSON

## 3.4
- Automatic sort cycling: new → top → hot → controversial; per-sort deletion counters and status (pending / in progress / done) in the panel

## 3.3
- Jitter (min–max spread around the average delay) adjustable in percent (0–90%)

## 3.2
- Speed step and minimum reduced to 0.1 s
- Beep removed (title-flash alert kept)

## 3.1
- RESET button: clears stats, auto-mode and restores all settings to defaults

## 3.0
- 429 error page raises the average delay by one step before the 5-minute wait

## 2.9
- 429 error page detection: 5-minute countdown, then automatic reload and resume

## 2.8
- Deletions-per-minute display
- Title-flash + beep on DONE and on permanent failures
- Skipped comments listed as clickable links in the panel

## 2.7
- Backoff and restart counters in the panel

## 2.6
- Stale-DOM fix: element re-queried by `data-fullname` before every check (eliminated false backoffs)
- Backoff rounds (0–3) and backoff duration (1–30 s) adjustable

## 2.5
- Polling success check (up to 15 s) instead of fixed waits — immediate continue on success
- Automatic page reload + resume after all backoff rounds are exhausted

## 2.4
- Post title of the comment being processed shown in the action history

## 2.3
- Action history: last 5 steps with timestamps in the panel

## 2.2
- Speed adjustable with arrow buttons (average delay, GM-persisted); current range displayed
- ETA for the current page
- Deleted comments removed from the DOM immediately

## 2.1
- Delays reduced ~25%; backoff 60 s → 30 s with visible countdown
- Page reload every 10 deletions (with auto-resume) so progress is verifiable

## 2.0
- Backoff + retry (60 s, max 2 retries) on failed steps
- Edit/delete success verification (counters only increment on confirmed success)
- STOP button; failed-comment permalink log (console); overview page removed from matches; long break (7 min) every 500 ops

## 1.x
- 1.7: status panel (counters, runtime), PAUSE
- 1.6: random wait between every step (1.5–3 s)
- 1.5: randomized delays (~50 ops/min) to avoid fixed cadence
- 1.4: delete via `form.del-button` selector (fixed non-working delete)
- 1.3–1.2: comment-scoped "yes" confirmation (critical fix: previously could click other comments' links), robust selectors, pagination instead of scrolling, dedup, already-deleted skip
- 1.1: initial version (edit to "." then delete, scroll loop)
