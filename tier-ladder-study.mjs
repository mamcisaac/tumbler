/* Tumbler — design study: the COLOUR-RAMP tier ladder (replaces the old
 * depth-ramp: same 7 colours + 1 pinned-empty tube on every tier, only tube
 * height K growing 3/4/5). Sweeps (colours C, tubes T=C+1, depth K, short-
 * colours m) with a uniform deal (no pinned empty tube — slack is spread by
 * the shuffle) and measures, per cell: par, the rotate-required acceptance
 * rate, and forgiveness under a PERSISTENT-random player.
 *
 *   node tier-ladder-study.mjs [N] [playouts]
 *
 *   N        boards sampled per cell (default 150; use 300 to firm up a
 *            specific frontier cell — see the CELLS list below).
 *   playouts persistent-random playouts per board (default 30).
 *
 * Reused (adapted to a single file, no cross-script imports):
 *   - mulberry32 PRNG, shuffle/choice/randInt
 *   - dealCustom(rng, K, tubes, beadsPerColorArr): shuffle beads+blanks
 *     together, chop into per-tube chunks of size K, drop blanks. Colour- and
 *     tube-count-agnostic.
 *   - beadsShortM(K, m, colors): m of `colors` colours dealt K-1 beads
 *     instead of K (fixed indices 0..m-1 here, for reproducibility across
 *     runs — colour IDENTITY never affects the measured statistics, since the
 *     dealer treats every colour symmetrically; the SHIPPED generator picks a
 *     fresh random subset of short colours per deal instead, which is
 *     statistically equivalent and keeps display colour from correlating with
 *     "short" — see generate.mjs).
 *   - no-rotate exhaustive prover (solveNoRotate): weighted A* restricted to
 *     pours; -1 = proof of no pour-only solution (Rotate required), null =
 *     node-budget miss (unknown), n>=0 = solvable by pours alone.
 *   - hard-stuck detector (TRUE dead end: zero legal pours in EITHER
 *     orientation — an absorbing state, since rotate is its own inverse).
 *   - PERSISTENT playout policy: uniform-random over pruned pours + rotate
 *     (skip re-rotating immediately), EXCEPT when that list would be empty
 *     it rotates anyway instead of giving up. See the "why persistent, not
 *     canonical" note below — canonical (which just gives up there) turns
 *     out to be far too pessimistic a player model.
 *   - W2 par (solver.js-equivalent weighted A*, weight 2) / W1 optimal
 *     (weight 1, first 40 accepted boards per cell), matching generate.mjs's
 *     node caps (w2Cap 250k, noRotCap 600k, w1Cap 2M).
 *   - filtered-subset recompute: among boards that provably need >=1 rotate,
 *     recompute persistent solve%, hard-stuck%, par, rotate usage — this is
 *     the subset the shipped generator actually ships (every daily requires
 *     Rotate), so it's the number that matters for player-facing difficulty.
 *
 * Why PERSISTENT, not CANONICAL, as the player model: a naive "canonical"
 * random player (same move menu, but gives up the instant it has zero pruned
 * pours right after a rotate) is a much harsher and less realistic proxy —
 * on the OLD shipped pool it solves only 39.5/18.7/7.6% of the time
 * (easy/medium/hard) vs persistent's 87/61/39%. The gap isn't because those
 * canonical give-ups are real dead ends: a direct check (rotate once more
 * from every canonical give-up state, across the whole old shipped pool,
 * 30 playouts x 200 boards/tier) found ROTATING BACK REVEALS A LEGAL POUR
 * 100% OF THE TIME (easy 9,183/9,183, medium 139,050/139,050, hard
 * 269,924/269,924 give-up states checked) — every single one of canonical's
 * "give ups" was one rotate away from a live board. Persistent's only change
 * from canonical is to take that extra rotate instead of stopping, so it is
 * the more honest forgiveness proxy and is what this study (and
 * empty-tube-study.mjs before it) reports throughout.
 *
 * Usage: node tier-ladder-study.mjs [N] [playouts]
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const E = require('./engine.js');
const S = require('./solver.js');

const N = +(process.argv[2] || 150);
const P = +(process.argv[3] || 30);
const W2_CAP = 250000, NOROT_CAP = 600000, W1_CAP = 2000000, OPT_SUBSET = 40;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (rng, n) => Math.floor(rng() * n);
const choice = (rng, arr) => arr[randInt(rng, arr.length)];
function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = randInt(rng, i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  return arr;
}
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function pct(num, den) { return den ? 100 * num / den : NaN; }
function percentile(sortedArr, frac) {
  if (!sortedArr.length) return null;
  if (sortedArr.length === 1) return sortedArr[0];
  const idx = frac * (sortedArr.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

/* ── dealer ────────────────────────────────────────────────────────────── */
function dealCustom(rng, K, tubes, beadsPerColorArr) {
  const colors = beadsPerColorArr.length;
  const items = [];
  for (let c = 0; c < colors; c++) for (let k = 0; k < beadsPerColorArr[c]; k++) items.push(c);
  const totalSlots = tubes * K;
  const slack = totalSlots - items.length;
  if (slack < 0) throw new Error('negative slack for dealCustom params: ' + JSON.stringify(beadsPerColorArr));
  for (let b = 0; b < slack; b++) items.push(-1);
  shuffle(rng, items);
  const board = [];
  for (let t = 0; t < tubes; t++) board.push(items.slice(t * K, (t + 1) * K).filter(x => x >= 0));
  return { board, slack };
}
function beadsShortM(K, m, colors) {
  const arr = [];
  for (let c = 0; c < colors; c++) arr.push(K - (c < m ? 1 : 0));
  return arr;
}

