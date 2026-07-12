/* Tumbler — rotation-requirement study for the three shipped tiers.
 *
 *   node rotation-study.mjs [boardsPerTier]
 *
 * For each tier's uniform one-empty deal, classify the MINIMUM number of
 * rotations any solution needs (0, 1, or ≥2) by exhausting the bounded-rotation
 * search space (a `false` from solvableWithin is a proof, not a budget miss),
 * and report how par + forgiveness shift if only the ≥2-rotation boards are
 * kept. Backs the "keep only boards that require ≥2 rotations?" section of
 * empty-tube-study.md.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const E = require('./engine.js');
const S = require('./solver.js');

const K = 4;
const N = +(process.argv[2] || 200);
const TIERS = [
  { name: 'easy 5+1 (2×3)',  colors: 5, tubes: 6 },
  { name: 'medium 7+1 (2×4)', colors: 7, tubes: 8 },
  { name: 'hard 9+1 (2×5)',   colors: 9, tubes: 10 },
];

function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const randInt = (rng, n) => Math.floor(rng() * n);
const choice = (rng, arr) => arr[randInt(rng, arr.length)];

function dealBoard(rng, colors, tubes) {
  const balls = [];
  for (let c = 0; c < colors; c++) for (let k = 0; k < K; k++) balls.push(c);
  for (let i = balls.length - 1; i > 0; i--) { const j = randInt(rng, i + 1); const t = balls[i]; balls[i] = balls[j]; balls[j] = t; }
  const board = [];
  for (let t = 0; t < colors; t++) board.push(balls.slice(t * K, (t + 1) * K));
  for (let e = colors; e < tubes; e++) board.push([]);
  return board;
}

// Solvable using at most `maxRot` rotations? true / false (proof) / null (cap).
function solvableWithin(startBoard, maxRot, cap) {
  if (E.solved(startBoard)) return true;
  const best = new Map([[E.key(startBoard), 0]]);
  const stack = [[startBoard, 0, false]];
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

function randomPlayout(board0, rng, cap) {
  let board = board0, lastRotate = false;
  for (let m = 0; m < cap; m++) {
    if (E.solved(board)) return m;
    const moves = E.legalPours(board, K, { prune: true });
    if (!lastRotate) moves.push({ type: 'rotate' });
    if (!moves.length) return null;
    const mv = choice(rng, moves);
    board = E.applyMove(board, mv, K);
    lastRotate = mv.type === 'rotate';
  }
  return null;
}
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;

for (const tier of TIERS) {
  let n0 = 0, n1 = 0, n2 = 0, unknown = 0;
  const parAll = [], parKept = [], rateAll = [], rateKept = [];
  for (let i = 0; i < N; i++) {
    const rng = mulberry32((0x7f4a7c15 ^ Math.imul(i + 1, 2654435761) ^ tier.colors * 97) >>> 0);
    const board = dealBoard(rng, tier.colors, tier.tubes);
    if (E.solved(board)) { i--; continue; }
    const full = S.solve(board, K, { weight: 2, nodeCap: 250000 });
    if (!full) continue;
    let wins = 0; const P = 30;
    for (let p = 0; p < P; p++) if (randomPlayout(board, mulberry32((i * 7919 + p) >>> 0), 300) != null) wins++;
    parAll.push(full.length); rateAll.push(wins / P);
    const r0 = solvableWithin(board, 0, 1500000);
    let cls;
    if (r0 === null) cls = 'unknown';
    else if (r0 === true) cls = 0;
    else { const r1 = solvableWithin(board, 1, 1500000); cls = r1 === null ? 'unknown' : (r1 === true ? 1 : 2); }
    if (cls === 0) n0++; else if (cls === 1) n1++; else if (cls === 2) { n2++; parKept.push(full.length); rateKept.push(wins / P); }
    else unknown++;
  }
  const tot = n0 + n1 + n2 + unknown;
  console.log(`\n== ${tier.name} ==  (${tot} solvable deals)`);
  console.log(`  min rotations: 0 → ${(100*n0/tot).toFixed(1)}%   1 → ${(100*n1/tot).toFixed(1)}%   ≥2 → ${(100*n2/tot).toFixed(1)}%   (unknown ${unknown})`);
  console.log(`  ALL deals : par ${mean(parAll).toFixed(1)}  forgiveness ${(100*mean(rateAll)).toFixed(1)}%`);
  if (parKept.length)
    console.log(`  KEPT ≥2   : par ${mean(parKept).toFixed(1)}  forgiveness ${(100*mean(rateKept)).toFixed(1)}%  (acceptance ${(100*n2/tot).toFixed(1)}%)`);
}
