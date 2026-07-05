// ==UserScript==
// @name         Reddit Comment Wipe 7.2 (JSON+API+DOM, old reddit)
// @namespace    reddit-wipe
// @version      7.2
// @description  Bulk edit+delete your own comments & posts on old.reddit.com. JSON listing engine, predictive rate limiting, filters, dry-run, deletion log, offline/watchdog resilience, dual API/DOM engine, full status UI
// @author       bgl-90
// @license      MIT
// @homepageURL  https://donatr.ee/bgl-90
// @supportURL   https://donatr.ee/bgl-90
// @icon         data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAoACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDy+lwaBywrpfDHgrVPE0j/AGaErBHgtNICq89gSPT0zWjdkKMeZ2Mm10W7vIUkgCMZJPLRGkVSx9snnqKXXNCv/DupNp+oxqkyqG+RwykHoQa6jxh4al8N6bp9lJIjybpJi0QPB+Xp34x1wK5K7nubyb7Td3D3DtwZnJfp0Gf89aUW2rsqcUpWiU6KKKszJbaVYLqGZ4xKsciu0bdHAOcH619JvqE2reGVvNBniV5o1eNjyFXuBx1HTp2r5nrp/B3iLU9Lvfs1peBIpAT5Uq7kZvbuPwrKqlyts3w6k6kVFXd+ux1HxQuVebQpJSlzGYy0nlM22U/KDj079P0rzyVovNlMcbJGSRGm/lP8eprpfGOs3N/JFJLBFbuQwd4JCfMzwSQR+tckQq5BOe4KjIP50U3FpSTKrRnTbpzVnf8Ar5DDgk4GB6UUlFanMFKCVOQcGiigCaW8mnRVmcybehY5xUGaKKSSWiKlKUneTuwooopkn//Z
// @match        https://old.reddit.com/user/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==
//
// Auto-update: after publishing (GreasyFork handles it automatically), or for GitHub
// hosting move these two lines INTO the header block above and adjust the URL:
//   @downloadURL https://github.com/<user>/<repo>/raw/main/reddit-comment-wipe-7.2.user.js
//   @updateURL   https://github.com/<user>/<repo>/raw/main/reddit-comment-wipe-7.2.user.js
(function () {
    'use strict';

    // ===== CONFIG =====
    const SPEED_STEP = 100, SPEED_MIN = 100, SPEED_MAX = 6000;
    const SPREAD_STEP = 5, SPREAD_MIN = 0, SPREAD_MAX = 90;
    const SORTS = ['new', 'top', 'hot', 'controversial'];
    const MODES = ['auto', 'api', 'dom'];
    const SUBMODES = ['off', 'skip', 'only'];
    const MAX_LOG = 20000;
    const WATCHDOG_MIN = 5;
    const FATAL_RE = /THREAD_LOCKED|TOO_OLD|ARCHIVED|NOT_AUTHOR|DELETED_LINK|DELETED_COMMENT|CANT_EDIT/i;
    const WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt labore dolore magna aliqua enim minim veniam quis nostrud exercitation ullamco laboris nisi aliquip commodo consequat'.split(' ');

    let avgDelay = GM_getValue('wipeAvgDelay', 1700);
    let spreadPct = GM_getValue('wipeSpreadPct', 35);
    let backoffRounds = GM_getValue('wipeBackoffRounds', 3);
    let backoffSec = GM_getValue('wipeBackoffSec', 30);
    let apiTimeout = GM_getValue('wipeApiTimeout', 15);
    let mode = GM_getValue('wipeMode', 'auto');
    let adaptOn = GM_getValue('wipeAdaptOn', true);
    let adaptMin = GM_getValue('wipeAdaptMin', 3);
    let randomText = GM_getValue('wipeRandomText', true);
    let refreshAfter = GM_getValue('wipeRefreshAfter', 10);
    let opsLimit = GM_getValue('wipeOpsLimit', 500);
    let longBreakMin = GM_getValue('wipeLongBreakMin', 7);
    let apiRetryOn = GM_getValue('wipeApiRetryOn', true);
    let apiRetryMin = GM_getValue('wipeApiRetryMin', 10);
    let apiRetryCount = GM_getValue('wipeApiRetryCount', 0);   // 0 = infinite (default)
    let dryRun = GM_getValue('wipeDryRun', false);
    let doPosts = GM_getValue('wipeDoPosts', false);
    let fltAgeDays = GM_getValue('wipeFltAgeDays', 0);
    let fltKarmaOn = GM_getValue('wipeFltKarmaOn', false);
    let fltKarmaMin = GM_getValue('wipeFltKarmaMin', 50);
    let fltSubMode = GM_getValue('wipeFltSubMode', 'off');
    let fltSubs = GM_getValue('wipeFltSubs', '');
    let collapsed = GM_getValue('wipeCollapsed', false);
    let beepOn = GM_getValue('wipeBeepOn', false);

    let apiBroken = sessionStorage.getItem('wipeApiBroken') === '1';
    let apiRetriesLeft = apiRetryCount;

    const minD = () => avgDelay * (1 - spreadPct / 100);
    const maxD = () => avgDelay * (1 + spreadPct / 100);
    const effMode = () => mode === 'dom' ? 'dom' : (mode === 'api' ? 'api' : (apiBroken ? 'dom' : 'api'));
    const wipeText = () => randomText
        ? Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () => WORDS[Math.floor(Math.random() * WORDS.length)]).join(' ')
        : '.';
    const isWiped = t => {
        t = (t || '').trim();
        if (t === '.') return true;
        const w = t.split(/\s+/);
        return w.length >= 3 && w.length <= 8 && w.every(x => WORDS.includes(x));
    };

    const rand = (a, b) => a + Math.random() * (b - a);
    // Web Worker timers: browsers throttle setTimeout in background tabs to ~1/min,
    // worker timers keep running at full speed. Falls back to setTimeout if blocked.
    let timerWorker = null;
    const wPending = {};
    let wSeq = 0;
    try {
        timerWorker = new Worker(URL.createObjectURL(new Blob(
            ['onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms);'],
            { type: 'text/javascript' })));
        timerWorker.onmessage = e => { const f = wPending[e.data]; delete wPending[e.data]; if (f) f(); };
    } catch (e) { timerWorker = null; }
    const sleep = ms => new Promise(r => {
        if (timerWorker) { const id = ++wSeq; wPending[id] = r; timerWorker.postMessage({ id: id, ms: ms }); }
        else setTimeout(r, ms);
    });

    // ===== STATE =====
    const S = JSON.parse(sessionStorage.getItem('wipeStats') ||
        '{"edited":0,"deleted":0,"errors":0,"ops":0,"start":0,"failed":[],"delSinceRefresh":0,"backoffs":0,"reloads":0,"sortDel":{},"sortDone":{},"finalPass":false,"emptyRetry":{},"doneIds":{},"drySeen":{},"delTimes":[]}');
    ['sortDel', 'sortDone', 'emptyRetry', 'doneIds', 'drySeen'].forEach(k => S[k] = S[k] || {});
    S.delTimes = S.delTimes || [];
    S.backoffs = S.backoffs || 0; S.reloads = S.reloads || 0;
    let paused = false, stopped = false, running = false;
    let lastIncident = Date.now();
    let cachedModhash = '';
    let lastBeat = Date.now();
    const beat = () => lastBeat = Date.now();
    let statsDirty = false, lastStatsWrite = 0;
    function flushStats() {
        if (!statsDirty) return;
        statsDirty = false;
        lastStatsWrite = Date.now();
        try { sessionStorage.setItem('wipeStats', JSON.stringify(S)); } catch (e) {}
    }
    const saveStats = () => {
        beat();
        statsDirty = true;
        if (Date.now() - lastStatsWrite > 1000) flushStats();   // throttled: at most ~1 write/s
    };
    setInterval(flushStats, 1000);

    let jsonActive = false, activeSort = null, jsonQueueLeft = 0;
    const currentSort = () => (jsonActive && activeSort) ? activeSort
        : (new URLSearchParams(location.search).get('sort') || 'new');
    const sortUrl = s => location.pathname + '?sort=' + s;
    const uname = () => (location.pathname.match(/\/user\/([^/]+)/i) || [])[1] || '';

    // ===== NETWORK / RATE LIMIT INTELLIGENCE =====
    window.addEventListener('offline', () => { logAction('network lost – waiting'); diag('offline', {}); });
    window.addEventListener('online', () => { logAction('network is back'); diag('online', {}); });
    document.addEventListener('visibilitychange', () => {
        diag('visibility', { hidden: document.hidden, workerTimers: !!timerWorker });
        if (document.hidden && running) logAction(timerWorker
            ? 'tab in background (worker timers keep full speed)'
            : 'tab in background – timers throttled, keep the tab visible');
    });
    async function waitOnline() {
        while (!navigator.onLine && !stopped) {
            setStatus('Offline – waiting for network...');
            beat();
            await sleep(2000);
        }
    }

    // X-Ratelimit-* headers → predictive pacing (avoid 429s before they happen)
    const rl = { remaining: null, resetAt: 0 };
    function readRl(res) {
        try {
            const rem = parseFloat(res.headers.get('x-ratelimit-remaining'));
            const rst = parseFloat(res.headers.get('x-ratelimit-reset'));
            if (!isNaN(rem)) { rl.remaining = rem; rl.resetAt = Date.now() + (isNaN(rst) ? 600 : rst) * 1000; }
        } catch (e) {}
    }
    async function rlGuard(label) {
        await waitOnline();
        if (rl.remaining !== null && rl.remaining < 5 && Date.now() < rl.resetAt) {
            diag('quota_wait', { rem: rl.remaining, waitS: Math.ceil((rl.resetAt - Date.now()) / 1000), label: label || '' });
            while (Date.now() < rl.resetAt && !stopped) {
                setStatus(`${label || 'API'} – quota low (${rl.remaining} left), waiting ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s for reset`);
                beat();
                await sleep(1000);
            }
            rl.remaining = null;
        }
    }

    // ===== DIAGNOSTIC RUN LOG (persistent, for post-run analysis) =====
    const MAX_DIAG = 3000;
    let diagBuf = GM_getValue('wipeDiagLog', []);
    if (!Array.isArray(diagBuf)) diagBuf = [];
    let diagDirty = false;
    function diag(ev, data) {
        diagBuf.push({
            t: new Date().toISOString(),
            ev: ev,
            d: data || {},
            c: {   // context snapshot at the moment of the event
                eff: effMode(), sort: currentSort(), delay: avgDelay,
                rlRem: rl.remaining, rlResetS: rl.resetAt ? Math.max(0, Math.round((rl.resetAt - Date.now()) / 1000)) : null,
                ops: S.ops, del: S.deleted, ed: S.edited, err: S.errors, e429: S.err429 || 0,
                online: navigator.onLine, paused: paused, running: running
            }
        });
        if (diagBuf.length > MAX_DIAG) diagBuf.splice(0, diagBuf.length - MAX_DIAG);
        diagDirty = true;
    }
    function flushDiag() { if (diagDirty) { try { GM_setValue('wipeDiagLog', diagBuf); } catch (e) {} diagDirty = false; } }
    setInterval(flushDiag, 5000);
    window.addEventListener('beforeunload', () => { flushStats(); flushDelLog(); flushDiag(); releaseLock(); });
    // snapshot of the live web page state (collected on load, errors, watchdog, 429)
    function pageInfo() {
        return {
            url: location.href,
            title: (document.title || '').slice(0, 80),
            hasSiteTable: !!document.querySelector('#siteTable'),
            thingsOnPage: document.querySelectorAll('div.thing').length,
            deletedOnPage: document.querySelectorAll('div.thing.deleted').length,
            loggedIn: !!((document.querySelector('#header .user a') || {}).textContent || ''),
            looks429: /429|too many requests|whoa there/i.test(((document.body && document.body.textContent) || '').slice(0, 3000)),
            ua: navigator.userAgent,
            viewport: window.innerWidth + 'x' + window.innerHeight,
            hidden: document.hidden,
            workerTimers: !!timerWorker,
            scriptVersion: (typeof GM_info !== 'undefined' && GM_info.script) ? GM_info.script.version : '?'
        };
    }
    function settingsSnap() {
        return { avgDelay, spreadPct, backoffRounds, backoffSec, apiTimeout, mode, adaptOn, adaptMin, randomText, refreshAfter, opsLimit, longBreakMin, apiRetryOn, apiRetryMin, apiRetryCount, dryRun, doPosts, fltAgeDays, fltKarmaOn, fltKarmaMin, fltSubMode, fltSubs, beepOn };
    }

    // ===== MULTI-TAB LOCK =====
    const TAB_ID = Math.random().toString(36).slice(2);
    function releaseLock() {
        const l = GM_getValue('wipeTabLock', null);
        if (l && l.id === TAB_ID) GM_setValue('wipeTabLock', null);
    }
    function otherTabRunning() {
        const l = GM_getValue('wipeTabLock', null);
        return !!(l && l.id !== TAB_ID && Date.now() - l.ts < 15000);
    }
    function takeLock() { GM_setValue('wipeTabLock', { id: TAB_ID, ts: Date.now() }); }
    setInterval(() => { if (running) takeLock(); }, 5000);   // heartbeat

    // ===== RUN-STATE PERSISTENCE (survives tab close / browser restart) =====
    function persistRun() {
        try { GM_setValue('wipeRunState', { ts: Date.now(), user: uname(), stats: S, auto: sessionStorage.getItem('wipeAuto') === '1' }); } catch (e) {}
    }
    function clearRunState() { GM_setValue('wipeRunState', null); }
    setInterval(() => { if (running && !dryRun) persistRun(); }, 10000);
    (function restoreRun() {
        if (sessionStorage.getItem('wipeStats')) return;   // same-tab reload: sessionStorage still has it
        const st = GM_getValue('wipeRunState', null);
        if (!st || !st.stats || st.user !== uname()) return;
        if (Date.now() - st.ts > 48 * 3600000) { clearRunState(); return; }
        const age = Math.round((Date.now() - st.ts) / 60000);
        if (confirm(`Reddit Comment Wipe: resume previous unfinished run? (${st.stats.deleted} deleted, saved ${age} min ago)`)) {
            Object.assign(S, st.stats);
            saveStats();
            if (st.auto) sessionStorage.setItem('wipeAuto', '1');
            diag('restore', { ageMin: age, deleted: st.stats.deleted });
            logAction('previous run state restored');
        } else clearRunState();
    })();

    // me.json cache (shared by safety lock + modhash refresh)
    let meCache = { t: 0, data: null };
    async function fetchMe() {
        if (Date.now() - meCache.t < 60000 && meCache.data) return meCache.data;
        try {
            const res = await fetch('https://old.reddit.com/api/me.json', { credentials: 'include' });
            readRl(res);
            const j = await res.json();
            if (j && j.data) {
                meCache = { t: Date.now(), data: j.data };
                if (j.data.modhash) cachedModhash = j.data.modhash;
                return j.data;
            }
        } catch (e) {}
        return null;
    }
    function modhash() {
        return cachedModhash || (document.querySelector('input[name="uh"]') || {}).value || '';
    }
    async function refreshModhash() {
        meCache.t = 0;
        const d = await fetchMe();
        return !!(d && d.modhash);
    }
    async function ownProfile() {
        const pageUser = uname().toLowerCase();
        let me = '';
        const d = await fetchMe();
        if (d) me = (d.name || '').toLowerCase();
        if (!me) me = ((document.querySelector('#header .user a') || {}).textContent || '').toLowerCase();
        return !!(me && pageUser && me === pageUser);
    }

    // ===== DELETION LOG =====
    let delLogCache = GM_getValue('wipeDelLog', []);
    if (!Array.isArray(delLogCache)) delLogCache = [];
    let delLogDirty = false;
    function delLog() { return delLogCache; }   // in-memory: no per-second GM deserialization
    function logDeleted(entry) {
        delLogCache.push(entry);
        if (delLogCache.length > MAX_LOG) delLogCache.splice(0, delLogCache.length - MAX_LOG);
        delLogDirty = true;   // buffered: flushed every 5 s, not per deletion
    }
    function flushDelLog() {
        if (delLogDirty) { try { GM_setValue('wipeDelLog', delLogCache); } catch (e) {} delLogDirty = false; }
    }
    setInterval(flushDelLog, 5000);
    // DOM snapshot — immediately visible data only, no clicks / extra requests
    function snapshot(c) {
        const isPost = c.classList.contains('link');
        let score = null;
        const scoreEl = c.querySelector('.tagline span.score, .midcol .score.unvoted, .midcol .score');
        if (scoreEl) {
            const t = scoreEl.getAttribute('title') || scoreEl.textContent || '';
            const m = String(t).match(/-?\d+/);
            if (m) score = parseInt(m[0], 10);
        }
        const subEl = c.querySelector('.tagline a.subreddit');
        const timeEl = c.querySelector('.tagline time');
        const title = isPost
            ? ((c.querySelector('a.title') || {}).textContent || '')
            : ((c.querySelector('p.parent a.title') || {}).textContent || '');
        const body = c.querySelector('.usertext-body .md');
        return {
            ts: new Date().toISOString(),
            created: timeEl ? (timeEl.getAttribute('datetime') || '') : '',
            kind: isPost ? 'post' : 'comment',
            id: c.getAttribute('data-fullname') || '',
            sub: subEl ? subEl.textContent.trim() : '',
            score: score,
            title: title.trim().slice(0, 120),
            text: body ? body.textContent.trim().slice(0, 200) : '',
            permalink: (c.querySelector('a.bylink, a.comments') || {}).href || ''
        };
    }
    // JSON snapshot — scores always available here
    function snapJson(it) {
        const d = it.data || {};
        const isPost = it.kind === 't3';
        return {
            ts: new Date().toISOString(),
            created: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : '',
            kind: isPost ? 'post' : 'comment',
            id: d.name || '',
            sub: d.subreddit ? 'r/' + d.subreddit : '',
            score: typeof d.score === 'number' ? d.score : null,
            title: String((isPost ? d.title : d.link_title) || '').slice(0, 120),
            text: String((isPost ? d.selftext : d.body) || '').trim().slice(0, 200),
            permalink: d.permalink ? 'https://old.reddit.com' + d.permalink : ''
        };
    }

    // ===== FILTERS =====
    function shouldSkip(sn) {
        if (fltAgeDays > 0 && sn.created) {
            const age = (Date.now() - new Date(sn.created).getTime()) / 86400000;
            if (age < fltAgeDays) return `newer than ${fltAgeDays}d`;
        }
        if (fltKarmaOn && sn.score !== null && sn.score >= fltKarmaMin) return `karma ${sn.score} ≥ ${fltKarmaMin}`;
        if (fltSubMode !== 'off') {
            const subs = fltSubs.toLowerCase().split(',').map(s => s.trim().replace(/^\/?r\//, '')).filter(Boolean);
            const cur = sn.sub.toLowerCase().replace(/^\/?r\//, '');
            const listed = subs.includes(cur);
            if (fltSubMode === 'skip' && listed) return `subreddit ${sn.sub} (skip list)`;
            if (fltSubMode === 'only' && !listed) return `subreddit ${sn.sub} (not in only-list)`;
        }
        return null;
    }

    // ===== TIMING =====
    async function rsleep() {
        let ms = rand(minD(), maxD());
        // predictive pacing: never spend the quota faster than it refills
        if (effMode() === 'api' && rl.remaining !== null && rl.remaining > 2 && rl.resetAt > Date.now()) {
            const pace = (rl.resetAt - Date.now()) / (rl.remaining - 2);
            ms = Math.max(ms, Math.min(pace, 30000));
        }
        await sleep(ms);
        while (paused && !stopped) await sleep(300);
        await waitOnline();
    }

    // AIMD-style adaptation: multiplicative slow-down, gentle speed-up
    function slowDown() {
        if (!adaptOn) return;
        avgDelay = Math.min(SPEED_MAX, Math.max(avgDelay + SPEED_STEP, Math.round(avgDelay * 1.5 / 50) * 50));
        GM_setValue('wipeAvgDelay', avgDelay);
        diag('adapt', { dir: 'slow', delay: avgDelay });
        updateLabels();
    }
    async function backoff(label) {
        S.backoffs++; saveStats();
        diag('backoff', { label: label, sec: backoffSec });
        lastIncident = Date.now();
        slowDown();
        for (let s = backoffSec; s > 0; s--) {
            if (stopped) return;
            setStatus(`${label} – backoff: ${s}s`);
            beat();
            await sleep(1000);
        }
    }
    setInterval(() => {
        if (adaptOn && running && !paused && Date.now() - lastIncident > adaptMin * 60000 && avgDelay > SPEED_MIN) {
            avgDelay = Math.max(SPEED_MIN, Math.min(avgDelay - 50, Math.round(avgDelay * 0.95 / 50) * 50));
            GM_setValue('wipeAvgDelay', avgDelay);
            lastIncident = Date.now();
            updateLabels();
            diag('adapt', { dir: 'fast', delay: avgDelay });
            logAction(`adaptive speed-up → ${(avgDelay / 1000).toFixed(1)}s`);
        }
    }, 10000);

    // periodic API retry after DOM fallback
    let lastApiFail = Date.now();
    setInterval(() => {
        if (apiRetryOn && apiBroken && mode === 'auto' && (apiRetryCount === 0 || apiRetriesLeft > 0) &&
            Date.now() - lastApiFail > apiRetryMin * 60000) {
            if (apiRetryCount !== 0) apiRetriesLeft--;
            apiBroken = false;
            sessionStorage.removeItem('wipeApiBroken');
            updateModeLabel();
            S.toApi = (S.toApi || 0) + 1; saveStats();
            diag('retry_api', { left: apiRetryCount === 0 ? -1 : apiRetriesLeft });
            logAction(`retrying API mode (${apiRetryCount === 0 ? '∞' : apiRetriesLeft + ' retries left'})`);
        }
    }, 10000);

    // watchdog: no progress & no heartbeat for WATCHDOG_MIN minutes → reload + resume
    setInterval(() => {
        if (running && !paused && !stopped && (!document.hidden || timerWorker) && Date.now() - lastBeat > WATCHDOG_MIN * 60000) {
            logAction(`watchdog: no progress for ${WATCHDOG_MIN} min → reload`);
            diag('watchdog', pageInfo());
            reloadAndContinue('Watchdog');
        }
    }, 30000);

    function reloadAndContinue(reason) {
        S.reloads++; saveStats();
        diag('reload', { reason: reason });
        flushStats(); flushDelLog(); flushDiag();
        setStatus(reason + ' – restarting...');
        sessionStorage.setItem('wipeAuto', '1');
        setTimeout(() => location.reload(), 1500);
    }

    async function opTick() {
        S.ops++; saveStats();
        if (S.ops % opsLimit === 0) {
            diag('long_break', { min: longBreakMin, ops: S.ops });
            const end = Date.now() + longBreakMin * 60000;
            while (Date.now() < end && !stopped) {
                setStatus(`Long break – ${fmtT((end - Date.now()) / 1000)} left`);
                beat();
                await sleep(1000);
            }
        }
    }

    // ===== API =====
    async function api(endpoint, params) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), apiTimeout * 1000);
        try {
            const res = await fetch('https://old.reddit.com/api/' + endpoint, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ api_type: 'json', uh: modhash(), ...params }),
                signal: ctrl.signal
            });
            clearTimeout(t);
            readRl(res);
            if (res.status === 429) return { rateLimited: true, message: '' };
            if (!res.ok) return { error: 'HTTP ' + res.status };
            const j = await res.json();
            const errs = j && j.json && j.json.errors || [];
            if (errs.length) {
                const codes = errs.map(e => e[0]).join(',');
                const message = errs.map(e => e[1] || '').join(' ');
                if (/RATELIMIT/i.test(codes)) return { rateLimited: true, message };
                return { error: codes, message, fatal: FATAL_RE.test(codes) };
            }
            return { ok: true };
        } catch (e) {
            clearTimeout(t);
            if (!navigator.onLine) return { offline: true };
            return { error: e.name === 'AbortError' ? 'timeout' : e.message };
        }
    }

    // returns: true | false | 'fatal' (permanent, e.g. locked/archived thread)
    async function apiWR(endpoint, params, label) {
        for (let att = 0; att <= backoffRounds; att++) {
            if (stopped) return false;
            await rlGuard(label);
            const r = await api(endpoint, params);
            if (r.ok) return true;
            if (r.offline) { att--; await waitOnline(); continue; }   // not an error, just wait
            if (r.fatal) {
                S.errOther = (S.errOther || 0) + 1; saveStats();
                diag('fatal', { ep: endpoint, code: r.error, msg: (r.message || '').slice(0, 120), id: params.thing_id || params.id || '' });
                logAction(`${label}: ${r.error} (permanent)`);
                return 'fatal';
            }
            if (r.rateLimited) {
                S.err429 = (S.err429 || 0) + 1; saveStats();
                lastIncident = Date.now();
                slowDown();
                // parse "try again in X minutes/seconds" for an exact wait
                let waitS = 65;
                const m = (r.message || '').match(/(\d+)\s*(minute|second)/i);
                if (m) waitS = parseInt(m[1], 10) * (/min/i.test(m[2]) ? 60 : 1) + 2;
                diag('rate_limited', { ep: endpoint, waitS: waitS, msg: (r.message || '').slice(0, 120) });
                for (let s = waitS; s > 0 && !stopped; s--) {
                    setStatus(`${label} – rate limited, waiting ${s}s`);
                    beat();
                    await sleep(1000);
                }
                att--; continue;   // rate-limit waits don't consume backoff rounds
            }
            S.errOther = (S.errOther || 0) + 1; saveStats();
            diag('api_error', { ep: endpoint, code: String(r.error).slice(0, 120), att: att, id: params.thing_id || params.id || '' });
            logAction(`${label} API error: ${r.error}`);
            if (r.error && /USER_REQUIRED|403/.test(r.error)) {
                if (await refreshModhash()) { logAction('modhash refreshed'); continue; }
            }
            if (att < backoffRounds) await backoff(`${label} failed (${att + 1}/${backoffRounds + 1})`);
        }
        diag('give_up', { ep: endpoint, id: params.thing_id || params.id || '' });
        return false;
    }

    // ===== ALERT =====
    let titleFlash = null;
    function flashTitle(msg) {
        const orig = document.title;
        let on = false;
        clearInterval(titleFlash);
        titleFlash = setInterval(() => { document.title = on ? orig : '⚠ ' + msg; on = !on; }, 1000);
    }
    const alertUser = msg => flashTitle(msg);
    function beep() {
        if (!beepOn) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.frequency.value = 880; g.gain.value = 0.08;
            o.start();
            setTimeout(() => { o.stop(); ctx.close(); }, 350);
        } catch (e) {}
    }

    // ===== UI =====
    const bar = document.createElement('div');
    bar.style.cssText = `position:fixed;bottom:20px;right:20px;z-index:99999;
        background:#222;color:#fff;padding:10px;border-radius:6px;
        font:12px monospace;min-width:290px;max-height:80vh;overflow-y:auto;`;
    const VERSION = (typeof GM_info !== 'undefined' && GM_info.script) ? GM_info.script.version : '';
    const ICON = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAoACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDy+lwaBywrpfDHgrVPE0j/AGaErBHgtNICq89gSPT0zWjdkKMeZ2Mm10W7vIUkgCMZJPLRGkVSx9snnqKXXNCv/DupNp+oxqkyqG+RwykHoQa6jxh4al8N6bp9lJIjybpJi0QPB+Xp34x1wK5K7nubyb7Td3D3DtwZnJfp0Gf89aUW2rsqcUpWiU6KKKszJbaVYLqGZ4xKsciu0bdHAOcH619JvqE2reGVvNBniV5o1eNjyFXuBx1HTp2r5nrp/B3iLU9Lvfs1peBIpAT5Uq7kZvbuPwrKqlyts3w6k6kVFXd+ux1HxQuVebQpJSlzGYy0nlM22U/KDj079P0rzyVovNlMcbJGSRGm/lP8eprpfGOs3N/JFJLBFbuQwd4JCfMzwSQR+tckQq5BOe4KjIP50U3FpSTKrRnTbpzVnf8Ar5DDgk4GB6UUlFanMFKCVOQcGiigCaW8mnRVmcybehY5xUGaKKSSWiKlKUneTuwooopkn//Z';
    bar.innerHTML = `
        <div id="wipe-head" style="font-weight:bold;border-bottom:1px solid #444;padding-bottom:4px;margin-bottom:4px;display:flex;align-items:center;justify-content:space-between;gap:6px;cursor:move;" title="Drag to move">
            <span>Reddit Comment Wipe <span style="color:#888;">v${VERSION}</span></span>
            <span style="display:flex;align-items:center;gap:4px;">
                <img src="${ICON}" alt="" style="width:40px;height:40px;border-radius:6px;flex-shrink:0;">
                <button id="wipe-min" style="cursor:pointer;background:#444;color:#fff;border:0;border-radius:3px;width:18px;">–</button>
            </span>
        </div>
        <div id="wipe-status">Idle</div>
        <div id="wipe-body">
        <div>Mode: <button id="wipe-mode" style="cursor:pointer;"></button> <span id="wipe-effmode"></span></div>
        <div>Quota: <span id="wipe-rl">-</span> | Progress: <span id="wipe-prog">-</span></div>
        <div id="wipe-log" style="margin-top:4px;color:#aaa;max-width:290px;"></div>
        <div id="wipe-sorts" style="margin-top:4px;"></div>
        <div>Edited: <span id="wipe-e">0</span> | Deleted: <span id="wipe-d">0</span> | Errors: <span id="wipe-x">0</span></div>
        <div>Edit skip: <span id="wipe-es">0</span> | Locked: <span id="wipe-el">0</span> | Stale skip: <span id="wipe-st">0</span></div>
        <div>Filtered: <span id="wipe-f">0</span> | Would delete: <span id="wipe-dryn">0</span></div>
        <div>Backoffs: <span id="wipe-b">0</span> | Restarts: <span id="wipe-r">0</span></div>
        <div>API→DOM: <span id="wipe-td">0</span> | DOM→API: <span id="wipe-ta">0</span> | 429: <span id="wipe-e429">0</span> | Other err: <span id="wipe-eoth">0</span></div>
        <div>Runtime: <span id="wipe-t">0:00:00</span> | Ops: <span id="wipe-o">0</span></div>
        <div>Rate: <span id="wipe-rate">-</span> del/min (5 min) | total: <span id="wipe-rate2">-</span></div>
        <div>Page ~<span id="wipe-eta">?</span> | Total ~<span id="wipe-eta2">?</span></div>
        <div style="margin-top:4px;">Speed: <button id="wipe-slower">◀</button> <span id="wipe-speed"></span> <button id="wipe-faster">▶</button></div>
        <div>Jitter: <button id="wipe-sp-down">◀</button> <span id="wipe-sp"></span> <button id="wipe-sp-up">▶</button></div>
        <div>Backoff rounds: <button id="wipe-br-down">◀</button> <span id="wipe-br"></span> <button id="wipe-br-up">▶</button></div>
        <div>Backoff time: <button id="wipe-bs-down">◀</button> <span id="wipe-bs"></span> <button id="wipe-bs-up">▶</button></div>
        <div>API timeout: <button id="wipe-to-down">◀</button> <span id="wipe-to"></span> <button id="wipe-to-up">▶</button></div>
        <div>Adaptive: <button id="wipe-ad-toggle" style="cursor:pointer;"></button>
            speed-up <button id="wipe-ad-down">◀</button> <span id="wipe-ad"></span> <button id="wipe-ad-up">▶</button></div>
        <div>Random text: <button id="wipe-rt-toggle" style="cursor:pointer;"></button> | Beep: <button id="wipe-bp-toggle" style="cursor:pointer;"></button></div>
        <div>Refresh every: <button id="wipe-rf-down">◀</button> <span id="wipe-rf"></span> <button id="wipe-rf-up">▶</button> deletions (DOM)</div>
        <div>Long break every: <button id="wipe-ol-down">◀</button> <span id="wipe-ol"></span> <button id="wipe-ol-up">▶</button> ops</div>
        <div>Break length: <button id="wipe-lb-down">◀</button> <span id="wipe-lb"></span> <button id="wipe-lb-up">▶</button></div>
        <div>API retry: <button id="wipe-ar-toggle" style="cursor:pointer;"></button>
            every <button id="wipe-arm-down">◀</button> <span id="wipe-arm"></span> <button id="wipe-arm-up">▶</button>,
            max <button id="wipe-arc-down">◀</button> <span id="wipe-arc"></span> <button id="wipe-arc-up">▶</button></div>
        <div style="margin-top:4px;border-top:1px dashed #444;padding-top:4px;">
            Dry run: <button id="wipe-dry-toggle" style="cursor:pointer;"></button> |
            Posts: <button id="wipe-po-toggle" style="cursor:pointer;"></button></div>
        <div>Min age: <button id="wipe-fa-down">◀</button> <span id="wipe-fa"></span> <button id="wipe-fa-up">▶</button></div>
        <div>Keep karma ≥: <button id="wipe-fk-toggle" style="cursor:pointer;"></button>
            <button id="wipe-fk-down">◀</button> <span id="wipe-fk"></span> <button id="wipe-fk-up">▶</button></div>
        <div>Subs: <button id="wipe-fs-mode" style="cursor:pointer;"></button>
            <input id="wipe-fs" placeholder="sub1, sub2" style="width:120px;background:#333;color:#fff;border:1px solid #555;font:11px monospace;"></div>
        <div>Del log: <span id="wipe-dlogn">0</span> items
            <button id="wipe-dlog" style="cursor:pointer;background:#060;color:#fff;">⬇ CSV</button>
            <button id="wipe-dlog-clear" style="cursor:pointer;background:#600;color:#fff;">✕</button></div>
        <div>Diag log: <span id="wipe-diagn">0</span> events
            <button id="wipe-diag" style="cursor:pointer;background:#046;color:#fff;">⬇ JSON</button>
            <button id="wipe-diag-clear" style="cursor:pointer;background:#600;color:#fff;">✕</button></div>
        <button id="wipe-start" style="background:red;color:#fff;padding:5px;margin-top:5px;cursor:pointer;">START</button>
        <button id="wipe-pause" style="background:#555;color:#fff;padding:5px;cursor:pointer;" disabled>PAUSE</button>
        <button id="wipe-stop" style="background:#800;color:#fff;padding:5px;cursor:pointer;" disabled>STOP</button>
        <button id="wipe-reset" style="background:#046;color:#fff;padding:5px;cursor:pointer;">RESET</button>
        <button id="wipe-export" style="background:#060;color:#fff;padding:5px;cursor:pointer;">EXPORT</button>
        <div id="wipe-failed" style="margin-top:5px;"></div>
        <div style="margin-top:6px;border-top:1px solid #444;padding-top:4px;text-align:center;">
            <a href="https://donatr.ee/bgl-90" target="_blank" style="color:#a8f;"><span id="wipe-cup">☕</span> Support Reddit Comment Wipe</a>
        </div>
        </div>
    `;
    document.body.appendChild(bar);
    const $ = id => document.getElementById(id);
    const setStatus = t => $('wipe-status').textContent = (dryRun ? '[DRY] ' : '') + t;
    setInterval(() => {
        const cup = $('wipe-cup');
        if (cup) { cup.textContent = '❤️'; setTimeout(() => cup.textContent = '☕', 1500); }
    }, 8000);

    function applyCollapsed() {
        $('wipe-body').style.display = collapsed ? 'none' : '';
        $('wipe-min').textContent = collapsed ? '+' : '–';
    }
    $('wipe-min').onclick = () => { collapsed = !collapsed; GM_setValue('wipeCollapsed', collapsed); applyCollapsed(); };
    applyCollapsed();

    (function () {
        const h = $('wipe-head');
        let moving = false, sx = 0, sy = 0, ox = 0, oy = 0;
        h.addEventListener('mousedown', e => {
            if (/BUTTON|A|IMG|INPUT/.test(e.target.tagName)) return;
            moving = true; sx = e.clientX; sy = e.clientY;
            const r = bar.getBoundingClientRect(); ox = r.left; oy = r.top;
            e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!moving) return;
            bar.style.left = Math.max(0, ox + e.clientX - sx) + 'px';
            bar.style.top = Math.max(0, oy + e.clientY - sy) + 'px';
            bar.style.right = 'auto'; bar.style.bottom = 'auto';
        });
        document.addEventListener('mouseup', () => moving = false);
    })();

    const LOG = [];
    function logAction(t) {
        LOG.unshift(new Date().toLocaleTimeString() + ' ' + t);
        if (LOG.length > 5) LOG.pop();
        const el = $('wipe-log');
        if (el) el.innerHTML = LOG.map(l => `<div>${l}</div>`).join('');
    }

    function updateModeLabel() {
        $('wipe-mode').textContent = mode.toUpperCase();
        $('wipe-effmode').textContent = `→ ${effMode().toUpperCase()}${apiBroken && mode === 'auto' ? ' (API failed, DOM fallback)' : ''}`;
    }
    $('wipe-mode').onclick = () => {
        mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
        GM_setValue('wipeMode', mode);
        if (mode !== 'auto') { apiBroken = false; sessionStorage.removeItem('wipeApiBroken'); }
        updateModeLabel();
    };

    function updateSortsPanel() {
        const cur = currentSort();
        $('wipe-sorts').innerHTML = SORTS.map(s => {
            const n = S.sortDel[s] || 0;
            const st = S.sortDone[s] ? 'done' : (s === cur && running ? 'in progress' : 'pending');
            return `<div style="color:${S.sortDone[s] ? '#8f8' : s === cur ? '#ff8' : '#888'};">${s === cur ? '▶ ' : ''}${s}: ${n} – ${st}</div>`;
        }).join('') + (S.finalPass ? '<div style="color:#f80;">final verification pass</div>' : '');
    }

    function updateFailedList() {
        $('wipe-failed').innerHTML = S.failed.length
            ? '<b>Skipped:</b><br>' + S.failed.map((u, i) => /^t[13]_/.test(u)
                ? `<span style="color:#f88;">${u}</span>`
                : `<a href="${u}" target="_blank" style="color:#f88;">#${i + 1}</a>`).join(' ')
            : '';
    }

    function updateLabels() {
        $('wipe-speed').textContent = `avg ${(avgDelay / 1000).toFixed(1)}s (${(minD() / 1000).toFixed(2)}–${(maxD() / 1000).toFixed(2)}s)`;
        $('wipe-sp').textContent = `±${spreadPct}%`;
        $('wipe-br').textContent = backoffRounds;
        $('wipe-bs').textContent = backoffSec + 's';
        $('wipe-to').textContent = apiTimeout + 's';
        $('wipe-ad-toggle').textContent = adaptOn ? 'ON' : 'OFF';
        $('wipe-ad').textContent = adaptMin + ' min';
        $('wipe-rt-toggle').textContent = randomText ? 'ON' : 'OFF (".")';
        $('wipe-bp-toggle').textContent = beepOn ? 'ON' : 'OFF';
        $('wipe-rf').textContent = refreshAfter;
        $('wipe-ol').textContent = opsLimit;
        $('wipe-lb').textContent = longBreakMin + ' min';
        $('wipe-ar-toggle').textContent = apiRetryOn ? 'ON' : 'OFF';
        $('wipe-arm').textContent = apiRetryMin + ' min';
        $('wipe-arc').textContent = apiRetryCount === 0 ? '∞' : apiRetryCount + 'x';
        $('wipe-dry-toggle').textContent = dryRun ? 'ON (nothing is deleted)' : 'OFF';
        $('wipe-dry-toggle').style.background = dryRun ? '#f80' : '';
        $('wipe-po-toggle').textContent = doPosts ? 'ON' : 'OFF';
        $('wipe-fa').textContent = fltAgeDays === 0 ? 'off' : fltAgeDays + ' d';
        $('wipe-fk-toggle').textContent = fltKarmaOn ? 'ON' : 'OFF';
        $('wipe-fk').textContent = fltKarmaMin;
        $('wipe-fs-mode').textContent = fltSubMode.toUpperCase();
        updateModeLabel();
    }
    $('wipe-slower').onclick = () => { avgDelay = Math.min(SPEED_MAX, avgDelay + SPEED_STEP); GM_setValue('wipeAvgDelay', avgDelay); updateLabels(); };
    $('wipe-faster').onclick = () => { avgDelay = Math.max(SPEED_MIN, avgDelay - SPEED_STEP); GM_setValue('wipeAvgDelay', avgDelay); updateLabels(); };
    $('wipe-sp-down').onclick = () => { spreadPct = Math.max(SPREAD_MIN, spreadPct - SPREAD_STEP); GM_setValue('wipeSpreadPct', spreadPct); updateLabels(); };
    $('wipe-sp-up').onclick = () => { spreadPct = Math.min(SPREAD_MAX, spreadPct + SPREAD_STEP); GM_setValue('wipeSpreadPct', spreadPct); updateLabels(); };
    $('wipe-br-down').onclick = () => { backoffRounds = Math.max(0, backoffRounds - 1); GM_setValue('wipeBackoffRounds', backoffRounds); updateLabels(); };
    $('wipe-br-up').onclick = () => { backoffRounds = Math.min(3, backoffRounds + 1); GM_setValue('wipeBackoffRounds', backoffRounds); updateLabels(); };
    $('wipe-bs-down').onclick = () => { backoffSec = Math.max(5, backoffSec - 5); GM_setValue('wipeBackoffSec', backoffSec); updateLabels(); };
    $('wipe-bs-up').onclick = () => { backoffSec = Math.min(60, backoffSec + 5); GM_setValue('wipeBackoffSec', backoffSec); updateLabels(); };
    $('wipe-to-down').onclick = () => { apiTimeout = Math.max(5, apiTimeout - 5); GM_setValue('wipeApiTimeout', apiTimeout); updateLabels(); };
    $('wipe-to-up').onclick = () => { apiTimeout = Math.min(60, apiTimeout + 5); GM_setValue('wipeApiTimeout', apiTimeout); updateLabels(); };
    $('wipe-ad-toggle').onclick = () => { adaptOn = !adaptOn; GM_setValue('wipeAdaptOn', adaptOn); updateLabels(); };
    $('wipe-ad-down').onclick = () => { adaptMin = Math.max(1, adaptMin - 1); GM_setValue('wipeAdaptMin', adaptMin); updateLabels(); };
    $('wipe-ad-up').onclick = () => { adaptMin = Math.min(15, adaptMin + 1); GM_setValue('wipeAdaptMin', adaptMin); updateLabels(); };
    $('wipe-rt-toggle').onclick = () => { randomText = !randomText; GM_setValue('wipeRandomText', randomText); updateLabels(); };
    $('wipe-bp-toggle').onclick = () => { beepOn = !beepOn; GM_setValue('wipeBeepOn', beepOn); if (beepOn) beep(); updateLabels(); };
    $('wipe-rf-down').onclick = () => { refreshAfter = Math.max(5, refreshAfter - 5); GM_setValue('wipeRefreshAfter', refreshAfter); updateLabels(); };
    $('wipe-rf-up').onclick = () => { refreshAfter = Math.min(100, refreshAfter + 5); GM_setValue('wipeRefreshAfter', refreshAfter); updateLabels(); };
    $('wipe-ol-down').onclick = () => { opsLimit = Math.max(100, opsLimit - 100); GM_setValue('wipeOpsLimit', opsLimit); updateLabels(); };
    $('wipe-ol-up').onclick = () => { opsLimit = Math.min(2000, opsLimit + 100); GM_setValue('wipeOpsLimit', opsLimit); updateLabels(); };
    $('wipe-lb-down').onclick = () => { longBreakMin = Math.max(1, longBreakMin - 1); GM_setValue('wipeLongBreakMin', longBreakMin); updateLabels(); };
    $('wipe-lb-up').onclick = () => { longBreakMin = Math.min(30, longBreakMin + 1); GM_setValue('wipeLongBreakMin', longBreakMin); updateLabels(); };
    $('wipe-ar-toggle').onclick = () => { apiRetryOn = !apiRetryOn; GM_setValue('wipeApiRetryOn', apiRetryOn); updateLabels(); };
    $('wipe-arm-down').onclick = () => { apiRetryMin = Math.max(1, apiRetryMin - 1); GM_setValue('wipeApiRetryMin', apiRetryMin); updateLabels(); };
    $('wipe-arm-up').onclick = () => { apiRetryMin = Math.min(60, apiRetryMin + 1); GM_setValue('wipeApiRetryMin', apiRetryMin); updateLabels(); };
    $('wipe-arc-down').onclick = () => { apiRetryCount = Math.max(0, apiRetryCount - 1); apiRetriesLeft = Math.min(apiRetriesLeft, apiRetryCount); GM_setValue('wipeApiRetryCount', apiRetryCount); updateLabels(); };
    $('wipe-arc-up').onclick = () => { apiRetryCount = Math.min(10, apiRetryCount + 1); apiRetriesLeft = apiRetryCount; GM_setValue('wipeApiRetryCount', apiRetryCount); updateLabels(); };
    $('wipe-dry-toggle').onclick = () => { dryRun = !dryRun; GM_setValue('wipeDryRun', dryRun); updateLabels(); setStatus(running ? 'Running...' : 'Idle'); };
    $('wipe-po-toggle').onclick = () => { doPosts = !doPosts; GM_setValue('wipeDoPosts', doPosts); updateLabels(); };
    $('wipe-fa-down').onclick = () => { fltAgeDays = Math.max(0, fltAgeDays - 30); GM_setValue('wipeFltAgeDays', fltAgeDays); updateLabels(); };
    $('wipe-fa-up').onclick = () => { fltAgeDays = Math.min(3650, fltAgeDays + 30); GM_setValue('wipeFltAgeDays', fltAgeDays); updateLabels(); };
    $('wipe-fk-toggle').onclick = () => { fltKarmaOn = !fltKarmaOn; GM_setValue('wipeFltKarmaOn', fltKarmaOn); updateLabels(); };
    $('wipe-fk-down').onclick = () => { fltKarmaMin = Math.max(5, fltKarmaMin - 5); GM_setValue('wipeFltKarmaMin', fltKarmaMin); updateLabels(); };
    $('wipe-fk-up').onclick = () => { fltKarmaMin = Math.min(10000, fltKarmaMin + 5); GM_setValue('wipeFltKarmaMin', fltKarmaMin); updateLabels(); };
    $('wipe-fs-mode').onclick = () => { fltSubMode = SUBMODES[(SUBMODES.indexOf(fltSubMode) + 1) % SUBMODES.length]; GM_setValue('wipeFltSubMode', fltSubMode); updateLabels(); };
    $('wipe-fs').value = fltSubs;
    $('wipe-fs').onchange = e => { fltSubs = e.target.value; GM_setValue('wipeFltSubs', fltSubs); };

    const csvEsc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    function downloadCsv(auto) {
        flushDelLog();
        const log = delLog();
        if (!log.length) { if (!auto) setStatus('Deletion log is empty'); return; }
        const head = ['deleted_at', 'created_at', 'kind', 'subreddit', 'score', 'title', 'text', 'permalink', 'dry_run'];
        const rows = log.map(e => [e.ts, e.created, e.kind, e.sub, e.score == null ? '' : e.score, e.title, e.text, e.permalink, e.dry ? '1' : ''].map(csvEsc).join(','));
        const blob = new Blob(['\uFEFF' + head.join(',') + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'reddit-wipe-log-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.csv';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        if (!auto) setStatus(`Deletion log downloaded (${log.length} items)`);
    }
    $('wipe-dlog').onclick = () => downloadCsv(false);
    $('wipe-dlog-clear').onclick = () => {
        if (confirm('Clear the deletion log (' + delLog().length + ' items)? This cannot be undone.')) {
            delLogCache = []; delLogDirty = false;
            GM_setValue('wipeDelLog', []);
            setStatus('Deletion log cleared');
        }
    };
    $('wipe-diag').onclick = () => {
        flushDiag();
        const payload = {
            exported: new Date().toISOString(),
            env: pageInfo(),
            settings: settingsSnap(),
            stats: S,
            events: diagBuf
        };
        const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'reddit-wipe-diag-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        setStatus(`Diagnostic log downloaded (${diagBuf.length} events)`);
    };
    $('wipe-diag-clear').onclick = () => {
        if (confirm('Clear the diagnostic log (' + diagBuf.length + ' events)?')) {
            diagBuf = [];
            GM_setValue('wipeDiagLog', []);
            setStatus('Diagnostic log cleared');
        }
    };
    updateLabels();

    const fmtT = sec => {
        sec = Math.max(0, Math.round(sec));
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
    };
    const fmtHMS = sec => {
        sec = Math.max(0, Math.round(sec));
        return `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    };

    function rateTick() {
        S.delTimes.push(Date.now());
        if (S.delTimes.length > 600) S.delTimes.splice(0, S.delTimes.length - 600);
    }

    setInterval(() => {
        $('wipe-e').textContent = S.edited;
        $('wipe-d').textContent = S.deleted;
        $('wipe-x').textContent = S.errors;
        $('wipe-es').textContent = S.editSkipped || 0;
        $('wipe-el').textContent = S.editLocked || 0;
        $('wipe-f').textContent = S.filtered || 0;
        $('wipe-dryn').textContent = S.wouldDel || 0;
        $('wipe-st').textContent = S.staleSkip || 0;
        $('wipe-b').textContent = S.backoffs;
        $('wipe-r').textContent = S.reloads;
        $('wipe-td').textContent = S.toDom || 0;
        $('wipe-ta').textContent = S.toApi || 0;
        $('wipe-e429').textContent = S.err429 || 0;
        $('wipe-eoth').textContent = S.errOther || 0;
        $('wipe-o').textContent = S.ops;
        $('wipe-dlogn').textContent = delLog().length;
        $('wipe-diagn').textContent = diagBuf.length;
        $('wipe-rl').textContent = rl.remaining !== null
            ? `${Math.floor(rl.remaining)} left, reset ${Math.max(0, Math.ceil((rl.resetAt - Date.now()) / 1000))}s`
            : '-';
        const target = dryRun ? (S.wouldDel || 0) : S.deleted;
        $('wipe-prog').textContent = S.totalEst
            ? `${target}/${S.totalEst} (${Math.min(100, Math.round(target / S.totalEst * 100))}%)`
            : '-';
        const now = Date.now();
        let recentRate = 0;
        if (S.start) {
            const sec = (now - S.start) / 1000;
            $('wipe-t').textContent = fmtHMS(sec);
            $('wipe-rate2').textContent = sec > 30 ? (S.deleted / (sec / 60)).toFixed(1) + ' del/min' : '-';
            const winMs = Math.min(5 * 60000, now - S.start);
            if (winMs > 30000) {
                const rc = S.delTimes.filter(t => now - t < 5 * 60000).length;
                recentRate = rc / (winMs / 60000);
            }
            $('wipe-rate').textContent = recentRate ? recentRate.toFixed(1) : '-';
        }
        const left = jsonActive ? jsonQueueLeft : getThings().length;
        const perItem = effMode() === 'api' ? 2 : 7;
        const stepSec = avgDelay / 1000;
        $('wipe-eta').textContent = left ? fmtT(left * perItem * stepSec) : '-';
        // total ETA: prefer measured recent rate; fall back to step estimate
        let totalEta = null;
        if (S.totalEst && !dryRun) {
            const remaining = Math.max(0, S.totalEst - S.deleted);
            totalEta = recentRate > 0.2 ? remaining / recentRate * 60 : remaining * perItem * stepSec;
        } else if (left) {
            const finished = SORTS.filter(s => S.sortDone[s]);
            const avgSort = finished.length ? finished.reduce((a, s) => a + (S.sortDel[s] || 0), 0) / finished.length : left;
            totalEta = left * perItem * stepSec;
            const cur = currentSort();
            SORTS.forEach(s => { if (!S.sortDone[s] && s !== cur) totalEta += avgSort * perItem * stepSec; });
        }
        $('wipe-eta2').textContent = totalEta ? fmtT(totalEta) : '-';
        updateSortsPanel();
        updateFailedList();
    }, 1000);

    // ===== DOM HELPERS =====
    const getThings = () =>
        Array.from(document.querySelectorAll(doPosts ? 'div.thing.comment, div.thing.link' : 'div.thing.comment'))
            .filter(c => !c.classList.contains('deleted') && !c.dataset.wiped && !c.dataset.wfiltered);

    const permalink = c => (c.querySelector('a.bylink, a.comments') || {}).href || '?';

    async function waitFor(cond) {
        for (let i = 0; i < apiTimeout * 2; i++) {
            await sleep(500);
            if (cond()) return true;
        }
        return false;
    }

    function countDeleted(id, snap) {
        if (!id || !S.doneIds[id]) {
            S.deleted++;
            const cs = currentSort();
            S.sortDel[cs] = (S.sortDel[cs] || 0) + 1;
            if (snap) logDeleted(snap);
            rateTick();
        }
        if (id) S.doneIds[id] = 1;
        saveStats();
    }
    function markDeleted(c, snap) {
        countDeleted(c.getAttribute('data-fullname'), snap);
        S.delSinceRefresh = (S.delSinceRefresh || 0) + 1;
        saveStats();
        c.remove();
    }

    // ===== JSON LISTING ENGINE (primary in API mode) =====
    const listUrl = (sort, after) =>
        `https://old.reddit.com/user/${uname()}/${doPosts ? 'overview' : 'comments'}.json?raw_json=1&limit=100&sort=${sort}${after ? '&after=' + after : ''}`;

    async function fetchJson(url, label) {
        for (let att = 0; att < 5; att++) {
            if (stopped) return null;
            await waitOnline();
            await rlGuard(label);
            try {
                const res = await fetch(url, { credentials: 'include' });
                readRl(res);
                if (res.status === 429) {
                    S.err429 = (S.err429 || 0) + 1; saveStats();
                    diag('listing_429', { url: url });
                    slowDown();
                    for (let s = 65; s > 0 && !stopped; s--) { setStatus(`${label} 429 – waiting ${s}s`); beat(); await sleep(1000); }
                    att--; continue;
                }
                if (!res.ok) { diag('listing_http', { url: url, status: res.status }); await sleep(2000); continue; }
                return await res.json();
            } catch (e) {
                if (!navigator.onLine) { att--; continue; }
                diag('listing_exc', { url: url, msg: String(e).slice(0, 120) });
                await sleep(2000);
            }
        }
        diag('listing_fail', { url: url });
        return null;
    }

    async function estimateTotal() {
        if (S.totalEst) return;
        setStatus('Counting items (estimate)...');
        let after = '', n = 0;
        for (let i = 0; i < 10; i++) {
            const j = await fetchJson(listUrl('new', after), 'Count');
            if (!j || !j.data) break;
            n += (j.data.children || []).length;
            after = j.data.after;
            beat();
            if (!after) break;
            await sleep(600);
        }
        S.totalEst = n; saveStats();
        diag('estimate', { n: n });
        logAction(`≈ ${n} items reachable via listings`);
    }

    // returns 'ok' | 'fail' | 'skip' | 'filtered' | 'dry'
    async function wipeJsonItem(it) {
        const d = it.data || {};
        const id = d.name;
        if (!id) return 'skip';
        if (S.doneIds[id]) { S.staleSkip = (S.staleSkip || 0) + 1; saveStats(); return 'skip'; }
        const sn = snapJson(it);
        const reason = shouldSkip(sn);
        if (reason) { S.filtered = (S.filtered || 0) + 1; saveStats(); logAction('⏭ filtered: ' + reason); return 'filtered'; }
        if (dryRun) {
            if (!S.drySeen[id]) {
                S.drySeen[id] = 1;
                S.wouldDel = (S.wouldDel || 0) + 1; saveStats();
                logDeleted(Object.assign({}, sn, { dry: true }));
            }
            return 'dry';
        }
        logAction('▶ ' + (sn.title || sn.text || '?').slice(0, 40));
        const canEdit = it.kind === 't1' || d.is_self;
        if (canEdit) {
            if (!isWiped(it.kind === 't3' ? d.selftext : d.body)) {
                const re = await apiWR('editusertext', { thing_id: id, text: wipeText() }, 'Edit');
                if (re === true) {
                    S.edited++; saveStats();
                    logAction('edit OK (JSON)');
                    await opTick();
                    await rsleep();
                } else if (re === 'fatal') {
                    S.editLocked = (S.editLocked || 0) + 1; saveStats();
                    logAction('edit locked/archived – deleting anyway');
                } else return 'fail';
            } else { S.editSkipped = (S.editSkipped || 0) + 1; saveStats(); logAction('already overwritten – edit skipped'); }
        }
        const rd = await apiWR('del', { id: id }, 'Delete');
        if (rd !== true) return 'fail';
        logAction('deleted ✓ (JSON)');
        countDeleted(id, sn);
        await opTick();
        return 'ok';
    }

    // one full cursor walk of a sort; returns deleted count, or null on listing failure
    async function jsonOnePass(sort) {
        let after = '', deleted = 0;
        for (;;) {
            if (stopped) return deleted;
            const j = await fetchJson(listUrl(sort, after), `[${sort}] listing`);
            if (!j || !j.data) { logAction('listing fetch failed'); return null; }
            const items = j.data.children || [];
            jsonQueueLeft = items.length;
            setStatus(`Running [JSON] [${sort}] (${items.length} items in batch)`);
            for (const it of items) {
                if (stopped) return deleted;
                jsonQueueLeft--;
                const r = await wipeJsonItem(it);
                if (r === 'ok') { deleted++; await rsleep(); }
                else if (r === 'fail') {
                    S.errors++;
                    S.failed.push(snapJson(it).permalink || (it.data && it.data.name) || '?');
                    saveStats();
                    diag('item_fail', { engine: 'json', id: (it.data && it.data.name) || '?' });
                    await rsleep();
                } else if (r === 'dry') await sleep(80);
            }
            after = j.data.after;
            if (!after) return deleted;
            await rsleep();
        }
    }

    async function jsonSortCycle() {
        for (const sort of SORTS) {
            if (stopped) return true;
            if (S.sortDone[sort]) continue;
            activeSort = sort;
            let n;
            do {
                n = await jsonOnePass(sort);
                if (n === null) return false;
            } while (n > 0 && !dryRun && !stopped);
            S.sortDone[sort] = true; saveStats();
            diag('sort_done', { sort: sort, del: S.sortDel[sort] || 0 });
        }
        return true;
    }

    async function retryFailedApi() {
        if (!S.failed.length || S.retriedFailed) return;
        S.retriedFailed = true; saveStats();
        setStatus(`Retrying ${S.failed.length} skipped items...`);
        const still = [];
        for (const u of S.failed) {
            if (stopped) return;
            let id = null;
            if (/^t[13]_/.test(u)) id = u;
            else {
                const mc = u.match(/\/comments\/[^/]+\/[^/]+\/([a-z0-9]+)/i);
                const mp = u.match(/\/comments\/([a-z0-9]+)/i);
                id = mc ? 't1_' + mc[1] : (mp ? 't3_' + mp[1] : null);
            }
            if (!id) { still.push(u); continue; }
            logAction('retry ▶ ' + id);
            const e = await apiWR('editusertext', { thing_id: id, text: wipeText() }, 'Retry-edit');
            await rsleep();
            const d = (e === true || e === 'fatal' || id.startsWith('t3_')) && await apiWR('del', { id: id }, 'Retry-delete') === true;
            await rsleep();
            if (d) {
                if (e === true) S.edited++;
                countDeleted(id, { ts: new Date().toISOString(), created: '', kind: id.startsWith('t3_') ? 'post' : 'comment', id: id, sub: '', score: null, title: '(retry pass)', text: '', permalink: /^t/.test(u) ? '' : u });
                logAction('retry deleted ✓');
            } else still.push(u);
            saveStats();
        }
        S.failed = still; saveStats();
    }

    function doneSummary() {
        const sec = S.start ? (Date.now() - S.start) / 1000 : 0;
        const msg = dryRun
            ? `DRY RUN DONE – ${S.wouldDel || 0} would be deleted, ${S.filtered || 0} filtered (Del log CSV has the details)`
            : `DONE – ${S.deleted} deleted, ${S.edited} edited, ${S.filtered || 0} filtered, ${S.errors} errors, runtime ${fmtHMS(sec)}`;
        diag('done', { dry: dryRun, deleted: S.deleted, edited: S.edited, errors: S.errors, filtered: S.filtered || 0, wouldDel: S.wouldDel || 0, runtimeS: Math.round(sec) });
        alertUser(dryRun ? 'DRY DONE' : 'DONE');
        beep();
        if (!dryRun && delLog().length) downloadCsv(true);   // summary report: auto CSV download
        finish(msg);
    }

    async function runJson() {
        jsonActive = true;
        await estimateTotal();
        if (!await jsonSortCycle()) { jsonActive = false; return false; }
        if (stopped) { jsonActive = false; return true; }
        if (!dryRun && !S.finalPass) {
            S.finalPass = true;
            S.sortDone = {}; saveStats();
            setStatus('Final verification pass...');
            if (!await jsonSortCycle()) { jsonActive = false; return false; }
        }
        if (stopped) { jsonActive = false; return true; }
        if (!dryRun) await retryFailedApi();
        doneSummary();
        jsonActive = false;
        return true;
    }

    // ===== DOM ENGINE (fallback) =====
    async function editThingDom(c) {
        const id = c.getAttribute('data-fullname');
        const fresh = () => document.querySelector(`div.thing[data-fullname="${id}"]`) || c;
        const body = () => fresh().querySelector('.usertext-body .md');
        if (body() && isWiped(body().textContent)) { S.editSkipped = (S.editSkipped || 0) + 1; saveStats(); logAction('already overwritten – edit skipped'); return true; }
        const txt = wipeText();
        for (let att = 0; att <= backoffRounds; att++) {
            if (stopped) return false;
            const editLink = fresh().querySelector('ul.flat-list a.edit-usertext');
            if (!editLink) return false;
            editLink.click(); logAction('edit opened (DOM)');
            await rsleep();
            const ta = fresh().querySelector('.usertext-edit textarea');
            if (!ta) { if (att < backoffRounds) { await backoff('No textarea'); continue; } break; }
            ta.value = txt;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            await rsleep();
            const saveBtn = fresh().querySelector('.usertext-edit button.save');
            if (!saveBtn) { if (att < backoffRounds) { await backoff('No save button'); continue; } break; }
            saveBtn.click(); logAction('saving (DOM)');
            await opTick();
            if (await waitFor(() => body() && body().textContent.trim() === txt)) {
                S.edited++; saveStats();
                logAction('edit OK (DOM)');
                await rsleep();
                return true;
            }
            if (att < backoffRounds) await backoff(`Edit failed (${att + 1}/${backoffRounds + 1})`);
        }
        return false;
    }

    async function deleteThingDom(c, snap) {
        const id = c.getAttribute('data-fullname');
        const fresh = () => document.querySelector(`div.thing[data-fullname="${id}"]`) || c;
        const delForm = () => fresh().querySelector('form.del-button');
        for (let att = 0; att <= backoffRounds; att++) {
            if (stopped) return false;
            const f = delForm();
            if (f && f.textContent.trim() === 'deleted') { logAction('deleted ✓ (DOM)'); markDeleted(fresh(), snap); return true; }
            const toggle = f && f.querySelector('a.togglebutton');
            if (!toggle) return false;
            toggle.click(); logAction('delete clicked (DOM)');
            await rsleep();
            const yes = delForm() && delForm().querySelector('a.yes');
            if (yes) yes.click();
            await opTick();
            if (await waitFor(() => delForm() && delForm().textContent.trim() === 'deleted')) {
                await rsleep();
                logAction('deleted ✓ (DOM)');
                markDeleted(fresh(), snap);
                return true;
            }
            if (att < backoffRounds) await backoff(`Delete failed (${att + 1}/${backoffRounds + 1})`);
        }
        return false;
    }

    async function wipeThingDom(c, snap) {
        const isPost = c.classList.contains('link');
        const canEdit = !isPost || c.classList.contains('self');
        if (canEdit) {
            const e = await editThingDom(c);
            if (!e) return false;
            await rsleep();
        }
        return await deleteThingDom(c, snap);
    }

    async function wipeThingApi(c, snap) {
        const id = c.getAttribute('data-fullname');
        if (!id) return false;
        const isPost = c.classList.contains('link');
        const canEdit = !isPost || c.classList.contains('self');
        if (canEdit) {
            const body = c.querySelector('.usertext-body .md');
            if (!(body && isWiped(body.textContent))) {
                const re = await apiWR('editusertext', { thing_id: id, text: wipeText() }, 'Edit');
                if (re === true) {
                    S.edited++; saveStats();
                    logAction('edit OK (API)');
                    await opTick();
                    await rsleep();
                } else if (re === 'fatal') {
                    S.editLocked = (S.editLocked || 0) + 1; saveStats();
                    logAction('edit locked/archived – deleting anyway');
                } else return false;
            } else { S.editSkipped = (S.editSkipped || 0) + 1; saveStats(); logAction('already overwritten – edit skipped'); }
        }
        if (await apiWR('del', { id: id }, 'Delete') !== true) return false;
        logAction('deleted ✓ (API)');
        markDeleted(c, snap);
        await opTick();
        return true;
    }

    async function wipeThing(c, snap) {
        if (effMode() === 'api') {
            const ok = await wipeThingApi(c, snap);
            if (!ok && mode === 'auto' && !apiBroken) {
                apiBroken = true;
                lastApiFail = Date.now();
                S.toDom = (S.toDom || 0) + 1; saveStats();
                sessionStorage.setItem('wipeApiBroken', '1');
                updateModeLabel();
                diag('fallback_dom', { reason: 'api item failed', id: c.getAttribute('data-fullname') || '?' });
                logAction('API failed → DOM fallback');
                setStatus('API mode failed, switching to DOM...');
                return await wipeThingDom(c, snap);
            }
            return ok;
        }
        return await wipeThingDom(c, snap);
    }

    async function processPage() {
        const things = getThings();
        setStatus(`Running [${effMode().toUpperCase()}] [${currentSort()}] (${things.length} items)`);
        for (const c of things) {
            if (stopped) return;
            const id = c.getAttribute('data-fullname');
            if (id && S.doneIds[id]) {
                c.dataset.wiped = '1';
                S.staleSkip = (S.staleSkip || 0) + 1; saveStats();
                c.remove();
                continue;
            }
            const snap = snapshot(c);
            const reason = shouldSkip(snap);
            if (reason) {
                c.dataset.wfiltered = '1';
                S.filtered = (S.filtered || 0) + 1; saveStats();
                logAction('⏭ filtered: ' + reason);
                continue;
            }
            c.dataset.wiped = '1';
            logAction('▶ ' + (snap.title || snap.text || '?').slice(0, 40));
            if (dryRun) {
                if (!id || !S.drySeen[id]) {
                    if (id) S.drySeen[id] = 1;
                    S.wouldDel = (S.wouldDel || 0) + 1; saveStats();
                    logDeleted(Object.assign({}, snap, { dry: true }));
                    c.style.outline = '2px dashed #f80';
                }
                await sleep(150);
                continue;
            }
            try {
                if (!await wipeThing(c, snap)) { S.errors++; S.failed.push(permalink(c)); saveStats(); diag('item_fail', { engine: 'dom', id: id || '?' }); }
                await rsleep();
                if (S.delSinceRefresh >= refreshAfter) {
                    S.delSinceRefresh = 0; saveStats();
                    sessionStorage.setItem('wipeAuto', '1');
                    setStatus('Refreshing page...');
                    await sleep(1500);
                    location.reload();
                    return;
                }
            } catch (e) {
                S.errors++; S.failed.push(permalink(c)); saveStats();
                diag('item_exc', { engine: 'dom', id: id || '?', msg: String(e).slice(0, 120) });
            }
        }
    }

    async function runDom() {
        await processPage();
        if (stopped) return;

        const next = document.querySelector('.next-button a');
        if (next) {
            sessionStorage.setItem('wipeAuto', '1');
            setStatus('Next page...');
            await sleep(dryRun ? rand(500, 1000) : rand(3000, 6000));
            next.click();
            return;
        }

        const cs = currentSort();
        if (getThings().length === 0 && !S.emptyRetry[cs] && !dryRun) {
            S.emptyRetry[cs] = true; saveStats();
            reloadAndContinue(`[${cs}] appears empty – verifying`);
            return;
        }
        S.sortDone[cs] = true; saveStats();

        const nextSort = SORTS.find(s => !S.sortDone[s]);
        if (nextSort) {
            sessionStorage.setItem('wipeAuto', '1');
            setStatus(`[${cs}] done → switching to: ${nextSort}...`);
            await sleep(dryRun ? rand(500, 1000) : rand(3000, 6000));
            location.href = sortUrl(nextSort);
            return;
        }

        if (!S.finalPass && !dryRun) {
            S.finalPass = true;
            S.sortDone = {}; S.emptyRetry = {};
            saveStats();
            sessionStorage.setItem('wipeAuto', '1');
            setStatus('Final verification pass starting...');
            await sleep(rand(3000, 6000));
            location.href = sortUrl('new');
            return;
        }

        if (!dryRun) await retryFailedApi();
        doneSummary();
    }

    // ===== MAIN =====
    async function run() {
        if (running) return;
        running = true; stopped = false;
        if (!S.start) { S.start = Date.now(); saveStats(); }
        diag('start', { settings: settingsSnap(), page: pageInfo() });
        if (!await ownProfile()) {
            setStatus('ERROR: this is not the logged-in account\'s profile – aborted');
            diag('safety_lock', pageInfo());
            logAction('safety lock: profile/user mismatch');
            running = false;
            sessionStorage.removeItem('wipeAuto');
            return;
        }
        if (otherTabRunning()) {
            setStatus('ERROR: another tab is already running the wipe – aborted');
            diag('tab_lock', {});
            running = false;
            sessionStorage.removeItem('wipeAuto');
            return;
        }
        takeLock();
        sessionStorage.setItem('wipeAuto', '1');
        if (!dryRun && effMode() === 'api' && !modhash() && !await refreshModhash()) {
            if (mode === 'auto') { apiBroken = true; sessionStorage.setItem('wipeApiBroken', '1'); updateModeLabel(); diag('no_modhash', {}); logAction('no modhash → DOM'); }
            else { setStatus('ERROR: no modhash (API mode)'); running = false; return; }
        }
        $('wipe-start').disabled = true;
        $('wipe-pause').disabled = false;
        $('wipe-stop').disabled = false;

        if (effMode() === 'api') {
            const ok = await runJson();
            if (!ok && !stopped) {
                if (mode === 'auto') {
                    apiBroken = true;
                    lastApiFail = Date.now();
                    sessionStorage.setItem('wipeApiBroken', '1');
                    S.toDom = (S.toDom || 0) + 1; saveStats();
                    updateModeLabel();
                    diag('fallback_dom', { reason: 'json engine failed' });
                    logAction('JSON/API engine failed → DOM fallback');
                    await runDom();
                } else setStatus('ERROR: API/JSON engine failed');
            }
        } else await runDom();
    }

    function finish(msg) {
        running = false;
        diag('finish', { msg: msg });
        flushStats(); flushDelLog(); flushDiag();
        releaseLock();
        clearRunState();
        sessionStorage.removeItem('wipeAuto');
        setStatus(msg);
        $('wipe-start').disabled = false;
        $('wipe-pause').disabled = true;
        $('wipe-stop').disabled = true;
        updateFailedList();
    }

    // ===== CONTROLS =====
    $('wipe-start').onclick = run;
    $('wipe-pause').onclick = () => {
        paused = !paused;
        $('wipe-pause').textContent = paused ? 'RESUME' : 'PAUSE';
        diag(paused ? 'pause' : 'resume', {});
        setStatus(paused ? 'Paused' : 'Running...');
    };
    $('wipe-stop').onclick = () => {
        stopped = true; paused = false; running = false;
        diag('stop', {});
        sessionStorage.removeItem('wipeStats');
        finish('STOPPED');
    };
    $('wipe-reset').onclick = () => {
        stopped = true;
        diag('reset', {});
        flushDiag();
        clearRunState();
        releaseLock();
        sessionStorage.removeItem('wipeStats');
        sessionStorage.removeItem('wipeAuto');
        sessionStorage.removeItem('wipeApiBroken');
        GM_setValue('wipeAvgDelay', 1700);
        GM_setValue('wipeSpreadPct', 35);
        GM_setValue('wipeBackoffRounds', 3);
        GM_setValue('wipeBackoffSec', 30);
        GM_setValue('wipeApiTimeout', 15);
        GM_setValue('wipeMode', 'auto');
        GM_setValue('wipeAdaptOn', true);
        GM_setValue('wipeAdaptMin', 3);
        GM_setValue('wipeRandomText', true);
        GM_setValue('wipeRefreshAfter', 10);
        GM_setValue('wipeOpsLimit', 500);
        GM_setValue('wipeLongBreakMin', 7);
        GM_setValue('wipeApiRetryOn', true);
        GM_setValue('wipeApiRetryMin', 10);
        GM_setValue('wipeApiRetryCount', 0);
        GM_setValue('wipeDryRun', false);
        GM_setValue('wipeDoPosts', false);
        GM_setValue('wipeFltAgeDays', 0);
        GM_setValue('wipeFltKarmaOn', false);
        GM_setValue('wipeFltKarmaMin', 50);
        GM_setValue('wipeFltSubMode', 'off');
        GM_setValue('wipeFltSubs', '');
        GM_setValue('wipeCollapsed', false);
        GM_setValue('wipeBeepOn', false);
        // note: the deletion log (wipeDelLog) is intentionally NOT cleared by RESET
        location.reload();
    };
    $('wipe-export').onclick = () => {
        const data = JSON.stringify({
            exported: new Date().toISOString(), mode, effMode: effMode(), stats: S,
            settings: settingsSnap()
        }, null, 2);
        navigator.clipboard.writeText(data).then(() => setStatus('Stats copied to clipboard'));
    };

    // ===== 429 PAGE (DOM navigation fallback path) =====
    if (sessionStorage.getItem('wipeAuto') === '1' &&
        !document.querySelector('#siteTable') &&
        /429|too many requests|whoa there/i.test(document.body.textContent)) {
        S.err429 = (S.err429 || 0) + 1; saveStats();
        diag('page_429', pageInfo());
        flushDiag();
        slowDown();
        let s = 300;
        const t429 = setInterval(() => {
            s--;
            setStatus(`429 – reloading in ${s}s...`);
            beat();
            if (s <= 0) { clearInterval(t429); location.reload(); }
        }, 1000);
        setStatus(`429 – reloading in ${s}s...`);
        return;
    }

    diag('load', pageInfo());

    if (sessionStorage.getItem('wipeAuto') === '1') {
        setStatus('Auto-resuming...');
        setTimeout(run, rand(4000, 8000));
    }
})();