/* ── exhaustive pour-only prover ──────────────────────────────────────── */
function heapPush(a, item) {
  a.push(item); let i = a.length - 1;
  while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; const t = a[p]; a[p] = a[i]; a[i] = t; i = p; }
}
function heapPop(a) {
  const top = a[0], last = a.pop();
  if (a.length) { a[0] = last; let i = 0;
    while (true) { const l = 2 * i + 1, r = l + 1; let s = i;
      if (l < a.length && a[l][0] < a[s][0]) s = l;
      if (r < a.length && a[r][0] < a[s][0]) s = r;
      if (s === i) break; const t = a[s]; a[s] = a[i]; a[i] = t; i = s; } }
  return top;
}
function solveNoRotate(startBoard, K, cap) {
  if (E.solved(startBoard)) return 0;
  const open = [];
  heapPush(open, [2 * S.heuristic(startBoard), startBoard, 0]);
  const gMap = new Map([[E.key(startBoard), 0]]);
  let nodes = 0;
  while (open.length) {
    const [, board, g] = heapPop(open);
    if (++nodes > cap) return null;
    for (const mv of E.legalPours(board, K, { prune: true })) {
      const nb = E.applyMove(board, mv, K);
      const nk = E.key(nb);
      const ng = g + 1;
      if (gMap.has(nk) && gMap.get(nk) <= ng) continue;
      gMap.set(nk, ng);
      if (E.solved(nb)) return ng;
      heapPush(open, [ng + 2 * S.heuristic(nb), nb, ng]);
    }
  }
  return -1;
}

/* ── hard-stuck (TRUE dead end) ───────────────────────────────────────── */
function isHardStuck(board, K) {
  if (E.legalPours(board, K).length > 0) return false;
  const rb = E.rotate(board);
  return E.legalPours(rb, K).length === 0;
}

/* ── PERSISTENT playout ───────────────────────────────────────────────── */
function persistentPlayout(board0, K, rng, cap) {
  let board = board0;
  let lastRotate = false;
  for (let m = 0; m < cap; m++) {
    if (E.solved(board)) return { outcome: 'solved', moves: m };
    if (isHardStuck(board, K)) return { outcome: 'hard-stuck', moves: m };
    const pours = E.legalPours(board, K, { prune: true });
    const moves = pours.slice();
    if (!lastRotate) moves.push({ type: 'rotate' });
    if (moves.length === 0) moves.push({ type: 'rotate' }); // persistent: rotate anyway
    const mv = choice(rng, moves);
    board = E.applyMove(board, mv, K);
    lastRotate = mv.type === 'rotate';
  }
  return { outcome: 'cap', moves: cap };
}

