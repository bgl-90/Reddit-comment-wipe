# Control Panel Reference

The panel appears in the bottom-right corner of old.reddit.com on your profile's overview/comments page.

## Monitors (read-only)

| Element | Meaning |
|---|---|
| Status line (top) | Current phase: Idle, Running [MODE] [sort] (N comments), backoff countdown, 429 countdown, page refresh, sort switch, DONE, STOPPED |
| Mode | Selected mode (AUTO/API/DOM) and the effective engine; shows "(API failed, DOM fallback)" when AUTO has fallen back |
| Action log | Last 5 actions with timestamps (comment title, edit/delete steps, errors, adaptive speed changes) |
| Sort list | Per-sort progress: `new/top/hot/controversial: N – pending/in progress/done`, current sort marked with ▶; "final verification pass" when active |
| Edited / Deleted / Errors | Confirmed successful edits, deletions, and permanently failed comments this session |
| Backoffs / Restarts | Total backoff rounds and automatic page reloads triggered by persistent failures |
| API→DOM / DOM→API | Mode switches: fallbacks to DOM and retries back to API this session |
| 429 / Other err | Rate-limit hits (API responses + error pages) and all other API errors |
| Runtime / Ops | Elapsed time since START; total API/DOM operations (drives the long-break counter) |
| Rate | Deletions per minute (after 30 s of runtime) |
| Left ~ | Estimated time for the comments remaining on the current page |
| Skipped | Clickable permalinks of comments that failed all retries |

## Settings (persist across sessions, adjustable live)

| Setting | Range (default) | Effect |
|---|---|---|
| Mode button | AUTO / API / DOM (AUTO) | AUTO: API with DOM fallback on failure. API: direct Reddit API only. DOM: simulated clicking only |
| Speed ◀▶ | 0.1–6.0 s avg (1.7) | Average random delay between every step; lower = faster, more 429 risk |
| Jitter ◀▶ | ±0–90 % (35) | Random spread around the average delay; displayed as the resulting min–max range |
| Backoff rounds ◀▶ | 0–3 (3) | Retries per failed operation before giving up (then page reload + resume) |
| Backoff time ◀▶ | 1–30 s (30) | Wait per backoff round, with countdown in the status line |
| API timeout ◀▶ | 5–60 s (15) | Max wait for an API response / DOM success check |
| Adaptive ON/OFF + ◀▶ | ON, 1–15 min (3) | ON: +0.1 s on every backoff/429, −0.1 s after N error-free minutes. OFF: fixed manual speed |
| Random text ON/OFF | ON | ON: 3–8 random filler words as overwrite text. OFF: "." |
| Refresh every ◀▶ | 5–100 deletions (10) | Page reload interval, so progress stays verifiable |
| Long break every ◀▶ | 100–2000 ops (500) | Operations between long cooldown pauses |
| Break length ◀▶ | 1–30 min (7) | Duration of the long cooldown pause |
| API retry ON/OFF + ◀▶ | ON, 1–60 min, 0(∞)–10x (10 min, 2x) | After DOM fallback, retry API mode every N minutes, max X times (0 = infinite) |

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
