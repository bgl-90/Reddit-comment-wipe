# Control Panel Reference

The panel appears in the bottom-right corner of old.reddit.com on your profile's overview/comments page. Since 6.0 it can be dragged by its header and collapsed with the –/+ button (status line stays visible).

Since 7.2: if a previous run was interrupted (tab closed, browser restart), a resume prompt appears on load; START refuses to run while another tab holds the wipe lock; the run keeps full speed in background tabs via worker timers.

## Monitors (read-only)

| Element | Meaning |
|---|---|
| Status line (top) | Current phase: Idle, Running [MODE] [sort] (N items), backoff/quota/rate-limit countdowns, long break, offline wait, DONE summary, STOPPED |
| Quota / Progress (7.0) | Remaining API quota + seconds to reset (from X-Ratelimit headers); deleted/total estimate with percentage |
| Mode | Selected mode (AUTO/API/DOM) and the effective engine; shows "(API failed, DOM fallback)" when AUTO has fallen back |
| Action log | Last 5 actions with timestamps (comment title, edit/delete steps, errors, adaptive speed changes) |
| Sort list | Per-sort progress: `new/top/hot/controversial: N – pending/in progress/done`, current sort marked with ▶; "final verification pass" when active |
| Edited / Deleted / Errors / Edit skip | Confirmed successful edits, deletions, permanently failed comments, and edits skipped because the text was already overwritten (reload between edit and delete, or stale listing) this session |
| Backoffs / Restarts | Total backoff rounds and automatic page reloads triggered by persistent failures |
| API→DOM / DOM→API | Mode switches: fallbacks to DOM and retries back to API this session |
| 429 / Other err | Rate-limit hits (API responses + error pages) and all other API errors |
| Filtered / Would delete / Stale skip | Items skipped by the filters; items a dry run would delete; already-processed items re-shown by stale listings (not double-counted) |
| Runtime / Ops | Elapsed time since START; total API/DOM operations (drives the long-break counter) |
| Rate | 7.0: deletions per minute over the last 5 minutes AND the whole-run average; earlier versions: whole-run only (after 30 s of runtime) |
| Page ~ / Total ~ | Estimated time for the current page; rough estimate for the whole run (unfinished sorts estimated from the finished-sort average) |
| Del log | Number of logged deletions; ⬇ CSV downloads the log with one click, ✕ clears it (survives RESET) |
| Diag log (7.1) | Number of diagnostic events; ⬇ JSON downloads env+settings+stats+events for post-run analysis, ✕ clears. Survives RESET |
| Skipped | Clickable permalinks of comments that failed all retries |

## Settings (persist across sessions, adjustable live)

| Setting | Range (default) | Effect |
|---|---|---|
| Mode button | AUTO / API / DOM (AUTO) | AUTO: API with DOM fallback on failure. API: direct Reddit API only. DOM: simulated clicking only |
| Speed ◀▶ | 0.1–6.0 s avg (1.7) | Average random delay between every step; lower = faster, more 429 risk |
| Jitter ◀▶ | ±0–90 % (35) | Random spread around the average delay; displayed as the resulting min–max range |
| Backoff rounds ◀▶ | 0–3 (3) | Retries per failed operation before giving up (then page reload + resume) |
| Backoff time ◀▶ | 5–60 s, 5 s steps (30) | Wait per backoff round, with countdown in the status line |
| API timeout ◀▶ | 5–60 s (15) | Max wait for an API response / DOM success check |
| Adaptive ON/OFF + ◀▶ | ON, 1–15 min (3) | ON: +0.1 s on every backoff/429, −0.1 s after N error-free minutes. OFF: fixed manual speed |
| Random text ON/OFF | ON | ON: 3–8 random filler words as overwrite text. OFF: "." |
| Refresh every ◀▶ | 5–100 deletions (10) | Page reload interval, so progress stays verifiable |
| Long break every ◀▶ | 100–2000 ops (500) | Operations between long cooldown pauses |
| Break length ◀▶ | 1–30 min (7) | Duration of the long cooldown pause |
| API retry ON/OFF + ◀▶ | ON, 1–60 min, 0(∞)–10x (10 min, ∞ since 7.1; 2x before) | After DOM fallback, retry API mode every N minutes, max X times (0 = infinite) |
| Dry run ON/OFF | OFF | ON: nothing is edited/deleted; matched items are counted, logged (dry_run column in CSV) and outlined orange |
| Posts ON/OFF | OFF | ON: submissions on the overview page are processed too (self-posts edited+deleted, link posts deleted only) |
| Min age ◀▶ | off, 30-day steps (off) | Only items older than N days are processed; newer ones are skipped (Filtered counter) |
| Keep karma ≥ ON/OFF + ◀▶ | OFF, 5–10000 (50) | ON: items with a visible score at or above the threshold are kept. Items with hidden scores cannot be protected |
| Subs OFF/SKIP/ONLY + input | OFF | Comma-separated subreddit list. SKIP: listed subs are kept. ONLY: only listed subs are processed |

## Buttons

| Button | Action |
|---|---|
| START | Begin processing; auto-resumes across reloads, pagination, sort switches |
| PAUSE / RESUME | Halt/continue between steps (mid-step waits finish first) |
| STOP | Abort; clears session stats; settings kept |
| RESET | Restore all settings to defaults, clear stats and auto-mode, reload page |
| EXPORT | Copy stats + settings to clipboard as JSON |

## Panel footer

Donation link (opens in new tab).