/* ── per-cell measurement ─────────────────────────────────────────────── */
function measureCell(cell, seedSalt) {
  const { label, K, C, T, m } = cell;
  const beads = beadsShortM(K, m, C);
  const genFn = rng => dealCustom(rng, K, T, beads);

  const rows = [];
  let tries = 0, unsolvableInBudget = 0;

  while (rows.length < N) {
    tries++;
    const rng = mulberry32((seedSalt ^ Math.imul(tries, 2654435761)) >>> 0);
    const { board } = genFn(rng);
    if (E.solved(board)) continue;
    const w2 = S.solve(board, K, { weight: 2, nodeCap: W2_CAP });
    if (!w2) { unsolvableInBudget++; continue; }

    const rotCount = w2.moves.filter(mv => mv.type === 'rotate').length;
    const usesRotate = rotCount > 0;

    const nr = solveNoRotate(board, K, NOROT_CAP);
    const noRot = nr === -1 ? 'unsolvable' : (nr === null ? 'unknown' : 'solvable');

    let opt = null;
    if (rows.length < OPT_SUBSET) {
      const w1 = S.solve(board, K, { weight: 1, nodeCap: W1_CAP });
      if (w1) opt = w1.length;
    }

    let pSolved1000 = 0, pHardStuckN = 0, pCapOutN = 0;
    const pSolvedMoves = [];
    for (let p = 0; p < P; p++) {
      const prng = mulberry32((seedSalt ^ Math.imul(tries * 977 + p + 1, 2246822519)) >>> 0);
      const r = persistentPlayout(board, K, prng, 1000);
      if (r.outcome === 'solved') { pSolved1000++; pSolvedMoves.push(r.moves); }
      else if (r.outcome === 'hard-stuck') pHardStuckN++;
      else pCapOutN++;
    }

    rows.push({ parW2: w2.length, rotCount, usesRotate, noRot, opt, pSolved1000, pHardStuckN, pCapOutN, pSolvedMoves });
  }

  const pars = rows.map(r => r.parW2);
  const optRows = rows.filter(r => r.opt != null);
  const rotUsedN = rows.filter(r => r.usesRotate).length;
  const noRotDetermined = rows.filter(r => r.noRot !== 'unknown');
  const totalPlayouts = rows.length * P;
  const totalPSolved = rows.reduce((s, r) => s + r.pSolved1000, 0);
  const totalPHardStuck = rows.reduce((s, r) => s + r.pHardStuckN, 0);
  const totalPCapOut = rows.reduce((s, r) => s + r.pCapOutN, 0);

  const filt = rows.filter(r => r.noRot === 'unsolvable');
  const filtOptRows = filt.filter(r => r.opt != null);
  const filtPlayouts = filt.length * P;
  const filtPSolved = filt.reduce((s, r) => s + r.pSolved1000, 0);
  const filtPHardStuck = filt.reduce((s, r) => s + r.pHardStuckN, 0);
  const filtRotUsedN = filt.filter(r => r.usesRotate).length;
  const filtParsSorted = filt.map(r => r.parW2).slice().sort((a, b) => a - b);

  const result = {
    label, K, C, T, m,
    N: rows.length, tries, unsolvableInBudget, slack: (T - C) * K + m,
    parW2Mean: +mean(pars).toFixed(2),
    optMean: optRows.length ? +mean(optRows.map(r => r.opt)).toFixed(2) : null,
    persistentSolvePct1000: +pct(totalPSolved, totalPlayouts).toFixed(2),
    hardStuckPct: +pct(totalPHardStuck, totalPlayouts).toFixed(2),
    capOutPct: +pct(totalPCapOut, totalPlayouts).toFixed(2),
    provablyNeedsRotatePct: +pct(filt.length, noRotDetermined.length).toFixed(1),
    solverUsesRotatePct: +pct(rotUsedN, rows.length).toFixed(1),
    rotMeanPerSolution: +mean(rows.map(r => r.rotCount)).toFixed(2),
    filter_N: filt.length,
    filter_parW2Mean: filt.length ? +mean(filt.map(r => r.parW2)).toFixed(2) : null,
    filter_parW2_p10: filt.length ? +percentile(filtParsSorted, 0.10).toFixed(2) : null,
    filter_parW2_p90: filt.length ? +percentile(filtParsSorted, 0.90).toFixed(2) : null,
    filter_optMean: filtOptRows.length ? +mean(filtOptRows.map(r => r.opt)).toFixed(2) : null,
    filter_persistentSolvePct1000: filtPlayouts ? +pct(filtPSolved, filtPlayouts).toFixed(2) : null,
    filter_hardStuckPct: filtPlayouts ? +pct(filtPHardStuck, filtPlayouts).toFixed(2) : null,
    filter_solverUsesRotatePct: filt.length ? +pct(filtRotUsedN, filt.length).toFixed(1) : null,
    filter_rotMeanPerSolution: filt.length ? +mean(filt.map(r => r.rotCount)).toFixed(2) : null,
  };
  console.error(`[${label}] slack=${result.slack} solve1000=${result.persistentSolvePct1000}% | accept=${result.provablyNeedsRotatePct}% filterN=${result.filter_N} filterSolve1000=${result.filter_persistentSolvePct1000}%`);
  return result;
}

