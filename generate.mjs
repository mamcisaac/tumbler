/* Tumbler — daily-puzzle generator (Node), three difficulty tiers.
 *
 *   node generate.mjs [count] [minRotHard]
 *
 * Every daily now ships three boards — easy / medium / hard — and each one
 * starts from a clean deal of ONE empty tumbler plus fully-full colour tubes,
 * laid out as a 2×N grid:
 *
 *   easy   5 colours + 1 empty  →  6 tubes  (2×3)
 *   medium 7 colours + 1 empty  →  8 tubes  (2×4)
 *   hard   9 colours + 1 empty  → 10 tubes  (2×5)
 *
 * Method: deal 4·colours beads uniformly into `colours` full tubes, pin the
 * empty tube last, then keep a board iff (a) the solver finds a solution whose
 * length lands in the tier's par window and (b) the board PROVABLY requires at
 * least `minRot` rotations (unsolvable with fewer — checked by exhausting the
 * bounded-rotation search space). Requiring a rotation is what keeps Tumbler's
 * signature mechanic load-bearing on every board, including easy.
 *
 * See empty-tube-study.md for the simulations behind the tier parameters and
 * the rotation-requirement choice.
 */
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const E = require('./engine.js');
const S = require('./solver.js');

const argv = process.argv.slice(2);
const COUNT       = +(argv[0] || 200);   // boards per tier
const MIN_ROT_HARD = +(argv[1] || 2);    // hard leans into rotation; easy/medium require ≥1
const K = 4;

// Per-tier config. `minRot` = the board must be provably UNSOLVABLE with fewer
// than this many rotations. Par windows come from empty-tube-study.md.
const TIERS = [
  { key: 'easy',   colors: 5, tubes: 6,  minPar: 13, maxPar: 19, minRot: 1 },
  { key: 'medium', colors: 7, tubes: 8,  minPar: 20, maxPar: 27, minRot: 1 },
  { key: 'hard',   colors: 9, tubes: 10, minPar: 27, maxPar: 37, minRot: MIN_ROT_HARD },
];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (rng, n) => Math.floor(rng() * n);

// Uniform deal: shuffle 4·colours beads, slice into `colours` full tubes, then
// append the empty tube LAST so the board always ends with the spare (which the
// UI renders as the bottom-right cell of the 2×N grid).
function dealBoard(rng, colors, tubes) {
  const balls = [];
  for (let c = 0; c < colors; c++) for (let k = 0; k < K; k++) balls.push(c);
  for (let i = balls.length - 1; i > 0; i--) { const j = randInt(rng, i + 1); const t = balls[i]; balls[i] = balls[j]; balls[j] = t; }
  const board = [];
  for (let t = 0; t < colors; t++) board.push(balls.slice(t * K, (t + 1) * K));
  for (let e = colors; e < tubes; e++) board.push([]);
  return board;
}

// Can this board be solved using AT MOST `maxRot` rotations? Exhausts the
// bounded-rotation reachable space (dedup on the fewest rotations seen per
// state, which dominates), so a `false` is a PROOF, not a budget miss.
//   true  = solvable within maxRot rotations
//   false = provably needs more than maxRot rotations
//   null  = node cap hit before the space was exhausted (treated as "unknown")
function solvableWithin(startBoard, maxRot, cap) {
  if (E.solved(startBoard)) return true;
  const best = new Map();               // stateKey -> fewest rotations used to reach it
  best.set(E.key(startBoard), 0);
  const stack = [[startBoard, 0, false]]; // board, rotationsUsed, lastMoveWasRotate
  let nodes = 0;
  while (stack.length) {
    const [board, rot, lastRotate] = stack.pop();
    if (++nodes > cap) return null;
    const moves = E.legalPours(board, K, { prune: true });
    if (rot < maxRot && !lastRotate) moves.push({ type: 'rotate' });
    for (const mv of moves) {
      const isRot = mv.type === 'rotate';
      const nb = E.applyMove(board, mv, K);
      if (!nb) continue;
      if (E.solved(nb)) return true;
      const nrot = rot + (isRot ? 1 : 0);
      const k = E.key(nb);
      const prev = best.get(k);
      if (prev !== undefined && prev <= nrot) continue;
      best.set(k, nrot);
      stack.push([nb, nrot, isRot]);
    }
  }
  return false;
}

function generateTier(tier, seedBase) {
  const puzzles = [];
  let tries = 0;
  const t0 = Date.now();
  const maxTries = COUNT * 400;
  while (puzzles.length < COUNT && tries < maxTries) {
    const rng = mulberry32((seedBase ^ Math.imul(tries + 1, 2654435761)) >>> 0);
    tries++;
    const board = dealBoard(rng, tier.colors, tier.tubes);
    if (E.solved(board)) continue;
    const res = S.solve(board, K, { weight: 2, nodeCap: 250000 });
    if (!res) continue;                                  // couldn't solve in budget
    if (res.length < tier.minPar || res.length > tier.maxPar) continue;
    // Provably requires ≥ minRot rotations: unsolvable with (minRot - 1).
    const within = solvableWithin(board, tier.minRot - 1, 1500000);
    if (within !== false) continue;                      // solvable with fewer (or unknown) → reject
    puzzles.push({ tubes: board, par: res.length });
    if (puzzles.length % 25 === 0) process.stdout.write(`  ${tier.key}: ${puzzles.length}/${COUNT} (tries=${tries})\n`);
  }
  const pars = puzzles.map(p => p.par).sort((a, b) => a - b);
  const med = pars.length ? pars[pars.length >> 1] : 0;
  console.log(`  ${tier.key}: ${puzzles.length} boards in ${((Date.now() - t0) / 1000).toFixed(1)}s from ${tries} tries — par min=${pars[0]} median=${med} max=${pars[pars.length - 1]} (colors=${tier.colors}, tubes=${tier.tubes}, minRot=${tier.minRot})`);
  return {
    colors: tier.colors, tubes: tier.tubes, cols: tier.tubes / 2,
    minRot: tier.minRot, puzzles,
  };
}

const seed0 = 0x9e3779b9;
const out = { version: 2, capacity: K, tiers: {} };
console.log(`Generating ${COUNT} boards per tier (hard minRot=${MIN_ROT_HARD})…`);
for (const tier of TIERS) {
  out.tiers[tier.key] = generateTier(tier, (seed0 ^ Math.imul(tier.colors * 2654435761, 40503)) >>> 0);
}

writeFileSync('puzzles.json', JSON.stringify(out));
const counts = TIERS.map(t => `${t.key}=${out.tiers[t.key].puzzles.length}`).join(' ');
console.log(`\nwrote puzzles.json  (${counts})`);
