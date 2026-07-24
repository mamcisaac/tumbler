/* Tumbler — daily-puzzle generator (Node), three difficulty tiers.
 *
 *   node generate.mjs [count] [seed]
 *
 * Every daily ships three boards — easy / medium / hard. Difficulty is a
 * COLOUR ramp, not a depth ramp: each tier grows the colour count C (6 → 7 →
 * 8) on a modestly-growing rack (T = C+1 tubes, cap K = 3/4/5), with slack
 * spread by a UNIFORM deal — no pinned empty tube, no fixed "reserve" slot:
 *
 *   easy    6 colours × 3 beads              → 7 tubes, cap 3, 21 slots (slack 3)
 *   medium  7 colours × 4 beads, 1 short (3)  → 8 tubes, cap 4, 32 slots (slack 5)
 *   hard    8 colours × 5 beads, 4 short (4)  → 9 tubes, cap 5, 45 slots (slack 9)
 *
 * "short" colours are dealt one bead fewer than the rest — that's the extra
 * slack knob beyond (T−C)·K, and WHICH colours are short is a fresh uniform
 * choice every deal (never fixed indices), so short-ness never correlates
 * with a colour identity. Logical colours are dense 0..C−1; the display
 * mapping (which hues, which order) lives in game.js, not here.
 *
 * Why colour count, not tube height: a `/tmp/.../grid/` sweep over
 * (colours C, tubes T=C+1, depth K, short-colours m) found that depth alone
 * gets punishing fast — at slack held fixed, adding a colour costs ~3pp of
 * persistent-random forgiveness at K=3 but ~17pp at K=5 (colour count and
 * depth COMPOUND rather than add) — while short-colour slack (m) is a much
 * gentler, more controllable dial at any fixed (C,T,K). So the ladder rides
 * colours (this file's `colors`) across modest depths (3/4/5), and uses `m`
 * to tune each tier's forgiveness/rotate-requirement trade-off independently.
 * Full methodology, the frontier tables, and the shipped-vs-baseline numbers
 * are written up in tier-ladder-study.md (reproduce with
 * `node tier-ladder-study.mjs`).
 *
 * Method per deal:
 *   1. Shuffle beads + blanks together (dealCustom-style uniform deal), chop
 *      into `tubes` chunks of `cap` slots each, drop the blanks. Reject a
 *      deal that is already solved.
 *   2. Filter 1 — Rotate required: keep the deal only if an EXHAUSTIVE
 *      pour-only search (pruned legalPours, weighted-A* over pours alone,
 *      node budget 600k) fails to find any solution, i.e. the pour-only
 *      reachable space is fully exhausted without solving — a PROOF the
 *      board needs Rotate. A node-budget miss is "maybe solvable without
 *      Rotate" and is rejected too: we only ever ship boards with a proof,
 *      never a budget guess.
 *   3. Filter 2 — par window: solver.js's weighted (W=2) A* must find a
 *      solution whose length lands inside the tier's par window.
 *   4. Emit `{ tubes, par }` — 200 boards per tier by default.
 *
 * Expected acceptance (rotate filter alone, before par-windowing) from the
 * grid study, N=300 confirmation runs: easy ≈78%, medium ≈67%, hard ≈13%.
 * Hard's rotate filter is stingy because slack=9 lets plain water-sort often
 * squeak through anyway; that's WHY hard leans on m=4 (four short colours)
 * to buy back enough forgiveness once the rotate-required subset is taken —
 * see tier-ladder-study.md's "short-colour slack dial" section.
 *
 * Deterministic: mulberry32 PRNG, per-tier seed derived from a top-level
 * seed (CLI arg 2, default fixed below) so the shipped pool is reproducible.
 */
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const E = require('./engine.js');
const S = require('./solver.js');

const argv = process.argv.slice(2);
const COUNT = +(argv[0] || 200);                                   // boards per tier
const SEED  = argv[1] !== undefined ? (+argv[1] >>> 0) : 0x9e3779b9; // top-level seed (fixed default => reproducible pool)

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (rng, n) => Math.floor(rng() * n);
function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = randInt(rng, i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  return arr;
}

// Per-tier config. Difficulty rides `colors` (6/7/8); `tubes` = colors+1;
// `cap` = tube height (3/4/5); `short` = how many of `colors` colours are
// dealt cap-1 beads instead of cap (a fresh random subset every deal — see
// beadsShortRandom below). Par windows bracket the colour-ramp ladder's
// uniform-deal par means from the grid study (~12/20/28) with headroom
// either side, kept non-overlapping so tiers separate cleanly by par.
const TIERS = [
  { key: 'easy',   colors: 6, tubes: 7, cap: 3, short: 0, minPar: 10, maxPar: 15 },
  { key: 'medium', colors: 7, tubes: 8, cap: 4, short: 1, minPar: 17, maxPar: 23 },
  { key: 'hard',   colors: 8, tubes: 9, cap: 5, short: 4, minPar: 24, maxPar: 31 },
];