/* ── cell definitions ─────────────────────────────────────────────────── */
const CELLS = [];
const CVALS = [5, 6, 7, 8];

// Core: T = C+1, m dial (K3/K4 go 0..3, K5 goes 0..4 since it has more slack
// headroom to spend on short colours).
for (const K of [3, 4]) {
  for (const C of CVALS) {
    const T = C + 1;
    for (const m of [0, 1, 2, 3]) CELLS.push({ label: `K${K}_C${C}_T${T}_m${m}`, K, C, T, m });
  }
}
for (const C of CVALS) {
  const K = 5, T = C + 1;
  for (const m of [0, 1, 2, 3, 4]) CELLS.push({ label: `K${K}_C${C}_T${T}_m${m}`, K, C, T, m });
}
// Reference: T = C+2, m=0 (one extra tube of slack vs core, at C in {5,6,7})
// -- expected to be rotate-dead (plain water sort solves almost everything).
for (const K of [3, 4, 5]) {
  for (const C of [5, 6, 7]) CELLS.push({ label: `K${K}_C${C}_T${C + 2}_m0_ref`, K, C, T: C + 2, m: 0 });
}

console.error(`tier-ladder-study: ${CELLS.length} cells, N=${N} playouts=${P}\n`);
const results = [];
for (const cell of CELLS) {
  const seedSalt = (0x9e3779b9 ^ Math.imul(
    [...cell.label].reduce((h, ch) => (h * 131 + ch.charCodeAt(0)) | 0, 7),
    2654435761
  )) >>> 0;
  results.push(measureCell(cell, seedSalt));
}

/* ── report: frontier tables + the shipped ladder's three cells ─────────── */
function printTable(rows) {
  console.log('cell'.padEnd(20), 'slack', 'par/opt'.padEnd(12), 'solve%'.padEnd(8), 'accept%'.padEnd(8), 'filterSolve%'.padEnd(13), 'filterRotMean');
  for (const r of rows) {
    console.log(
      r.label.padEnd(20),
      String(r.slack).padEnd(5),
      `${r.parW2Mean}/${r.optMean ?? '-'}`.padEnd(12),
      String(r.persistentSolvePct1000).padEnd(8),
      String(r.provablyNeedsRotatePct).padEnd(8),
      String(r.filter_persistentSolvePct1000 ?? '-').padEnd(13),
      String(r.filter_rotMeanPerSolution ?? '-')
    );
  }
}

for (const K of [3, 4, 5]) {
  console.log(`\n=== K=${K} core cells (T=C+1) ===`);
  printTable(results.filter(r => r.K === K && r.T === r.C + 1).sort((a, b) => a.slack - b.slack || a.C - b.C));
}
console.log(`\n=== Reference cells (T=C+2, m=0) ===`);
printTable(results.filter(r => r.T === r.C + 2));

console.log(`\n=== Shipped ladder (colour ramp) ===`);
const SHIPPED = [
  { key: 'easy', label: 'K3_C6_T7_m0' },
  { key: 'medium', label: 'K4_C7_T8_m1' },
  { key: 'hard', label: 'K5_C8_T9_m4' },
];
for (const s of SHIPPED) {
  const r = results.find(x => x.label === s.label);
  if (r) console.log(`  ${s.key.padEnd(8)} ${s.label}: par ${r.parW2Mean} (opt ${r.optMean})  accept ${r.provablyNeedsRotatePct}%  filtered solve% ${r.filter_persistentSolvePct1000}  filtered par ${r.filter_parW2Mean} [p10 ${r.filter_parW2_p10} - p90 ${r.filter_parW2_p90}]`);
}
