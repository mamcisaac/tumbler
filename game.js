/* Tumbler — game UI, scoring, improvement leaderboard, share. */
(function () {
  'use strict';
  const E = window.TumblerEngine;
  const SYM = ['◆', '●', '▲', '■', '★', '⬟', '✚', '⬢']; // per-colour glyph (accessibility)

  // ── Supabase leaderboard (same table as the rest of the arcade) ───────────
  const SB_URL = 'https://xqhotrcucqcwzzrfwfrf.supabase.co';
  const SB_KEY = 'sb_publishable_h2aOj3WG-yMJFZGlzhEuVA_3Tfaln2Q';
  const TABLE = 'arcade_scores';
  const GAME = 'tumbler';
  const sbHeaders = (extra) => Object.assign({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' }, extra || {});
  async function lbSubmit(board, score, meta) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/${TABLE}`, {
        method: 'POST', headers: sbHeaders({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ game: GAME, board, handle: getHandle(), score, meta: meta || null })
      });
      return r.ok;
    } catch (_) { return false; }
  }
  async function lbFetch(board, limit = 800) {
    try {
      const q = new URLSearchParams({ game: 'eq.' + GAME, board: 'eq.' + board, select: 'handle,score,meta', order: 'score.asc', limit: String(limit) });
      const r = await fetch(`${SB_URL}/rest/v1/${TABLE}?${q}`, { headers: sbHeaders() });
      if (!r.ok) return null;
      return await r.json();
    } catch (_) { return null; }
  }
  // Reduce many rows (incl. repeat submissions) to ONE best score per handle.
  function bestByHandle(rows) {
    const m = new Map();
    for (const r of rows || []) {
      const h = (r.handle || '').slice(0, 24);
      if (!m.has(h) || r.score < m.get(h)) m.set(h, r.score);
    }
    return m; // handle -> best score (moves)
  }

  // ── state ──────────────────────────────────────────────────────────────────
  let PUZZLES = null, CAP = 4;
  let board = [], initial = [], history = [], moveCount = 0;
  let selected = -1, mode = 'daily', puzzleId = '', par = 0;
  let lastDrop = null, animating = false, solvedAlready = false;

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');

  // ── handle ───────────────────────────────────────────────────────────────
  function getHandle() { try { return localStorage.getItem('ctt.handle') || ''; } catch (_) { return ''; } }
  function setHandle(h) { try { localStorage.setItem('ctt.handle', cleanHandle(h)); } catch (_) {} }
  function cleanHandle(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 24); }
  function suggestHandle() {
    const a = ['teal', 'amber', 'swift', 'lucky', 'calm', 'bold', 'mellow', 'clever', 'sunny', 'brisk'];
    const b = ['otter', 'finch', 'maple', 'comet', 'pebble', 'willow', 'ember', 'fox', 'heron', 'sage'];
    return a[Math.floor(Math.random() * a.length)] + '_' + b[Math.floor(Math.random() * b.length)];
  }

  // ── daily / practice selection ─────────────────────────────────────────────
  function utcDateStr(dayNum) {
    const d = new Date(dayNum * 86400000);
    return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
  }
  // Namespaced leaderboard board key for a daily date (keeps boards distinct + tidy).
  function dailyBoardKey(dateStr) { return 'd1|' + dateStr; }
  function startDaily() {
    mode = 'daily';
    const dayNum = Math.floor(Date.now() / 86400000);
    const idx = ((dayNum % PUZZLES.puzzles.length) + PUZZLES.puzzles.length) % PUZZLES.puzzles.length;
    const p = PUZZLES.puzzles[idx];
    puzzleId = utcDateStr(dayNum);
    loadPuzzle(p);
    $('puzzleLabel').textContent = 'Daily · ' + puzzleId;
    refreshBestChip();
  }
  function startPractice() {
    mode = 'practice';
    const idx = Math.floor(Math.random() * PUZZLES.puzzles.length);
    const p = PUZZLES.puzzles[idx];
    puzzleId = 'practice';
    loadPuzzle(p);
    $('puzzleLabel').textContent = 'Practice';
    $('bestChip').hidden = true;
  }
  function loadPuzzle(p) {
    CAP = p.capacity || PUZZLES.capacity || 4;
    initial = p.tubes.map((t) => t.slice());
    par = p.par || 0;
    $('parVal').textContent = par || '–';
    resetToInitial();
  }
  function resetToInitial() {
    board = initial.map((t) => t.slice());
    history = []; moveCount = 0; selected = -1; lastDrop = null; solvedAlready = false;
    updateHud(); render();
  }

  // ── rendering ──────────────────────────────────────────────────────────────
  function topRunLen(t) {
    if (!t.length) return 0;
    const c = t[t.length - 1]; let n = 1;
    for (let i = t.length - 2; i >= 0 && t[i] === c; i--) n++;
    return n;
  }
  function isDone(t) {
    if (t.length === 0) return true;
    if (t.length !== CAP) return false;
    for (let i = 1; i < t.length; i++) if (t[i] !== t[0]) return false;
    return true;
  }
  function render() {
    boardEl.innerHTML = '';
    board.forEach((tube, i) => {
      const urn = document.createElement('div');
      urn.className = 'urn';
      if (isDone(tube)) urn.classList.add('done');
      if (i === selected) urn.classList.add('is-selected');
      else if (selected >= 0 && canPour(selected, i)) urn.classList.add('is-target');
      else if (selected < 0 && tube.length) urn.classList.add('is-selectable');
      urn.dataset.i = i;
      const runLen = (i === selected) ? topRunLen(tube) : 0;
      for (let s = 0; s < CAP; s++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        if (s < tube.length) {
          if (i === selected && s >= tube.length - runLen) cell.classList.add('lifted');
          if (lastDrop && lastDrop.j === i && s >= tube.length - lastDrop.n) {
            const ball = makeBall(tube[s]); ball.classList.add('drop'); cell.appendChild(ball);
          } else {
            cell.appendChild(makeBall(tube[s]));
          }
        }
        urn.appendChild(cell);
      }
      boardEl.appendChild(urn);
    });
    lastDrop = null;
  }
  function makeBall(c) {
    const b = document.createElement('div');
    b.className = 'ball c' + c;
    const s = document.createElement('span'); s.className = 'sym'; s.textContent = SYM[c] || '';
    b.appendChild(s);
    return b;
  }

  // ── interaction ──────────────────────────────────────────────────────────
  function canPour(i, j) { return E.pourCount(board, i, j, CAP) > 0; }
  function onUrnClick(i) {
    if (animating || solvedAlready) return;
    if (selected < 0) {
      if (board[i].length) { selected = i; render(); }
      return;
    }
    if (i === selected) { selected = -1; render(); return; }
    if (canPour(selected, i)) {
      doPour(selected, i);
    } else {
      selected = board[i].length ? i : -1; render();
    }
  }
  function pushHistory() { history.push(board.map((t) => t.slice())); }
  function doPour(i, j) {
    const n = E.pourCount(board, i, j, CAP);
    pushHistory();
    board = E.pour(board, i, j, CAP);
    moveCount++; selected = -1; lastDrop = { j, n };
    afterMove();
  }
  function doRotate() {
    if (animating || solvedAlready) return;
    animating = true; selected = -1;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finish = () => {
      pushHistory();
      board = E.rotate(board); moveCount++;
      render(); // fresh urns (no .flip), reversed data — seamless: 180°+old == 0°+reversed
      animating = false; updateHud(); checkWin();
    };
    const urns = boardEl.querySelectorAll('.urn');
    if (reduce || !urns.length) { finish(); return; }
    // Flip each urn in place (180° about its own axis) so urns never reposition.
    urns.forEach((u) => u.classList.add('flip'));
    setTimeout(finish, 470);
  }
  function undo() {
    if (animating || !history.length || solvedAlready) return;
    board = history.pop();
    moveCount = Math.max(0, moveCount - 1); // remove the undone move; undo itself is free
    selected = -1; updateHud(); render();
  }
  function restart() { if (!animating) resetToInitial(); }

  function afterMove() { updateHud(); render(); checkWin(); }
  function updateHud() {
    const el = $('moveCount');
    el.textContent = moveCount;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    $('undoBtn').disabled = history.length === 0;
  }
  function checkWin() { if (E.solved(board)) onSolved(); }

  // ── win / results ──────────────────────────────────────────────────────────
  function bestKey() { return 'ctt.tumbler.best.' + puzzleId; }
  function getLocalBest() { try { return parseInt(localStorage.getItem(bestKey()), 10) || null; } catch (_) { return null; } }
  function setLocalBest(v) { try { localStorage.setItem(bestKey(), String(v)); } catch (_) {} }
  function refreshBestChip() {
    const b = getLocalBest();
    if (mode === 'daily' && b) { $('bestVal').textContent = b; $('bestChip').hidden = false; }
    else $('bestChip').hidden = true;
  }
  function recordHistory(moves) {
    try {
      const h = JSON.parse(localStorage.getItem('ctt.tumbler.history') || '[]');
      h.push({ date: puzzleId, moves, par, t: Date.now() });
      localStorage.setItem('ctt.tumbler.history', JSON.stringify(h.slice(-400)));
    } catch (_) {}
  }

  async function onSolved() {
    solvedAlready = true; selected = -1; render();
    boardEl.classList.add('flash'); setTimeout(() => boardEl.classList.remove('flash'), 500);
    const moves = moveCount;

    if (mode === 'practice') { showResults(moves, null, null); return; }

    // Daily: update best, submit, fetch distribution.
    const prevBest = getLocalBest();
    const improved = prevBest == null || moves < prevBest;
    if (improved) setLocalBest(moves);
    recordHistory(moves);
    refreshBestChip();

    if (!getHandle()) { await promptName(); }
    if (improved) await lbSubmit(dailyBoardKey(puzzleId), moves, { par });

    const rows = await lbFetch(dailyBoardKey(puzzleId));
    showResults(moves, getLocalBest(), rows);
  }

  function showResults(moves, localBest, rows) {
    $('rMoves').textContent = moves;
    const sub = $('resultsSub');
    if (mode === 'practice') sub.innerHTML = `You solved it in <b>${moves}</b> moves. <span style="color:var(--fg-subtle)">(par ${par})</span>`;
    else sub.innerHTML = `You solved today's puzzle in <b>${moves}</b> moves.`;

    const pbRow = document.querySelector('.pb-row');
    if (mode === 'practice') { pbRow.style.display = 'none'; $('improveNote').textContent = 'Practice puzzles don\'t count on the leaderboard — but you can keep trimming moves.'; }
    else {
      pbRow.style.display = 'flex';
      $('rBest').textContent = localBest != null ? localBest : moves;
      const lbBest = rows && rows.length ? Math.min.apply(null, rows.map(r => r.score)) : Infinity;
      const globalBest = Math.min(par || Infinity, lbBest, moves);
      $('rGlobal').textContent = isFinite(globalBest) ? globalBest : moves;
      $('improveNote').textContent = (localBest != null && moves > localBest)
        ? `Your best is ${localBest}. Restart and try to match or beat it.`
        : 'Beat it: restart and try to use fewer moves — your best score is the one that counts.';
    }
    buildHistogram(rows, mode === 'daily' ? getLocalBest() : null);
    $('shareCardWrap').hidden = true; $('shareCardWrap').innerHTML = '';
    openModal('resultsModal');
  }

  function buildHistogram(rows, youScore) {
    const chart = $('distChart'); chart.innerHTML = '';
    const note = $('distNote');
    const best = bestByHandle(rows);
    const scores = [...best.values()];
    if (mode === 'practice' || scores.length === 0) {
      // Synthetic single-point view around par so the panel isn't empty.
      note.textContent = scores.length ? '' : (mode === 'daily' ? '· be the first to post a score' : '');
      const around = youScore || (par || moveCount);
      const lo = Math.min(par || around, around) - 1, hi = Math.max(par || around, around) + 2;
      for (let s = lo; s <= hi; s++) addBar(chart, s, s === around ? 1 : 0, hi - lo, { you: s === (youScore || around), best: s === (par || around) });
      return;
    }
    note.textContent = `· ${best.size} solver${best.size === 1 ? '' : 's'}`;
    const buckets = {};
    let lo = Infinity, hi = -Infinity;
    for (const s of scores) { buckets[s] = (buckets[s] || 0) + 1; lo = Math.min(lo, s); hi = Math.max(hi, s); }
    if (youScore != null) { lo = Math.min(lo, youScore); hi = Math.max(hi, youScore); }
    // cap width
    if (hi - lo > 16) hi = lo + 16;
    const maxN = Math.max.apply(null, Object.values(buckets));
    const globalBest = lo;
    for (let s = lo; s <= hi; s++) {
      addBar(chart, s, buckets[s] || 0, maxN, { you: s === youScore, best: s === globalBest });
    }
    if (youScore != null) {
      const better = scores.filter(s => s > youScore).length;
      const pct = Math.round(100 * better / scores.length);
      note.textContent += ` · better than ${pct}%`;
    }
  }
  function addBar(chart, score, n, maxN, flags) {
    const bar = document.createElement('div');
    bar.className = 'dist-bar' + (flags.you ? ' you' : '') + (!flags.you && flags.best ? ' best' : '');
    const h = maxN > 0 ? Math.max(4, Math.round(96 * n / maxN)) : 4;
    bar.innerHTML = `<div class="n">${n || ''}</div><div class="bar" style="height:${h}px"></div><div class="lab">${score}</div>`;
    chart.appendChild(bar);
  }

  // ── share ──────────────────────────────────────────────────────────────────
  function shareText(moves) {
    const lb = getLocalBest();
    let s = `Tumbler — ${mode === 'daily' ? 'Daily ' + puzzleId : 'Practice'}\nSolved in ${moves} moves (par ${par})`;
    if (mode === 'daily' && lb != null && lb < moves) s += `\nMy best: ${lb}`;
    s += `\nhttps://connectthethoughts.ca/tumbler`;
    return s;
  }
  async function doShare() {
    const txt = shareText(moveCount);
    try {
      if (navigator.share) { await navigator.share({ text: txt }); return; }
    } catch (_) {}
    try { await navigator.clipboard.writeText(txt); flashShare('Copied to clipboard!'); return; } catch (_) {}
    // fallback: show the text
    const wrap = $('shareCardWrap'); wrap.hidden = false;
    wrap.innerHTML = `<textarea class="lb-input" rows="4" readonly style="font-family:var(--font-mono)">${txt}</textarea>`;
  }
  function flashShare(msg) {
    const wrap = $('shareCardWrap'); wrap.hidden = false;
    wrap.innerHTML = `<div class="tiny">${msg}</div>`;
    setTimeout(() => { wrap.hidden = true; }, 1800);
  }

  // ── leaderboard modal ───────────────────────────────────────────────────────
  async function openLeaderboard() {
    openModal('lbModal'); setLbScope('today');
  }
  async function setLbScope(which) {
    $('lbToday').classList.toggle('is-active', which === 'today');
    $('lbYou').classList.toggle('is-active', which === 'you');
    const body = $('lbBody');
    if (which === 'you') { body.innerHTML = renderYou(); return; }
    body.innerHTML = '<div class="lb-status">Loading…</div>';
    const dayNum = Math.floor(Date.now() / 86400000);
    const rows = await lbFetch(dailyBoardKey(utcDateStr(dayNum)));
    if (rows == null) { body.innerHTML = '<div class="lb-status">Leaderboard unavailable.</div>'; return; }
    const best = bestByHandle(rows);
    const list = [...best.entries()].map(([h, s]) => ({ h, s })).sort((a, b) => a.s - b.s).slice(0, 50);
    if (!list.length) { body.innerHTML = '<div class="lb-status">No scores yet today — be the first!</div>'; return; }
    const me = getHandle();
    body.innerHTML = list.map((r, i) =>
      `<div class="lb-row${r.h === me ? ' me' : ''}"><span class="lb-rank">${i + 1}</span>` +
      `<span class="lb-name">${escapeHtml(r.h || 'anon')}</span>` +
      `<span class="lb-score">${r.s}<small> mv</small></span></div>`).join('');
  }
  function renderYou() {
    let h = [];
    try { h = JSON.parse(localStorage.getItem('ctt.tumbler.history') || '[]'); } catch (_) {}
    if (!h.length) return '<div class="lb-status">Solve a daily puzzle to see your history here.</div>';
    const byDate = {};
    for (const e of h) { if (!byDate[e.date] || e.moves < byDate[e.date].moves) byDate[e.date] = e; }
    const rows = Object.values(byDate).sort((a, b) => b.t - a.t).slice(0, 30);
    const solves = Object.keys(byDate).length;
    const head = `<div class="pb-row" style="justify-content:flex-start;margin:0 0 10px"><span>${solves} dail${solves === 1 ? 'y' : 'ies'} solved</span></div>`;
    return head + rows.map(e =>
      `<div class="lb-row"><span class="lb-name">${e.date}</span><span class="lb-score">${e.moves}<small> mv · par ${e.par}</small></span></div>`).join('');
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ── name modal ───────────────────────────────────────────────────────────────
  function promptName() {
    return new Promise((resolve) => {
      const inp = $('nameInput'); inp.value = getHandle() || suggestHandle();
      openModal('nameModal');
      const save = () => { setHandle(inp.value || suggestHandle()); closeModal('nameModal'); $('nameSave').removeEventListener('click', save); resolve(); };
      $('nameSave').addEventListener('click', save);
    });
  }

  // ── modal helpers ────────────────────────────────────────────────────────────
  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }

  // ── wiring ───────────────────────────────────────────────────────────────────
  function wire() {
    boardEl.addEventListener('click', (e) => {
      const urn = e.target.closest('.urn'); if (!urn) return;
      onUrnClick(parseInt(urn.dataset.i, 10));
    });
    $('rotateBtn').addEventListener('click', doRotate);
    $('undoBtn').addEventListener('click', undo);
    $('restartBtn').addEventListener('click', restart);
    $('modeDaily').addEventListener('click', () => { setMode('daily'); });
    $('modePractice').addEventListener('click', () => { setMode('practice'); });
    $('lbButton').addEventListener('click', openLeaderboard);
    $('helpButton').addEventListener('click', () => openModal('helpModal'));
    $('lbToday').addEventListener('click', () => setLbScope('today'));
    $('lbYou').addEventListener('click', () => setLbScope('you'));
    $('rShare').addEventListener('click', doShare);
    $('rImprove').addEventListener('click', () => { closeModal('resultsModal'); resetToInitial(); });
    // generic close buttons + backdrop click
    document.querySelectorAll('.modal-backdrop').forEach((m) => {
      m.addEventListener('click', (e) => {
        if (e.target === m || (e.target.closest && e.target.closest('[data-close]'))) {
          if (m.id !== 'nameModal') m.hidden = true;
        }
      });
    });
    // keyboard: R rotate, U undo
    document.addEventListener('keydown', (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      if (e.key === 'r' || e.key === 'R') doRotate();
      else if (e.key === 'u' || e.key === 'U') undo();
    });
  }
  function setMode(m) {
    $('modeDaily').classList.toggle('is-active', m === 'daily');
    $('modeDaily').setAttribute('aria-selected', m === 'daily');
    $('modePractice').classList.toggle('is-active', m === 'practice');
    $('modePractice').setAttribute('aria-selected', m === 'practice');
    if (m === 'daily') startDaily(); else startPractice();
  }

  // ── boot ─────────────────────────────────────────────────────────────────────
  fetch('puzzles.json?v=1').then((r) => r.json()).then((data) => {
    PUZZLES = data; wire(); startDaily();
  }).catch((err) => {
    boardEl.innerHTML = '<div class="lb-status">Could not load puzzles. Refresh to try again.</div>';
    console.error(err);
  });

  // read-only state hook (for diagnostics; no mutators exposed)
  window.__tumbler = { state: () => ({ moveCount, par, mode, solved: E.solved(board) }) };
})();
