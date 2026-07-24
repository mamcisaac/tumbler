/* Tumbler — daily-puzzle generator (Node), three difficulty tiers.
 *
 *   node generate.mjs [count] [seed]
 *
 * Every daily ships three boards — easy / medium / hard. Difficulty is a
 * COLOUR ramp, not a depth ramp: each tier grows the colour count C
 * (6 → 8 → 9) on a modestly-growing rack (T = C+1 tubes), with slack spread
 * by a UNIFORM deal — no pinned empty tube, no fixed "reserve" slot. This is
 * the FULL-STACK ladder: every tier caps at K=3 and every colour gets
 * exactly K beads (a completed tumbler is exactly full, no short colours):
 *
 *   easy    6 colours × 3 beads → 7 tubes,  cap 3, 21 slots (slack 3)
 *   medium  8 colours × 3 beads → 9 tubes,  cap 3, 27 slots (slack 3)
 *   hard    9 colours × 3 beads → 10 tubes, cap 3, 30 slots (slack 3)
 *
 * Short colours (dealing m of the colours one bead fewer than the rest) are
 * REMOVED from the shipped ladder as of this revision — design feedback
 * flagged them as confusing/asymmetric (a colour that never fills its cap
 * reads as a bug, not a difficulty knob). The short-colour machinery
 * (`beadsShortRandom`, `TIERS[…].short`) is kept in the code below because
 * it is harmless and still fully documented, but every shipped tier now
 * runs with `short: 0`. Logical colours are dense 0..C−1; the display
 * mapping (which hues, which order) lives in game.js, not here.
 *
 * Why colour count, not tube height: the original grid sweep over
 * (colours C, tubes T=C+1, depth K, short-colours m) found that depth alone
 * gets punishing fast — at slack held fixed, adding a colour costs ~3pp of
 * persistent-random forgiveness at K=3 but ~17pp at K=5 (colour count and
 * depth COMPOUND rather than add). A follow-up study re-litigated the
 * short-colour dial after the design rejection and confirmed the same
 * conclusion holds without it: pushing colour count at a fixed, EXACTLY-full
 * cap of 3 (never growing K, never shorting a colour) is the frontier that
 * best trades off generation speed, rotate-necessity, and forgiveness. A
 * separate "headroom" alternative (shorting every colour by one bead at
 * higher K, chasing extra slack that way instead) was measured and
 * rejected — it collapses rotate-requirement to 0–3% acceptance. Full
 * methodology, the frontier tables, and the shipped-vs-baseline numbers are
 * written up in tier-ladder-study.md's "Revision: the full-stack colour
 * ladder" section.
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
 * Expected acceptance (rotate filter alone, before par-windowing), from the
 * full-stack frontier study: easy ≈78%, medium ≈93%, hard ≈97%. Because
 * every tier is now an exactly-full cap-3 rack, acceptance climbs with
 * colour count instead of collapsing the way the old depth-heavy hard tier
 * did — there is no forgiveness dial left to lean on (no short colours), so
 * hard's difficulty comes entirely from colour count and par, not depth.
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

// Per-tier config. Difficulty rides `colors` (6/8/9); `tubes` = colors+1;
// `cap` is fixed at 3 for every tier — the full-stack ladder: every colour
// gets exactly `cap` beads, so a completed tumbler is exactly full. `short`
// (how many of `colors` colours are dealt cap-1 beads instead of cap — see
// beadsShortRandom below) is 0 on every shipped tier; the knob is kept alive
// in code but unused after the short-colour design rejection (see the
// header comment and tier-ladder-study.md). Par windows bracket the
// full-stack frontier's uniform-deal par means (~12/17/20) with headroom
// either side. The windows overlap at the edges (15 and 17-20 are shared);
// tiers separate by MEDIAN par (13/17/20), not by disjoint ranges.
const TIERS = [
  { key: 'easy',   colors: 6, tubes: 7,  cap: 3, short: 0, minPar: 10, maxPar: 15 },
  { key: 'medium', colors: 8, tubes: 9,  cap: 3, short: 0, minPar: 15, maxPar: 20 },
  { key: 'hard',   colors: 9, tubes: 10, cap: 3, short: 0, minPar: 17, maxPar: 23 },
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
  const maxTries = COUNT * 200;   // generous headroom; even easy's ~78% rotate-filter acceptance clears this fast
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
const out = { version: 4, generated: new Date().toISOString(), tiers: {} };
for (const tier of TIERS) {
  const seedBase = (SEED ^ Math.imul((tier.colors * 16 + tier.cap) * 2654435761, 40503)) >>> 0;
  out.tiers[tier.key] = generateTier(tier, seedBase);
}

writeFileSync('puzzles.json', JSON.stringify(out));
const counts = TIERS.map(t => `${t.key}=${out.tiers[t.key].puzzles.length}`).join(' ');
console.log(`\nwrote puzzles.json  (${counts})`);
