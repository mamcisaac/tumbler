/* Tumbler — game UI, scoring, improvement leaderboard, share. */
(function () {
  'use strict';
  const E = window.TumblerEngine;
  // Per-colour glyph (a second, colour-blind- and low-light-safe channel on top of
  // the bead colour). Nine distinct silhouettes forming one geometric language — no
  // hearts or half-circles, every piece identifiable in isolation, ordered simple →
  // complex so players learn "circle = red" not "random icon". Drawn as inline SVG,
  // each centred by GEOMETRY in a 24×24 box: pixel-perfect centring on every platform
  // (text glyphs sat low and shifted with the system font) and no emoji fallback.
  //   ● red · ▲ orange · ■ gold · ◆ green · ★ spring · ✚ cyan · ⬢ blue · ⬟ purple · ✦ orchid
  // Shapes are tuned for consistent OPTICAL weight — bounding box is a poor guide, so
  // sizes are set by eye against the circle: the thin/pointed shapes (triangle,
  // pentagon, spark) are grown, the heavy filled square is eased down, until all nine
  // read the same size.
  const SHAPE = [
    '<circle cx="12" cy="12" r="7.3"/>',
    '<polygon points="12,3.2 20.66,18.2 3.34,18.2"/>',
    '<rect x="5.4" y="5.4" width="13.2" height="13.2" rx="3.3"/>',
    '<polygon points="12,3 21,12 12,21 3,12"/>',
    '<polygon points="12,2.7 14.29,8.84 20.84,9.13 15.71,13.21 17.47,19.52 12,15.9 6.53,19.52 8.29,13.21 3.16,9.13 9.71,8.84"/>',
    '<path d="M9.7 3.7 h4.6 v6.0 h6.0 v4.6 h-6.0 v6.0 h-4.6 v-6.0 h-6.0 v-4.6 h6.0 z"/>',
    '<polygon points="16.35,4.47 20.7,12 16.35,19.53 7.65,19.53 3.3,12 7.65,4.47"/>',
    '<polygon points="12,3.7 21.04,10.26 17.58,20.89 6.42,20.89 2.96,10.26"/>',
    '<polygon points="12,2.1 14.83,9.17 21.9,12 14.83,14.83 12,21.9 9.17,14.83 2.1,12 9.17,9.17"/>',
  ];
  // Glyph fill is a tint of its own hue, but its LIGHT/DARK direction (DARK_SET) is
  // chosen to MAXIMISE DIFFERENTIATION across beads, not for contrast on its own bead:
  // the closest colour pairs (green/spring, cyan/blue, purple/orchid, red/orange,
  // orange/gold, blue/purple) each get opposite glyph luminance, so the glyph is a
  // real second channel telling similar beads apart. Legibility no longer depends on
  // the fill because every glyph carries a contrasting OUTLINE (stroke, added at
  // render) — light glyphs a dark outline, dark glyphs a light one.
  const GLYPH_COLOR = ['#640219', '#fbccb1', '#5f4a07', '#1f5016', '#b8f4e0', '#005566', '#b5d6f8', '#411287', '#ebc2e4'];
  const DARK_SET = new Set([0, 2, 3, 5, 7]); // deep-tint (dark) glyph; others pale (light)
  // Per-bead rim accent — a LIGHT shade of the bead's own hue for the DARK_SET beads
  // and a DEEP shade for the rest, so each tile's edge is a light/dark accent OF its
  // colour (not a neutral line) while still following the glyph's differentiation split.
  const ACCENT = ['#f6b7c5', '#853100', '#f3e5ba', '#c9e9c3', '#097b55', '#b4edf9', '#034282', '#d1bdf0', '#691c5c'];

  // Per-tier colour SELECTION. The full 9-colour palette (styles.css) is separated
  // for maximum mutual ΔE, so every subset is already unambiguous — tiers just scale
  // the COUNT of colours (5 / 7 / 9) for combinatorial difficulty, not confusability.
  // Each entry maps a puzzle's stored logical colour k → an index into the master
  // .c0–.c8 palette and SYM glyphs. Solve logic stays on the dense logical indices;
  // this only changes what's drawn, so the same board data serves every tier.
  const PALETTE = {
    easy:   [0, 2, 3, 5, 6],                 // red · gold · green · cyan · blue
    medium: [0, 1, 2, 3, 5, 6, 7],           // + orange · purple
    hard:   [0, 1, 2, 3, 4, 5, 6, 7, 8],     // + spring · orchid (full set)
  };
  const paletteIndex = (c) => { const m = PALETTE[difficulty]; return m && m[c] != null ? m[c] : c; };

  // ── Shared arcade leaderboard (one client for the whole arcade) ───────────
  // Data layer + modal UI are the synced shared modules, loaded as classic
  // window globals (window.ArcadeLeaderboard / window.ArcadeLeaderboardUI)
  // before game.js. Tumbler ranks by raw MOVES (fewest wins), one board per
  // difficulty per day plus a combined Total board. The modal (Easy/Medium/
  // Hard/Total tabs) + the post-win standings both render through the shared
  // factory (created below, once the board-key helpers are declared).
  const GAME = 'tumbler';
  const LB = window.ArcadeLeaderboard;
  const { submitMetricCompletion, reportStats, loadSharedHandle, saveSharedHandle } = LB;

  // ── difficulty tiers ───────────────────────────────────────────────────────
  // Each daily ships three boards, all starting from one empty tumbler + full
  // colour tubes, laid out as a 2×N grid (see empty-tube-study.md):
  //   easy   5+1 → 6 tubes (2×3)   medium 7+1 → 8 tubes (2×4)   hard 9+1 → 10 (2×5)
  // Same easy→medium→hard run as the rest of the arcade: solving one tier
  // advances to the next, and clearing all three completes the daily (which
  // chains to the next arcade game via the shared results card).
  const DIFFS = ['easy', 'medium', 'hard'];
  const DIFF_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  // Leaderboard labels include the arcade-standard aggregate 'Total' row/tab
  // (the shared factory's youOrder is [...difficulties, 'total']).
  const LB_DIFF_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', total: 'Total' };
  const DIFF_KEY = 'ctt.tumbler.difficulty';

  // ── state ──────────────────────────────────────────────────────────────────
  let PUZZLES = null, CAP = 4, COLS = 5;
  let board = [], initial = [], history = [], moveCount = 0;
  let selected = -1, mode = 'daily', puzzleId = '', par = 0, difficulty = 'easy';
  let lastDrop = null, animating = false, solvedAlready = false;

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');

  // ── handle ───────────────────────────────────────────────────────────────
  function getHandle() { return loadSharedHandle(GAME); }
  function setHandle(h) { saveSharedHandle(h); }
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
  // Namespaced leaderboard board key for a daily date + difficulty. The `d2|`
  // prefix starts a fresh board generation (the one-empty tiers aren't
  // comparable to the old single-board scores under `d1|`).
  function dailyBoardKey(diff, dateStr) { return 'd2|' + diff + '|' + dateStr; }
  function tierPool(diff) { return PUZZLES.tiers[diff].puzzles; }
  // Which board a tier serves for a given date key (defaults to the active
  // daily date, honouring any archive replay). One date drives all three tiers.
  function boardForTierToday(diff, id) {
    const dayNum = dayNumFromKey(id || puzzleId || window.ArcadeDailySeed.dailyDateKey());
    const pool = tierPool(diff);
    return pool[((dayNum % pool.length) + pool.length) % pool.length];
  }
  function startDaily() {
    mode = 'daily';
    // dailyDateKey() is today's local 'YYYY-M-D' — or the archived day being
    // replayed. The same date drives all three tiers; the difficulty selects
    // which tier's pool the day-number indexes into.
    puzzleId = window.ArcadeDailySeed.dailyDateKey();
    loadPuzzle(PUZZLES.tiers[difficulty], boardForTierToday(difficulty));
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
  // A day counts as done once ANY tier's daily has been solved — that's when a
  // local best exists for that date under one of the difficulties.
  function isDayDone(dateKey) {
    return DIFFS.some((d) => getLocalBest(d, dateKey) != null);
  }
  function startPractice() {
    mode = 'practice';
    const pool = tierPool(difficulty);
    const idx = Math.floor(Math.random() * pool.length);
    puzzleId = 'practice';
    loadPuzzle(PUZZLES.tiers[difficulty], pool[idx]);
    $('puzzleLabel').textContent = 'Practice · ' + DIFF_LABEL[difficulty];
    $('bestChip').hidden = true;
  }
  function loadPuzzle(tier, p) {
    CAP = PUZZLES.capacity || 4;
    COLS = tier.cols || (tier.tubes / 2);
    boardEl.style.setProperty('--cols', COLS);
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
  // A tumbler earns the ✓ only when it's a full single-colour stack. An empty
  // tumbler is not "done" — it's just empty — so it gets no checkmark.
  function isDone(t) {
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
        const ci = paletteIndex(run.c); // logical colour → per-tier display palette
        bead.className = 'bead c' + ci;
        // one solid bead spanning the whole run (responsive via CSS vars)
        bead.style.height = 'calc(' + run.len + ' * var(--cell) + ' + (run.len - 1) + ' * var(--gap))';
        bead.style.borderRadius = R + 'px';
        bead.style.marginBottom = isBottom ? '0' : 'var(--gap)';
        // Contrast rim in the bead's own accent (light on DARK_SET beads, deep on the
        // rest — so the closest colour pairs keep opposite-luminance edges). No edge line:
        // a single wide, soft inset that fades gradually out of the bead colour, so it
        // reads as a gentle transition, not an outline. 8-digit hex adds the alpha (66 ≈ .4).
        const acc = ACCENT[ci];
        const rim = 'inset 0 0 8px ' + acc + '66';
        bead.style.boxShadow = rim + ', inset 0 5px 7px rgba(255,255,255,.26), inset 0 -9px 12px rgba(0,0,0,.30)';
        if (i === selected && isTop) bead.classList.add('lifted'); // lift the whole top run
        if (lastDrop && lastDrop.j === i && isTop) bead.classList.add(lastDrop.merged ? 'merging' : 'drop');
        const sym = document.createElement('span');
        sym.className = 'sym';
        // Grow the glyph slightly with the glob so its mark stays proportionate to a
        // taller bead (a lone glyph looks lost in a 4-high run). Subtle: +7%/cell.
        sym.style.setProperty('--gs', (1 + 0.07 * (run.len - 1)).toFixed(3));
        // Crisp outline (behind the fill) carries legibility so the fill's light/dark can
        // differentiate beads. Tinted to the bead's ACCENT (same colour as the rim) rather
        // than neutral white/black — it stays a light accent on dark glyphs and a deep one
        // on light glyphs, so it still contrasts the fill while harmonising with the rim.
        sym.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="' + GLYPH_COLOR[ci] +
          '" stroke="' + ACCENT[ci] + '" stroke-width="1.5" stroke-linejoin="round" paint-order="stroke">' + (SHAPE[ci] || '') + '</g></svg>';
        bead.appendChild(sym); // ONE glyph, geometry-centred in the run
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
  // Best is per (difficulty, date) so each tier keeps its own replayable best.
  function bestKey(diff, id) { return 'ctt.tumbler.best.' + diff + '.' + (id || puzzleId); }
  function getLocalBest(diff, id) { try { return parseInt(localStorage.getItem(bestKey(diff || difficulty, id)), 10) || null; } catch (_) { return null; } }
  function setLocalBest(v) { try { localStorage.setItem(bestKey(difficulty), String(v)); } catch (_) {} }
  function refreshBestChip() {
    const b = getLocalBest();
    if (mode === 'daily' && b) { $('bestVal').textContent = b; $('bestChip').hidden = false; }
    else $('bestChip').hidden = true;
  }
  // Standard arcade run order: solving a tier advances to the next; the last
  // tier (hard) completes the daily. Matches the shared results card's
  // advanceFirst / dailyComplete contract (as in mosaic et al.).
  function nextTier(current) {
    const i = DIFFS.indexOf(current);
    return (i >= 0 && i < DIFFS.length - 1) ? DIFFS[i + 1] : null;
  }
  // The day's combined score — sum of the player's best across all three tiers,
  // or null until every tier is cleared. Powers the arcade-standard "Total"
  // leaderboard row/tab.
  function dayTotal(id) {
    const bests = DIFFS.map((d) => getLocalBest(d, id));
    return bests.some((b) => b == null) ? null : bests.reduce((a, b) => a + b, 0);
  }
  function recordHistory(moves) {
    try {
      const h = JSON.parse(localStorage.getItem('ctt.tumbler.history') || '[]');
      // `difficulty`/`value` let the shared "You" panel (personalBests + stats)
      // read this same history — the whole arcade records one shape. Older
      // entries also carried `stars`; the shared comparator still reads those.
      h.push({ date: puzzleId, difficulty, moves, value: moves, par, t: Date.now() });
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
    // Arcade standard: post to the daily board AND a fresh all-time board
    // (alltime2|<diff>) so the modal's All-time tab populates. Ranks by moves.
    await submitMetricCompletion({ game: GAME, difficulty, value: moves, handle: getHandle(), board: dailyBoardKey(difficulty, puzzleId), meta: { par, difficulty }, alltimeVersion: 2 });
    await submitTotalIfComplete();
    showResults(moves, getLocalBest());
  }

  // Once all three tiers are cleared for the day, submit the combined total
  // (sum of the player's per-tier bests) to the shared "Total" leaderboard
  // board, so the modal's Total tab ranks players by their whole-day run.
  // Re-runs on any later improvement, so the posted total tracks current bests.
  // Deliberately NOT written to local history: a combined total isn't a "solve",
  // so it must not inflate the Solves stat or the per-board moves distribution.
  async function submitTotalIfComplete() {
    const total = dayTotal();
    if (total == null) return;
    await submitMetricCompletion({ game: GAME, difficulty: 'total', value: total, handle: getHandle(), board: dailyBoardKey('total', puzzleId), meta: { difficulty: 'total' }, alltimeVersion: 2 });
  }

  // Shared arcade results card, mounted inside the existing #resultsModal.
  // Moves (the ranking metric) lead as the primary stat; "Try to improve" is
  // the primary action (tumbler's daily is endlessly replayable for a better
  // best) with Share alongside, exactly as before.
  function showResults(moves, localBest) {
    const practice = mode === 'practice';
    const replay = !practice && !!window.__archiveDateKey;
    const progress = !practice && !replay;          // live daily → tier progression
    // Standard arcade run: advancing to the next tier is the primary action;
    // clearing the last tier (hard) completes the daily and chains to the next
    // arcade game (dailyComplete). Practice/replay just offer replay + share.
    const next = progress ? nextTier(difficulty) : null;
    const lastTier = progress && next === null;     // hard just solved → run complete
    let subHtml, detailHtml;
    if (practice) {
      subHtml = `You solved the <b>${DIFF_LABEL[difficulty]}</b> board in <b>${moves}</b> moves. <span style="color:var(--fg-subtle)">(par ${par})</span>`;
      detailHtml = '<p class="improve-note">Practice puzzles don’t count on the leaderboard — but you can keep trimming moves.</p>';
    } else {
      const best = localBest != null ? localBest : moves;
      const beatNote = (localBest != null && moves > localBest)
        ? `Your best is ${localBest}. Try again to match or beat it.`
        : 'Try again to use fewer moves — your best score is the one that counts.';
      const advNote = next ? ` Next up: <b>${DIFF_LABEL[next]}</b>.`
        : (lastTier ? ' That’s all three tiers — nice run! 🎉' : '');
      subHtml = `You solved the <b>${DIFF_LABEL[difficulty]}</b> ${replay ? puzzleId + ' board' : 'daily'}. Your best: <b>${best}</b>.${advNote}` +
        window.ArcadeLeaderboard.streakLineHtml(GAME);
      detailHtml = `<p class="improve-note">${beatNote}</p>` +
        `<div class="results-lb-title">${replay ? puzzleId + '’s' : 'Today’s'} ${DIFF_LABEL[difficulty]} leaderboard</div>`;
    }
    window.ArcadeResults.renderResults({
      mount: $('resultsMount'),
      headline: 'Solved!',
      statHtml: `${moves}<small> ${moves === 1 ? 'move' : 'moves'}</small>`,
      subHtml,
      detailHtml,
      // Clearing the last tier finishes today's Tumbler → chain to the next daily.
      dailyComplete: lastTier,
      gameSlug: GAME,
      // While a tier is left, advancing to it is the primary CTA; "Try again"
      // is always available (the daily is replayable — best score counts).
      nextLabel: next ? DIFF_LABEL[next] + ' →' : null,
      advanceFirst: !!next,
      againLabel: 'Try again',
      onShare: doShare,
      onNext: next ? () => { closeModal('resultsModal'); setDifficulty(next); } : undefined,
      onAgain: () => { closeModal('resultsModal'); resetToInitial(); },
    });
    if (!practice) {
      // Standings render through the shared factory (fewest moves first, deduped
      // to each player's best) into the card's #lb-inline mount — the same board
      // the modal shows (the replayed day's board during an archive replay).
      const lbMount = $('resultsMount').querySelector('#lb-inline');
      lbMount.classList.add('lb-scroll');
      lbUi.renderBoard(lbMount, dailyBoardKey(difficulty, puzzleId), getHandle() || null);
    }
    $('shareCardWrap').hidden = true; $('shareCardWrap').innerHTML = '';
    openModal('resultsModal');
  }

  // ── Shared leaderboard modal (Easy/Medium/Hard boards; fewest moves wins) ──
  // The factory owns the modal (Today/All-time/You scope tabs + Easy/Medium/Hard
  // difficulty tabs + day-nav) and the post-win standings; dedup-to-best-per-
  // handle happens on read inside fetchTop.
  function lbDayLabel(offset) {
    if (offset === 0) return 'Today';
    if (offset === 1) return 'Yesterday';
    const d = new Date(); d.setDate(d.getDate() - offset);
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  }
  const lbUi = window.ArcadeLeaderboardUI.createLeaderboardModal({
    gameSlug: GAME,
    difficulties: DIFFS,
    diffLabel: LB_DIFF_LABEL,
    getDifficulty: () => difficulty,
    getHandle: () => getHandle() || null,
    boardKeyForOffset: (offset, diff) => dailyBoardKey(diff, localDateStr(localDayNum() - offset)),
    dayLabelForOffset: lbDayLabel,
    rowStat: (r) => `${(r.meta && r.meta.value != null) ? r.meta.value : r.score}<small> mv</small>`,
    youRow: (best) => `${best.value != null ? best.value : best.moves}<small> mv</small>`,
    youHead: 'Your best by difficulty',
    alltimeVersion: 2,
    bestComparator: (e, cur) => (e.value != null ? e.value : e.moves) < (cur.value != null ? cur.value : cur.moves),
    youStats: { metricLabel: 'Moves', buckets: [{ label: '≤12', max: 12 }, { label: '13–20', max: 20 }, { label: '21–30', max: 30 }, { label: '31+' }] },
  });

  // ── share ──────────────────────────────────────────────────────────────────
  function shareText(moves) {
    const lb = getLocalBest();
    let s = `Tumbler — ${mode === 'daily' ? 'Daily ' + puzzleId : 'Practice'}\nSolved in ${moves} moves (par ${par})`;
    if (mode === 'daily' && lb != null && lb < moves) s += `\nMy best: ${lb}`;
    s += `\nconnectthethoughts.ca/tumbler`;
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
    // Match the in-game bead palette (styles.css .c0–.c8) so the tutorial art
    // reads as the real pieces.
    const R = '#e50b3e', O = '#ff843d', Y = '#eec84f', G = '#3d962c', C = '#33ebad', B = '#298ff5', P = '#874ae3';
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
    document.querySelectorAll('.diff-btn').forEach((btn) => {
      btn.addEventListener('click', () => { if (btn.dataset.diff !== difficulty) setDifficulty(btn.dataset.diff); });
    });
    lbUi.wire();   // shared factory owns the #lbButton + #lb-modal (Today/All-time/You + Easy/Medium/Hard tabs, day-nav)
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
    $('modeDaily').classList.toggle('active', m === 'daily');
    $('modeDaily').setAttribute('aria-pressed', m === 'daily');
    $('modePractice').classList.toggle('active', m === 'practice');
    $('modePractice').setAttribute('aria-pressed', m === 'practice');
  }
  function setMode(m) {
    // A manual mode switch always leaves any archive replay behind (back to today).
    delete window.__archiveDateKey;
    setModeUI(m);
    if (m === 'daily') startDaily(); else startPractice();
  }
  function setDiffUI(d) {
    document.querySelectorAll('.diff-btn').forEach((b) => {
      const on = b.dataset.diff === d;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on);
    });
  }
  function loadDifficulty() {
    try { const d = localStorage.getItem(DIFF_KEY); if (DIFFS.indexOf(d) >= 0) return d; } catch (_) {}
    return 'easy';
  }
  function setDifficulty(d) {
    if (DIFFS.indexOf(d) < 0) return;
    difficulty = d;
    try { localStorage.setItem(DIFF_KEY, d); } catch (_) {}
    setDiffUI(d);
    if (mode === 'daily') startDaily(); else startPractice();
  }

  // ── boot ─────────────────────────────────────────────────────────────────────
  fetch('puzzles.json?v=2').then((r) => r.json()).then((data) => {
    PUZZLES = data;
    difficulty = loadDifficulty();
    setDiffUI(difficulty);
    wire(); startDaily(); initTutorial();
  }).catch((err) => {
    boardEl.innerHTML = '<div class="lb-status">Could not load puzzles. Refresh to try again.</div>';
    console.error(err);
  });

  // read-only state hook (for diagnostics; no mutators exposed)
  window.__tumbler = { state: () => ({ moveCount, par, mode, solved: E.solved(board) }) };
})();