// m of `colors` colours (a FRESH uniformly-random subset every call) dealt
// cap-1 beads instead of cap. Unlike a fixed "colours 0..m-1 are short"
// scheme, this keeps short-ness from ever correlating with a colour identity
// (display colour assignment lives entirely in game.js).
function beadsShortRandom(rng, cap, m, colors) {
  const idx = Array.from({ length: colors }, (_, i) => i);
  shuffle(rng, idx);
  const shortSet = new Set(idx.slice(0, m));
  const arr = [];
  for (let c = 0; c < colors; c++) arr.push(cap - (shortSet.has(c) ? 1 : 0));
  return arr;
}

// Uniform deal (dealCustom, from the grid study): shuffle beads + blanks
// together, chop into `tubes` chunks of `cap` slots each, drop the blanks.
// Slack is spread by the shuffle, not pinned to any one tube.
function dealBoard(rng, cap, tubes, beadsPerColorArr) {
  const colors = beadsPerColorArr.length;
  const items = [];
  for (let c = 0; c < colors; c++) for (let k = 0; k < beadsPerColorArr[c]; k++) items.push(c);
  const totalSlots = tubes * cap;
  const slack = totalSlots - items.length;
  for (let b = 0; b < slack; b++) items.push(-1);
  shuffle(rng, items);
  const board = [];
  for (let t = 0; t < tubes; t++) board.push(items.slice(t * cap, (t + 1) * cap).filter(x => x >= 0));
  return board;
}

// ── exhaustive pour-only prover (verbatim from the grid study's
// solveNoRotate: weighted A* restricted to pours, dedup on best-known g per
// state) ─────────────────────────────────────────────────────────────────
// Returns:
//   -1   = PROVEN unsolvable by pours alone — the pour-only reachable space
//          was fully exhausted without finding a solved state. This board
//          provably REQUIRES Rotate.
//   null = node budget hit before the space was exhausted — unknown. Treated
//          as "maybe solvable without Rotate" and rejected: we only ship
//          boards with a proof, never a budget guess.
//   n>=0 = solvable by pours alone in n moves — Rotate not required, reject.
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

function generateTier(tier, seedBase) {
  const { key, colors, tubes, cap: K, short: m, minPar, maxPar } = tier;
  const puzzles = [];
  let tries = 0, rejSolved = 0, rejNoSolve = 0, rejNoRotate = 0, rejPar = 0;
  const t0 = Date.now();
  const maxTries = COUNT * 200;   // hard's ~13% rotate-filter acceptance needs headroom
  while (puzzles.length < COUNT && tries < maxTries) {
    tries++;
    const rng = mulberry32((seedBase ^ Math.imul(tries, 2654435761)) >>> 0);
    const beads = beadsShortRandom(rng, K, m, colors);
    const board = dealBoard(rng, K, tubes, beads);
    if (E.solved(board)) { rejSolved++; continue; }

    const w2 = S.solve(board, K, { weight: 2, nodeCap: 250000 });
    if (!w2) { rejNoSolve++; continue; }                 // couldn't confirm solvable in budget

    // Filter 1 — provably requires Rotate (exhaustive pour-only search).
    const nr = solveNoRotate(board, K, 600000);
    if (nr !== -1) { rejNoRotate++; continue; }           // solvable by pours alone, or budget miss (null)

    // Filter 2 — par window.
    if (w2.length < minPar || w2.length > maxPar) { rejPar++; continue; }

    puzzles.push({ tubes: board, par: w2.length });
    if (puzzles.length % 25 === 0) process.stdout.write(`  ${key}: ${puzzles.length}/${COUNT} (tries=${tries})\n`);
  }
  const elapsedS = (Date.now() - t0) / 1000;
  const pars = puzzles.map(p => p.par).sort((a, b) => a - b);
  const med = pars.length ? pars[pars.length >> 1] : 0;
  console.log(
    `  ${key}: accepted ${puzzles.length}/${COUNT} in ${elapsedS.toFixed(1)}s from ${tries} deals` +
    ` — rejected: solved-at-start=${rejSolved} no-solve-budget=${rejNoSolve} no-rotate=${rejNoRotate} par-window=${rejPar}` +
    ` — par min=${pars[0]} median=${med} max=${pars[pars.length - 1]}` +
    ` (colors=${colors}, tubes=${tubes}, cap=${K}, short=${m})`
  );
  return { colors, tubes, cols: Math.ceil(tubes / 2), cap: K, puzzles };
}

console.log(`Generating ${COUNT} boards per tier (seed=${SEED})…`);
const out = { version: 3, generated: new Date().toISOString(), tiers: {} };
for (const tier of TIERS) {
  const seedBase = (SEED ^ Math.imul((tier.colors * 16 + tier.cap) * 2654435761, 40503)) >>> 0;
  out.tiers[tier.key] = generateTier(tier, seedBase);
}

writeFileSync('puzzles.json', JSON.stringify(out));
const counts = TIERS.map(t => `${t.key}=${out.tiers[t.key].puzzles.length}`).join(' ');
console.log(`\nwrote puzzles.json  (${counts})`);
