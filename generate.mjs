/* Tumbler — daily-puzzle generator (Node), three difficulty tiers.
 *
 *   node generate.mjs [count] [seed]
 *
 * Every daily ships three boards — easy / medium / hard. Difficulty is a
 * COLOUR ramp: each tier grows the colour count C (6 → 7 → 8) on a rack of
 * T = C+1 tubes, cap fixed at 3, every colour a FULL 3-stack (a completed
 * tumbler is exactly full, no short colours). What's new in THIS revision is
 * the deal itself:
 *
 *   easy    6 colours × 3 beads → 7 tubes, cap 3, ONE pinned empty tube
 *   medium  7 colours × 3 beads → 8 tubes, cap 3, ONE pinned empty tube
 *   hard    8 colours × 3 beads → 9 tubes, cap 3, ONE pinned empty tube
 *
 * WHY pin one tube empty (again): measured across the 600 boards the
 * previous (uniform-spread) generator shipped, the OPENING move was nearly
 * forced. Spreading the deal's slack uniformly across every tube means most
 * boards start with only a bead or two of "give" anywhere, and often none:
 * the shipped v4 pool's first move offered a MEDIAN of just 2 legal pours,
 * with 40% / 32.5% / 38.5% of easy/medium/hard boards opening at ≤1 legal
 * pour and 12.5% / 7.5% / 7% opening at ZERO (Rotate the only legal move).
 * A puzzle whose first "choice" is usually not a choice at all undersells
 * the mechanic from move one.
 *
 * The fix is structural, not a filter: pin exactly ONE tube empty at deal
 * time. At these parameters (cap 3, tubes = colours+1) that fully determines
 * the rest of the deal — slack = cap exactly, so every other tube is
 * necessarily dealt completely full. And a full tube is always a legal pour
 * source into the one empty tube (it's a monochrome-or-mixed stack pouring
 * into empty space — never blocked by a colour mismatch, since there's
 * nothing in the destination to mismatch against). So the opening is always
 * exactly C-way: every one of the C full tubes is a legal first pour, no
 * more, no less, on every single board. Opening variance drops to zero by
 * construction — there is no board in this design with fewer (or more) than
 * C legal first moves.
 *
 * This is a MOVE-0 fix, not a whole-game one: by move 1, mean branching
 * under the pinned design converges back to roughly what the old spread
 * design already had at that depth (both land in the same ~1.9–2.1 range),
 * and by mid-game the two designs are statistically indistinguishable. Full
 * move-index tables, the mid-game branching-vs-colour-count finding, and the
 * pinned-vs-spread forgiveness/par cost are written up in
 * tier-ladder-study.md's "Revision 2: the pinned empty tumbler" section —
 * including why hard stops at 8 colours (not 9): 9 colours pins in at 79.1%
 * pipeline-realistic solve, just under the 80% forgiveness bar, and it also
 * has the most forced mid-game branching profile of the colour counts
 * measured, so there's no upside left to trade for the extra colour.
 *
 * Method per deal:
 *   1. Shuffle the C×cap bead multiset, pack it into exactly C completely
 *      full tubes, then splice in one EMPTY tube at a uniformly random
 *      position among the C+1 slots (the position is purely cosmetic — it
 *      changes which rack slot looks empty, not the opening's legal-move
 *      count, since Rotate flips tube CONTENTS, not rack positions — but
 *      randomising it keeps the rack visually varied day to day). Reject a
 *      deal that is already solved (theoretically possible, vanishingly
 *      rare — every non-empty tube happening to land monochrome).
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
 * Expected acceptance (measured on this exact pipeline — deal, W2-solve,
 * rotate filter, par window — 200-survivor runs per tier): overall
 * generator acceptance 62.9% / 77.5% / 85.1% for easy/medium/hard, and
 * pipeline-realistic persistent-random solve% (30 random playouts/board)
 * 92.0% / 86.8% / 80.7%. Pinning costs a few points of forgiveness and about
 * a move of par versus the old spread deal at the same colour count — the
 * trade for a guaranteed real opening choice on every board. Logical
 * colours are dense 0..C−1; the display mapping (which hues, which order)
 * lives in game.js, not here.
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

// Per-tier config. Difficulty rides `colors` (6/7/8); `tubes` = colors+1
// (colors full tubes + one pinned empty); `cap` is fixed at 3 for every
// tier — every colour gets exactly `cap` beads, so a completed tumbler is
// exactly full and there is no short-colour dial. Par windows are the ones
// validated in the pinned-empty settle study (tier-ladder-study.md,
// "Revision 2: the pinned empty tumbler") so the shipped pools match the
// measured pipeline acceptance/solve numbers in the header comment above.
const TIERS = [
  { key: 'easy',   colors: 6, tubes: 7, cap: 3, minPar: 10, maxPar: 16 },
  { key: 'medium', colors: 7, tubes: 8, cap: 3, minPar: 13, maxPar: 19 },
  { key: 'hard',   colors: 8, tubes: 9, cap: 3, minPar: 15, maxPar: 21 },
];

// Pinned-empty deal: shuffle the C×cap bead multiset and pack it into
// exactly `colors` completely full tubes (no blanks anywhere in the shuffle
// — every colour gets exactly `cap` beads by construction), then splice in
// one EMPTY tube at a uniformly random position among the `colors+1` rack
// slots. Slack equals `cap` exactly (one tube's worth), all held in a single
// tube instead of spread across the rack — this is the whole of the design
// change from the old uniform deal (dealBoard, removed this revision).
function dealBoardPinned(rng, cap, colors) {
  const items = [];
  for (let c = 0; c < colors; c++) for (let k = 0; k < cap; k++) items.push(c);
  shuffle(rng, items);
  const board = [];
  for (let c = 0; c < colors; c++) board.push(items.slice(c * cap, (c + 1) * cap));
  const emptyAt = randInt(rng, colors + 1); // cosmetic only — rotate flips contents, not rack position
  board.splice(emptyAt, 0, []);
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
  const { key, colors, tubes, cap: K, minPar, maxPar } = tier;
  const puzzles = [];
  let tries = 0, rejSolved = 0, rejNoSolve = 0, rejNoRotate = 0, rejPar = 0;
  const t0 = Date.now();
  const maxTries = COUNT * 200;   // generous headroom; overall acceptance is 63-85% on this pipeline
  while (puzzles.length < COUNT && tries < maxTries) {
    tries++;
    const rng = mulberry32((seedBase ^ Math.imul(tries, 2654435761)) >>> 0);
    const board = dealBoardPinned(rng, K, colors);
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
    ` (colors=${colors}, tubes=${tubes}, cap=${K}, pinned-empty)`
  );
  return { colors, tubes, cols: Math.ceil(tubes / 2), cap: K, puzzles };
}

console.log(`Generating ${COUNT} boards per tier (seed=${SEED})…`);
const out = { version: 5, generated: new Date().toISOString(), tiers: {} };
for (const tier of TIERS) {
  const seedBase = (SEED ^ Math.imul((tier.colors * 16 + tier.cap) * 2654435761, 40503)) >>> 0;
  out.tiers[tier.key] = generateTier(tier, seedBase);
}

writeFileSync('puzzles.json', JSON.stringify(out));
const counts = TIERS.map(t => `${t.key}=${out.tiers[t.key].puzzles.length}`).join(' ');
console.log(`\nwrote puzzles.json  (${counts})`);
