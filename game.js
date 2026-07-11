/* Tumbler — game UI, scoring, improvement leaderboard, share. */
(function () {
  'use strict';
  const E = window.TumblerEngine;
  const SYM = ['◆', '●', '▲', '■', '★', '⬟', '✚', '⬢']; // per-colour glyph (accessibility)

  // ── Shared arcade leaderboard (one client for the whole arcade) ───────────
  // Data layer + modal UI are the synced shared modules, loaded as classic
  // window globals (window.ArcadeLeaderboard / window.ArcadeLeaderboardUI)
  // before game.js. Tumbler ranks by raw MOVES (fewest wins) on a single daily
  // board, so the board shows a move count. The modal + the post-win standings
  // both render through the shared factory (created below, once the board-key
  // helpers are declared).
  const GAME = 'tumbler';
  const LB = window.ArcadeLeaderboard;
  const { submitScore, reportStats } = LB;

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
  // Day number of a LOCAL calendar date (flips at local midnight, not UTC) —
  // the daily puzzle index, label, and board key all derive from it. Tumbler
  // predates the shared Day-N epoch, so it keeps its original days-since-1970
  // numbering (switching to ArcadeDailySeed.dailyDayNumber would change which
  // puzzle today's rotation lands on); only the DATE KEY comes from the shared
  // module, which makes the daily archive-replayable (window.__archiveDateKey).
  function dayNumFromKey(key) {
    const p = String(key).split('-').map(Number);
    return Math.floor(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
  }
  // Today's day number (never the archive-replay date) — anchors the
  // leaderboard modal's day-nav offsets.
  function localDayNum() {
    const d = new Date();
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  }
  function localDateStr(dayNum) {
    // dayNum encodes a local calendar day as its UTC-midnight instant, so UTC
    // getters recover exactly that calendar day.
    const d = new Date(dayNum * 86400000);
    return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
  }
  // Namespaced leaderboard board key for a daily date (keeps boards distinct + tidy).
  function dailyBoardKey(dateStr) { return 'd1|' + dateStr; }
  function startDaily() {
    mode = 'daily';
    // dailyDateKey() is today's local 'YYYY-M-D' — or the archived day being
    // replayed. Same key format as the old localDateStr(localDayNum()), so
    // today's puzzle, best-chip key, and daily board key are all unchanged.
    const key = window.ArcadeDailySeed.dailyDateKey();
    const dayNum = dayNumFromKey(key);
    const idx = ((dayNum % PUZZLES.puzzles.length) + PUZZLES.puzzles.length) % PUZZLES.puzzles.length;
    const p = PUZZLES.puzzles[idx];
    puzzleId = key;
    loadPuzzle(p);
    $('puzzleLabel').textContent = 'Daily · ' + puzzleId;
    refreshBestChip();
  }
  // Archive replay: seed today's rotation from a past local date. Setting
  // window.__archiveDateKey makes dailyDateKey() (and thus startDaily's day
  // number, label, best-chip key + daily board key) resolve to that day; a
  // manual mode switch clears it (see setMode) to return to today.
  function loadDailyForDate(dateKey) {
    window.__archiveDateKey = dateKey;
    setModeUI('daily');
    startDaily();
  }
  // A day counts as done once its daily has been solved at least once — that's
  // exactly when we've written a local best for that date key.
  function isDayDone(dateKey) {
    try { return localStorage.getItem('ctt.tumbler.best.' + dateKey) != null; } catch (_) { return false; }
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
  function render(opts) {
    opts = opts || {};
    boardEl.innerHTML = '';
    const R = 11;
    board.forEach((tube, i) => {
      const urn = document.createElement('div');
      urn.className = 'urn';
      urn.dataset.i = i;
      if (isDone(tube)) urn.classList.add('done');
      if (i === selected) urn.classList.add('is-selected');
      else if (selected >= 0 && effectiveHighlight() && canPour(selected, i)) urn.classList.add('is-target');
      else if (selected < 0 && tube.length) urn.classList.add('is-selectable');
      const stack = document.createElement('div');
      stack.className = 'stack';
      // group bottom -> top into runs of equal colour; each run is ONE bead
      const runs = [];
      for (let k = 0; k < tube.length;) {
        const c = tube[k]; let len = 1;
        while (k + len < tube.length && tube[k + len] === c) len++;
        runs.push({ c: c, len: len }); k += len;
      }
      // render top -> bottom (topmost run first in DOM)
      for (let r = runs.length - 1; r >= 0; r--) {
        const run = runs[r];
        const isTop = (r === runs.length - 1);
        const isBottom = (r === 0);
        const bead = document.createElement('div');
        bead.className = 'bead c' + run.c;
        // one solid bead spanning the whole run (responsive via CSS vars)
        bead.style.height = 'calc(' + run.len + ' * var(--cell) + ' + (run.len - 1) + ' * var(--gap))';
        bead.style.borderRadius = R + 'px';
        bead.style.marginBottom = isBottom ? '0' : 'var(--gap)';
        bead.style.boxShadow = 'inset 0 5px 7px rgba(255,255,255,.26), inset 0 -9px 12px rgba(0,0,0,.30)';
        if (i === selected && isTop) bead.classList.add('lifted'); // lift the whole top run
        if (lastDrop && lastDrop.j === i && isTop) bead.classList.add(lastDrop.merged ? 'merging' : 'drop');
        const sym = document.createElement('span'); sym.className = 'sym'; sym.textContent = SYM[run.c] || '';
        bead.appendChild(sym); // ONE symbol, centred in the run
        stack.appendChild(bead);
      }
      // after a flip the beads fall down into place
      if (opts.fall && tube.length > 0 && tube.length < CAP) {
        stack.style.setProperty('--fall', 'calc(' + (-(CAP - tube.length)) + ' * (var(--cell) + var(--gap)))');
        stack.classList.add('falling');
      }
      urn.appendChild(stack);
      boardEl.appendChild(urn);
    });
    lastDrop = null;
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
    const merged = board[j].length > 0; // pour requires matching top or empty -> non-empty means it fuses
    pushHistory();
    board = E.pour(board, i, j, CAP);
    moveCount++; selected = -1; lastDrop = { j: j, n: n, merged: merged };
    registerMove();
    afterMove();
  }
  function doRotate() {
    if (animating || solvedAlready) return;
    animating = true; selected = -1;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finish = () => {
      pushHistory();
      board = E.rotate(board); moveCount++; registerMove();
      render({ fall: true }); // upright tumblers, reversed data, beads fall into place
      animating = false; updateHud(); checkWin();
    };
    const urns = boardEl.querySelectorAll('.urn');
    if (reduce || !urns.length) { finish(); return; }
    // Phase 1: each symmetric tumbler turns over in place (shape unchanged).
    // Phase 2 (in finish→render fall): the beads settle to the new bottom.
    urns.forEach((u) => u.classList.add('flip'));
    setTimeout(finish, 400);
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
      // `difficulty`/`value` let the shared "You" panel (personalBests + stats)
      // read this same history — the whole arcade records one shape. Older
      // entries also carried `stars`; the shared comparator still reads those.
      h.push({ date: puzzleId, difficulty: 'daily', moves, value: moves, par, t: Date.now() });
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
    reportStats(GAME);   // unified launcher-card stat (solves + streak)
    // Record EVERY completion (not just improvements) so all scores show on the
    // board; the shared read dedupes each handle to its best (fewest moves).
    await submitScore({ game: GAME, board: dailyBoardKey(puzzleId), handle: getHandle(), score: moves, meta: { par, value: moves } });
    showResults(moves, getLocalBest());
  }

  // Shared arcade results card, mounted inside the existing #resultsModal.
  // Moves (the ranking metric) lead as the primary stat; "Try to improve" is
  // the primary action (tumbler's daily is endlessly replayable for a better
  // best) with Share alongside, exactly as before.
  function showResults(moves, localBest) {
    const practice = mode === 'practice';
    const replay = !practice && !!window.__archiveDateKey;
    let subHtml, detailHtml;
    if (practice) {
      subHtml = `You solved it in <b>${moves}</b> moves. <span style="color:var(--fg-subtle)">(par ${par})</span>`;
      detailHtml = '<p class="improve-note">Practice puzzles don’t count on the leaderboard — but you can keep trimming moves.</p>';
    } else {
      const best = localBest != null ? localBest : moves;
      const note = (localBest != null && moves > localBest)
        ? `Your best is ${localBest}. Restart and try to match or beat it.`
        : 'Beat it: restart and try to use fewer moves — your best score is the one that counts.';
      subHtml = `You solved ${replay ? 'the ' + puzzleId + ' daily' : "today's puzzle"}. Your best: <b>${best}</b>`;
      detailHtml = `<p class="improve-note">${note}</p>` +
        `<div class="results-lb-title">${replay ? puzzleId + '’s' : 'Today’s'} leaderboard</div>`;
    }
    window.ArcadeResults.renderResults({
      mount: $('resultsMount'),
      headline: 'Solved!',
      statHtml: `${moves}<small> ${moves === 1 ? 'move' : 'moves'}</small>`,
      subHtml,
      detailHtml,
      nextLabel: 'Try to improve',
      advanceFirst: true,
      onShare: doShare,
      onNext: () => { closeModal('resultsModal'); resetToInitial(); },
    });
    if (!practice) {
      // Standings render through the shared factory (fewest moves first, deduped
      // to each player's best) into the card's #lb-inline mount — the same board
      // the modal shows (the replayed day's board during an archive replay).
      const lbMount = $('resultsMount').querySelector('#lb-inline');
      lbMount.classList.add('lb-scroll');
      lbUi.renderBoard(lbMount, dailyBoardKey(puzzleId), getHandle() || null);
    }
    $('shareCardWrap').hidden = true; $('shareCardWrap').innerHTML = '';
    openModal('resultsModal');
  }

  // ── Shared leaderboard modal (single daily board; fewest moves wins) ───────
  // The factory owns the modal (Today/You tabs + day-nav) and the post-win
  // standings; dedup-to-best-per-handle happens on read inside fetchTop.
  function lbDayLabel(offset) {
    if (offset === 0) return 'Today';
    if (offset === 1) return 'Yesterday';
    const d = new Date(); d.setDate(d.getDate() - offset);
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  }
  const lbUi = window.ArcadeLeaderboardUI.createLeaderboardModal({
    gameSlug: GAME,
    getHandle: () => getHandle() || null,
    boardKeyForOffset: (offset) => dailyBoardKey(localDateStr(localDayNum() - offset)),
    dayLabelForOffset: lbDayLabel,
    showStars: false,
    rowStat: (r) => `${r.score}<small> mv</small>`,
    youRow: (best) => `${best.value != null ? best.value : best.moves}<small> mv</small>`,
    youLabel: 'Best',
    youHeadSingle: 'Your daily best',
    bestComparator: (e, cur) => (e.value != null ? e.value : e.moves) < (cur.value != null ? cur.value : cur.moves),
  });

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

  // ── move-highlight setting + new-player teaching ─────────────────────────
  const HL_KEY = 'ctt.tumbler.highlightMoves', TEACH_KEY = 'ctt.tumbler.teachMoves', POPUP_KEY = 'ctt.tumbler.hlPopupShown';
  const TEACH_LIMIT = 6;
  function getHLPref() { try { return localStorage.getItem(HL_KEY); } catch (_) { return null; } }
  function teachMoves() { try { return parseInt(localStorage.getItem(TEACH_KEY), 10) || 0; } catch (_) { return 0; } }
  function effectiveHighlight() {
    const p = getHLPref();
    if (p === 'on') return true;
    if (p === 'off') return false;
    return teachMoves() < TEACH_LIMIT;          // teach a brand-new player, then stop
  }
  function registerMove() {
    if (getHLPref() !== null) return;            // player has set a preference — teaching is over
    let t = teachMoves();
    if (t >= TEACH_LIMIT) return;
    t++; try { localStorage.setItem(TEACH_KEY, String(t)); } catch (_) {}
    if (t >= TEACH_LIMIT) {                       // highlights have just turned off
      let shown = null; try { shown = localStorage.getItem(POPUP_KEY); } catch (_) {}
      if (!shown) {
        try { localStorage.setItem(POPUP_KEY, '1'); } catch (_) {}
        showToast('Move highlights are off now — turn them back on anytime in How to play.');
      }
    }
  }
  function setHighlight(on) { try { localStorage.setItem(HL_KEY, on ? 'on' : 'off'); } catch (_) {} render(); }

  // ── transient toast ──────────────────────────────────────────────────────
  let toastTimer = null;
  function showToast(msg) {
    const t = $('toast'); if (!t) return;
    t.textContent = msg; t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => { t.hidden = true; }, 300); }, 5200);
  }

  // ── first-play tutorial (shared arcade carousel) ─────────────────────────
  function initTutorial() {
    if (!window.ArcadeTutorial) return;
    const R = '#e6194B', O = '#f58231', Y = '#ffe119', G = '#3cb44b', C = '#42d4f4', B = '#4363d8', P = '#911eb4';
    const svg = (inner) => '<svg viewBox="0 0 170 92" width="180" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
    const shell = (x, w, h) => '<rect x="' + x + '" y="14" width="' + w + '" height="' + h + '" rx="11" fill="none" stroke="currentColor" stroke-width="2" opacity=".5"/>';
    const beads = (x, list, h) => { // bottom-up coloured beads inside a shell at column x
      const w = 24, bh = 15; let s = shell(x, w, h);
      list.forEach((c, idx) => { const by = 14 + h - 4 - (idx + 1) * bh; s += '<rect x="' + (x + 4) + '" y="' + by + '" width="' + (w - 8) + '" height="' + (bh - 2) + '" rx="4" fill="' + c + '"/>'; });
      return s;
    };
    const arrow = (d) => '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
    const art1 = svg(beads(20, [R, B, Y], 64) + arrow('M58 48 h22 M73 42 l7 6 -7 6') +
      shell(98, 24, 64) + '<rect x="102" y="18" width="16" height="56" rx="6" fill="' + G + '"/>' +
      '<text x="110" y="52" font-size="15" fill="#fff" text-anchor="middle" font-weight="900">✓</text>');
    const art2 = svg(beads(34, [B, R], 64) + arrow('M60 26 C 82 6, 100 6, 114 30 M114 30 l-7 -2 l2 -7') +
      beads(108, [R], 64));
    const art3 = svg(arrow('M44 50 A38 30 0 0 1 122 44 M122 44 l-9 1 l4 -8') +
      beads(73, [O, P], 48));
    const art4 = svg('<g fill="currentColor"><rect x="36" y="54" width="13" height="24" rx="2" opacity=".35"/>' +
      '<rect x="54" y="42" width="13" height="36" rx="2" opacity=".35"/><rect x="72" y="30" width="13" height="48" rx="2"/>' +
      '<rect x="90" y="46" width="13" height="32" rx="2" opacity=".35"/><rect x="108" y="58" width="13" height="20" rx="2" opacity=".35"/></g>' +
      arrow('M78 22 l0 -10 M73 17 l5 -5 5 5'));
    const tut = window.ArcadeTutorial.createTutorial({
      gameSlug: 'tumbler',
      steps: [
        { art: art1, title: 'Sort the colours', body: 'Pour colours between the <b>tumblers</b> until each one holds a single colour. One tumbler can be left empty.' },
        { art: art2, title: 'Tap to pour', body: 'Tap a tumbler to pick it up, then tap another to pour its <b>top</b> colour across — onto a matching colour, or into a tumbler with room.' },
        { art: art3, title: 'Turn the rack over', body: 'The <b>Rotate</b> button flips the whole rack — the <b>bottom of every tumbler becomes the top</b> and the beads fall. It’s the only way to reach buried colours.' },
        { art: art4, title: 'Fewest moves wins', body: 'Every pour <i>and</i> every rotate is a move. Solve in as few as you can — then replay the daily to <b>beat your own best</b> and climb the chart.' },
      ],
    });
    tut.wire();
    tut.maybeAutoStart();
  }

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
    lbUi.wire();   // shared factory owns the #lbButton + #lb-modal (Today/You tabs, day-nav)
    // Reveal + wire the hidden topbar archive button (past daily puzzles).
    window.ArcadeArchive.createArchive({ loadDailyForDate, isDayDone }).wire();
    $('helpButton').addEventListener('click', () => { $('highlightToggle').checked = effectiveHighlight(); openModal('helpModal'); });
    $('highlightToggle').addEventListener('change', (e) => setHighlight(e.target.checked));
    // #rShare / #rImprove are gone — renderResults now owns Share (onShare) + Try-again (onNext).
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
  function setModeUI(m) {
    $('modeDaily').classList.toggle('is-active', m === 'daily');
    $('modeDaily').setAttribute('aria-selected', m === 'daily');
    $('modePractice').classList.toggle('is-active', m === 'practice');
    $('modePractice').setAttribute('aria-selected', m === 'practice');
  }
  function setMode(m) {
    // A manual mode switch always leaves any archive replay behind (back to today).
    delete window.__archiveDateKey;
    setModeUI(m);
    if (m === 'daily') startDaily(); else startPractice();
  }

  // ── boot ─────────────────────────────────────────────────────────────────────
  fetch('puzzles.json?v=1').then((r) => r.json()).then((data) => {
    PUZZLES = data; wire(); startDaily(); initTutorial();
  }).catch((err) => {
    boardEl.innerHTML = '<div class="lb-status">Could not load puzzles. Refresh to try again.</div>';
    console.error(err);
  });

  // read-only state hook (for diagnostics; no mutators exposed)
  window.__tumbler = { state: () => ({ moveCount, par, mode, solved: E.solved(board) }) };
})();
