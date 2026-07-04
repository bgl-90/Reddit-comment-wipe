// ==UserScript==
// @name         Reddit Comment Wipe 5.6 (API+DOM, old reddit)
// @namespace    reddit-wipe
// @version      5.6
// @description  Bulk edit+delete your own comments on old.reddit.com with adaptive rate limiting, dual API/DOM engine and full status UI
// @author       bgl-90
// @license      MIT
// @homepageURL  https://donatr.ee/bgl-90
// @supportURL   https://donatr.ee/bgl-90
// @match        https://old.reddit.com/user/*/comments*
// @match        https://old.reddit.com/user/*/overview*
// @match        https://old.reddit.com/user/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==
(function () {
    'use strict';

    // ===== CONFIG =====
    const SPEED_STEP = 100, SPEED_MIN = 100, SPEED_MAX = 6000;
    const SPREAD_STEP = 5, SPREAD_MIN = 0, SPREAD_MAX = 90;
    const SORTS = ['new', 'top', 'hot', 'controversial'];
    const MODES = ['auto', 'api', 'dom'];
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
    let apiRetryCount = GM_getValue('wipeApiRetryCount', 2);
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
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // ===== STATE =====
    const S = JSON.parse(sessionStorage.getItem('wipeStats') ||
        '{"edited":0,"deleted":0,"errors":0,"ops":0,"start":0,"failed":[],"delSinceRefresh":0,"backoffs":0,"reloads":0,"sortDel":{},"sortDone":{},"finalPass":false,"emptyRetry":{}}');
    ['sortDel', 'sortDone', 'emptyRetry'].forEach(k => S[k] = S[k] || {});
    S.backoffs = S.backoffs || 0; S.reloads = S.reloads || 0;
    let paused = false, stopped = false, running = false;
    let lastIncident = Date.now();
    let cachedModhash = '';
    const saveStats = () => sessionStorage.setItem('wipeStats', JSON.stringify(S));

    const currentSort = () => new URLSearchParams(location.search).get('sort') || 'new';
    const sortUrl = s => location.pathname + '?sort=' + s;

    function modhash() {
        return cachedModhash || (document.querySelector('input[name="uh"]') || {}).value || '';
    }
    async function refreshModhash() {
        try {
            const res = await fetch('https://old.reddit.com/api/me.json', { credentials: 'include' });
            const j = await res.json();
            if (j && j.data && j.data.modhash) { cachedModhash = j.data.modhash; return true; }
        } catch (e) {}
        return false;
    }

    // ===== TIMING =====
    async function rsleep() {
        await sleep(rand(minD(), maxD()));
        while (paused && !stopped) await sleep(300);
    }

    async function backoff(label) {
        S.backoffs++; saveStats();
        lastIncident = Date.now();
        if (adaptOn) {
            avgDelay = Math.min(SPEED_MAX, avgDelay + SPEED_STEP);
            GM_setValue('wipeAvgDelay', avgDelay); updateLabels();
        }
        for (let s = backoffSec; s > 0; s--) {
            if (stopped) return;
            setStatus(`${label} – backoff: ${s}s`);
            await sleep(1000);
        }
    }

    setInterval(() => {
        if (adaptOn && running && !paused && Date.now() - lastIncident > adaptMin * 60000 && avgDelay > SPEED_MIN) {
            avgDelay = Math.max(SPEED_MIN, avgDelay - SPEED_STEP);
            GM_setValue('wipeAvgDelay', avgDelay);
            lastIncident = Date.now();
            updateLabels();
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
            logAction(`retrying API mode (${apiRetryCount === 0 ? '∞' : apiRetriesLeft + ' retries left'})`);
        }
    }, 10000);

    function reloadAndContinue(reason) {
        S.reloads++; saveStats();
        setStatus(reason + ' – restarting...');
        sessionStorage.setItem('wipeAuto', '1');
        setTimeout(() => location.reload(), 1500);
    }

    async function opTick() {
        S.ops++; saveStats();
        if (S.ops % opsLimit === 0) {
            setStatus(`Long break (${longBreakMin} min)...`);
            await sleep(longBreakMin * 60000);
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
            if (res.status === 429) return { rateLimited: true };
            if (!res.ok) return { error: 'HTTP ' + res.status };
            const j = await res.json();
            const errs = j && j.json && j.json.errors || [];
            if (errs.length) return { error: errs.map(e => e[0]).join(',') };
            return { ok: true };
        } catch (e) {
            clearTimeout(t);
            return { error: e.name === 'AbortError' ? 'timeout' : e.message };
        }
    }

    async function apiWithRetry(endpoint, params, label) {
        for (let att = 0; att <= backoffRounds; att++) {
            if (stopped) return false;
            const r = await api(endpoint, params);
            if (r.ok) return true;
            if (r.rateLimited) S.err429 = (S.err429 || 0) + 1; else S.errOther = (S.errOther || 0) + 1;
            saveStats();
            logAction(`${label} API error: ${r.rateLimited ? '429' : r.error}`);
            if (r.error && /USER_REQUIRED|403/.test(r.error)) {
                if (await refreshModhash()) { logAction('modhash refreshed'); continue; }
            }
            if (att < backoffRounds) await backoff(`${label} failed (${att + 1}/${backoffRounds + 1})`);
        }
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

    // ===== UI =====
    const bar = document.createElement('div');
    bar.style.cssText = `position:fixed;bottom:20px;right:20px;z-index:99999;
        background:#222;color:#fff;padding:10px;border-radius:6px;
        font:12px monospace;min-width:270px;max-height:80vh;overflow-y:auto;`;
    const VERSION = (typeof GM_info !== 'undefined' && GM_info.script) ? GM_info.script.version : '';
    bar.innerHTML = `
        <div style="font-weight:bold;border-bottom:1px solid #444;padding-bottom:4px;margin-bottom:4px;">Reddit Comment Wipe <span style="color:#888;">v${VERSION}</span></div>
        <div id="wipe-status">Idle</div>
        <div>Mode: <button id="wipe-mode" style="cursor:pointer;"></button> <span id="wipe-effmode"></span></div>
        <div id="wipe-log" style="margin-top:4px;color:#aaa;max-width:270px;"></div>
        <div id="wipe-sorts" style="margin-top:4px;"></div>
        <div>Edited: <span id="wipe-e">0</span> | Deleted: <span id="wipe-d">0</span> | Errors: <span id="wipe-x">0</span></div>
        <div>Backoffs: <span id="wipe-b">0</span> | Restarts: <span id="wipe-r">0</span></div>
        <div>API→DOM: <span id="wipe-td">0</span> | DOM→API: <span id="wipe-ta">0</span> | 429: <span id="wipe-e429">0</span> | Other err: <span id="wipe-eoth">0</span></div>
        <div>Runtime: <span id="wipe-t">0:00</span> | Ops: <span id="wipe-o">0</span></div>
        <div>Rate: <span id="wipe-rate">-</span> del/min | Left ~<span id="wipe-eta">?</span></div>
        <div style="margin-top:4px;">Speed: <button id="wipe-slower">◀</button> <span id="wipe-speed"></span> <button id="wipe-faster">▶</button></div>
        <div>Jitter: <button id="wipe-sp-down">◀</button> <span id="wipe-sp"></span> <button id="wipe-sp-up">▶</button></div>
        <div>Backoff rounds: <button id="wipe-br-down">◀</button> <span id="wipe-br"></span> <button id="wipe-br-up">▶</button></div>
        <div>Backoff time: <button id="wipe-bs-down">◀</button> <span id="wipe-bs"></span> <button id="wipe-bs-up">▶</button></div>
        <div>API timeout: <button id="wipe-to-down">◀</button> <span id="wipe-to"></span> <button id="wipe-to-up">▶</button></div>
        <div>Adaptive: <button id="wipe-ad-toggle" style="cursor:pointer;"></button>
            speed-up <button id="wipe-ad-down">◀</button> <span id="wipe-ad"></span> <button id="wipe-ad-up">▶</button></div>
        <div>Random text: <button id="wipe-rt-toggle" style="cursor:pointer;"></button></div>
        <div>Refresh every: <button id="wipe-rf-down">◀</button> <span id="wipe-rf"></span> <button id="wipe-rf-up">▶</button> deletions</div>
        <div>Long break every: <button id="wipe-ol-down">◀</button> <span id="wipe-ol"></span> <button id="wipe-ol-up">▶</button> ops</div>
        <div>Break length: <button id="wipe-lb-down">◀</button> <span id="wipe-lb"></span> <button id="wipe-lb-up">▶</button></div>
        <div>API retry: <button id="wipe-ar-toggle" style="cursor:pointer;"></button>
            every <button id="wipe-arm-down">◀</button> <span id="wipe-arm"></span> <button id="wipe-arm-up">▶</button>,
            max <button id="wipe-arc-down">◀</button> <span id="wipe-arc"></span> <button id="wipe-arc-up">▶</button></div>
        <button id="wipe-start" style="background:red;color:#fff;padding:5px;margin-top:5px;cursor:pointer;">START</button>
        <button id="wipe-pause" style="background:#555;color:#fff;padding:5px;cursor:pointer;" disabled>PAUSE</button>
        <button id="wipe-stop" style="background:#800;color:#fff;padding:5px;cursor:pointer;" disabled>STOP</button>
        <button id="wipe-reset" style="background:#046;color:#fff;padding:5px;cursor:pointer;">RESET</button>
        <button id="wipe-export" style="background:#060;color:#fff;padding:5px;cursor:pointer;">EXPORT</button>
        <div id="wipe-failed" style="margin-top:5px;"></div>
        <div style="margin-top:6px;border-top:1px solid #444;padding-top:4px;text-align:center;">
            <a href="https://donatr.ee/bgl-90" target="_blank" style="color:#a8f;">☕ Support Reddit Comment Wipe</a>
        </div>
    `;
    document.body.appendChild(bar);
    const $ = id => document.getElementById(id);
    const setStatus = t => $('wipe-status').textContent = t;
    setInterval(() => {
        const cup = $('wipe-cup');
        if (cup) { cup.textContent = '❤️'; setTimeout(() => cup.textContent = '☕', 1500); }
    }, 8000);

    const LOG = [];
    function logAction(t) {
        LOG.unshift(new Date().toLocaleTimeString() + ' ' + t);
        if (LOG.length > 5) LOG.pop();
        $('wipe-log').innerHTML = LOG.map(l => `<div>${l}</div>`).join('');
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
            ? '<b>Skipped:</b><br>' + S.failed.map((u, i) => `<a href="${u}" target="_blank" style="color:#f88;">#${i + 1}</a>`).join(' ')
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
        $('wipe-rf').textContent = refreshAfter;
        $('wipe-ol').textContent = opsLimit;
        $('wipe-lb').textContent = longBreakMin + ' min';
        $('wipe-ar-toggle').textContent = apiRetryOn ? 'ON' : 'OFF';
        $('wipe-arm').textContent = apiRetryMin + ' min';
        $('wipe-arc').textContent = apiRetryCount === 0 ? '∞' : apiRetryCount + 'x';
        updateModeLabel();
    }
    $('wipe-slower').onclick = () => { avgDelay = Math.min(SPEED_MAX, avgDelay + SPEED_STEP); GM_setValue('wipeAvgDelay', avgDelay); updateLabels(); };
    $('wipe-faster').onclick = () => { avgDelay = Math.max(SPEED_MIN, avgDelay - SPEED_STEP); GM_setValue('wipeAvgDelay', avgDelay); updateLabels(); };
    $('wipe-sp-down').onclick = () => { spreadPct = Math.max(SPREAD_MIN, spreadPct - SPREAD_STEP); GM_setValue('wipeSpreadPct', spreadPct); updateLabels(); };
    $('wipe-sp-up').onclick = () => { spreadPct = Math.min(SPREAD_MAX, spreadPct + SPREAD_STEP); GM_setValue('wipeSpreadPct', spreadPct); updateLabels(); };
    $('wipe-br-down').onclick = () => { backoffRounds = Math.max(0, backoffRounds - 1); GM_setValue('wipeBackoffRounds', backoffRounds); updateLabels(); };
    $('wipe-br-up').onclick = () => { backoffRounds = Math.min(3, backoffRounds + 1); GM_setValue('wipeBackoffRounds', backoffRounds); updateLabels(); };
    $('wipe-bs-down').onclick = () => { backoffSec = Math.max(1, backoffSec - 1); GM_setValue('wipeBackoffSec', backoffSec); updateLabels(); };
    $('wipe-bs-up').onclick = () => { backoffSec = Math.min(30, backoffSec + 1); GM_setValue('wipeBackoffSec', backoffSec); updateLabels(); };
    $('wipe-to-down').onclick = () => { apiTimeout = Math.max(5, apiTimeout - 5); GM_setValue('wipeApiTimeout', apiTimeout); updateLabels(); };
    $('wipe-to-up').onclick = () => { apiTimeout = Math.min(60, apiTimeout + 5); GM_setValue('wipeApiTimeout', apiTimeout); updateLabels(); };
    $('wipe-ad-toggle').onclick = () => { adaptOn = !adaptOn; GM_setValue('wipeAdaptOn', adaptOn); updateLabels(); };
    $('wipe-ad-down').onclick = () => { adaptMin = Math.max(1, adaptMin - 1); GM_setValue('wipeAdaptMin', adaptMin); updateLabels(); };
    $('wipe-ad-up').onclick = () => { adaptMin = Math.min(15, adaptMin + 1); GM_setValue('wipeAdaptMin', adaptMin); updateLabels(); };
    $('wipe-rt-toggle').onclick = () => { randomText = !randomText; GM_setValue('wipeRandomText', randomText); updateLabels(); };
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
    updateLabels();

    setInterval(() => {
        $('wipe-e').textContent = S.edited;
        $('wipe-d').textContent = S.deleted;
        $('wipe-x').textContent = S.errors;
        $('wipe-b').textContent = S.backoffs;
        $('wipe-r').textContent = S.reloads;
        $('wipe-td').textContent = S.toDom || 0;
        $('wipe-ta').textContent = S.toApi || 0;
        $('wipe-e429').textContent = S.err429 || 0;
        $('wipe-eoth').textContent = S.errOther || 0;
        $('wipe-o').textContent = S.ops;
        if (S.start) {
            const sec = (Date.now() - S.start) / 1000;
            $('wipe-t').textContent = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
            $('wipe-rate').textContent = sec > 30 ? (S.deleted / (sec / 60)).toFixed(1) : '-';
        }
        const left = getComments().length;
        const perComment = effMode() === 'api' ? 3 : 7;
        const etaSec = Math.round(left * perComment * avgDelay / 1000);
        $('wipe-eta').textContent = left ? `${Math.floor(etaSec / 60)}:${String(etaSec % 60).padStart(2, '0')} (this page)` : '-';
        updateSortsPanel();
        updateFailedList();
    }, 1000);

    // ===== HELPERS =====
    const getComments = () =>
        Array.from(document.querySelectorAll('div.thing.comment'))
            .filter(c => !c.classList.contains('deleted') && !c.dataset.wiped);

    const permalink = c => (c.querySelector('a.bylink') || {}).href || '?';
    const cTitle = c => {
        const t = c.querySelector('p.parent a.title');
        const s = t ? t.textContent : (c.querySelector('.usertext-body .md') || {}).textContent || '?';
        return s.trim().slice(0, 40);
    };

    async function waitFor(cond) {
        for (let i = 0; i < apiTimeout * 2; i++) {
            await sleep(500);
            if (cond()) return true;
        }
        return false;
    }

    function markDeleted(c) {
        S.deleted++;
        const cs = currentSort();
        S.sortDel[cs] = (S.sortDel[cs] || 0) + 1;
        S.delSinceRefresh = (S.delSinceRefresh || 0) + 1;
        saveStats();
        c.remove();
    }

    // ===== API MODE =====
    async function wipeCommentApi(c) {
        const id = c.getAttribute('data-fullname');
        if (!id) return false;
        const body = c.querySelector('.usertext-body .md');
        if (!(body && isWiped(body.textContent))) {
            if (!await apiWithRetry('editusertext', { thing_id: id, text: wipeText() }, 'Edit')) return false;
            S.edited++; saveStats();
            logAction('edit OK (API)');
            await opTick();
            await rsleep();
        } else logAction('already overwritten – edit skipped');
        if (!await apiWithRetry('del', { id: id }, 'Delete')) return false;
        logAction('deleted ✓ (API)');
        markDeleted(c);
        await opTick();
        return true;
    }

    // ===== DOM MODE =====
    async function editCommentDom(c) {
        const id = c.getAttribute('data-fullname');
        const fresh = () => document.querySelector(`div.thing[data-fullname="${id}"]`) || c;
        const body = () => fresh().querySelector('.usertext-body .md');
        if (body() && isWiped(body().textContent)) { logAction('already overwritten – edit skipped'); return true; }
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

    async function deleteCommentDom(c) {
        const id = c.getAttribute('data-fullname');
        const fresh = () => document.querySelector(`div.thing[data-fullname="${id}"]`) || c;
        const delForm = () => fresh().querySelector('form.del-button');
        for (let att = 0; att <= backoffRounds; att++) {
            if (stopped) return false;
            const f = delForm();
            if (f && f.textContent.trim() === 'deleted') { logAction('deleted ✓ (DOM)'); markDeleted(fresh()); return true; }
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
                markDeleted(fresh());
                return true;
            }
            if (att < backoffRounds) await backoff(`Delete failed (${att + 1}/${backoffRounds + 1})`);
        }
        return false;
    }

    async function wipeCommentDom(c) {
        const e = await editCommentDom(c);
        if (!e) return false;
        await rsleep();
        return await deleteCommentDom(c);
    }

    async function wipeComment(c) {
        if (effMode() === 'api') {
            const ok = await wipeCommentApi(c);
            if (!ok && mode === 'auto' && !apiBroken) {
                apiBroken = true;
                lastApiFail = Date.now();
                S.toDom = (S.toDom || 0) + 1; saveStats();
                sessionStorage.setItem('wipeApiBroken', '1');
                updateModeLabel();
                logAction('API failed → DOM fallback');
                setStatus('API mode failed, switching to DOM...');
                return await wipeCommentDom(c);
            }
            return ok;
        }
        return await wipeCommentDom(c);
    }

    // ===== FLOW =====
    async function processPage() {
        const comments = getComments();
        setStatus(`Running [${effMode().toUpperCase()}] [${currentSort()}] (${comments.length} comments)`);
        for (const c of comments) {
            if (stopped) return;
            c.dataset.wiped = '1';
            logAction('▶ ' + cTitle(c));
            try {
                if (!await wipeComment(c)) { S.errors++; S.failed.push(permalink(c)); saveStats(); }
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
            }
        }
    }

    async function run() {
        if (running) return;
        running = true; stopped = false;
        if (!S.start) { S.start = Date.now(); saveStats(); }
        if (effMode() === 'api' && !modhash() && !await refreshModhash()) {
            if (mode === 'auto') { apiBroken = true; sessionStorage.setItem('wipeApiBroken', '1'); updateModeLabel(); logAction('no modhash → DOM'); }
            else { setStatus('ERROR: no modhash (API mode)'); return; }
        }
        $('wipe-start').disabled = true;
        $('wipe-pause').disabled = false;
        $('wipe-stop').disabled = false;

        await processPage();
        if (stopped) return;

        const next = document.querySelector('.next-button a');
        if (next) {
            sessionStorage.setItem('wipeAuto', '1');
            setStatus('Next page...');
            await sleep(rand(3000, 6000));
            next.click();
            return;
        }

        const cs = currentSort();
        if (getComments().length === 0 && !S.emptyRetry[cs]) {
            S.emptyRetry[cs] = true; saveStats();
            reloadAndContinue(`[${cs}] appears empty – verifying`);
            return;
        }
        S.sortDone[cs] = true; saveStats();

        const nextSort = SORTS.find(s => !S.sortDone[s]);
        if (nextSort) {
            sessionStorage.setItem('wipeAuto', '1');
            setStatus(`[${cs}] done → switching to: ${nextSort}...`);
            await sleep(rand(3000, 6000));
            location.href = sortUrl(nextSort);
            return;
        }

        if (!S.finalPass) {
            S.finalPass = true;
            S.sortDone = {}; S.emptyRetry = {};
            saveStats();
            sessionStorage.setItem('wipeAuto', '1');
            setStatus('Final verification pass starting...');
            await sleep(rand(3000, 6000));
            location.href = sortUrl('new');
            return;
        }

        if (S.failed.length && !S.retriedFailed) {
            S.retriedFailed = true; saveStats();
            setStatus(`Retrying ${S.failed.length} skipped comments...`);
            const still = [];
            for (const u of S.failed) {
                if (stopped) return;
                const m = u.match(/\/comments\/[^/]+\/[^/]+\/([a-z0-9]+)/i);
                if (!m) { still.push(u); continue; }
                const id = 't1_' + m[1];
                logAction('retry ▶ ' + id);
                const e = await apiWithRetry('editusertext', { thing_id: id, text: wipeText() }, 'Retry-edit');
                await rsleep();
                const d = e && await apiWithRetry('del', { id: id }, 'Retry-delete');
                await rsleep();
                if (d) { S.deleted++; S.edited++; logAction('retry deleted ✓'); }
                else still.push(u);
                saveStats();
            }
            S.failed = still; saveStats();
        }
        alertUser('DONE');
        finish('DONE – all sorts + final pass completed');
    }

    function finish(msg) {
        sessionStorage.removeItem('wipeAuto');
        setStatus(msg);
        $('wipe-pause').disabled = true;
        $('wipe-stop').disabled = true;
        updateFailedList();
    }

    // ===== CONTROLS =====
    $('wipe-start').onclick = run;
    $('wipe-pause').onclick = () => {
        paused = !paused;
        $('wipe-pause').textContent = paused ? 'RESUME' : 'PAUSE';
        setStatus(paused ? 'Paused' : 'Running...');
    };
    $('wipe-stop').onclick = () => {
        stopped = true; paused = false; running = false;
        sessionStorage.removeItem('wipeStats');
        finish('STOPPED');
        $('wipe-start').disabled = false;
    };
    $('wipe-reset').onclick = () => {
        stopped = true;
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
        GM_setValue('wipeApiRetryCount', 2);
        location.reload();
    };
    $('wipe-export').onclick = () => {
        const data = JSON.stringify({ exported: new Date().toISOString(), mode, effMode: effMode(), stats: S, settings: { avgDelay, spreadPct, backoffRounds, backoffSec, apiTimeout, adaptOn, adaptMin, randomText, refreshAfter, opsLimit, longBreakMin, apiRetryOn, apiRetryMin, apiRetryCount } }, null, 2);
        navigator.clipboard.writeText(data).then(() => setStatus('Stats copied to clipboard'));
    };

    // ===== 429 PAGE =====
    if (sessionStorage.getItem('wipeAuto') === '1' &&
        !document.querySelector('#siteTable') &&
        /429|too many requests|whoa there/i.test(document.body.textContent)) {
        S.err429 = (S.err429 || 0) + 1; saveStats();
        if (adaptOn) {
            avgDelay = Math.min(SPEED_MAX, avgDelay + SPEED_STEP);
            GM_setValue('wipeAvgDelay', avgDelay);
            updateLabels();
        }
        let s = 300;
        const t429 = setInterval(() => {
            s--;
            setStatus(`429 – reloading in ${s}s...`);
            if (s <= 0) { clearInterval(t429); location.reload(); }
        }, 1000);
        setStatus(`429 – reloading in ${s}s...`);
        return;
    }

    if (sessionStorage.getItem('wipeAuto') === '1') {
        setStatus('Auto-resuming...');
        setTimeout(run, rand(4000, 8000));
    }
})();
