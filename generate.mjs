/* Tumbler — daily-puzzle generator (Node).
 *
 *   node generate.mjs [count] [colors] [empty] [scramble] [minPar] [maxPar]
 *
 * Method: start from a solved board, apply VALID reverse moves (each reverse step
 * corresponds to a real forward pour/rotate, so the result is always solvable),
 * then run the solver to get a strong par. Keep boards whose par lands in the
 * target window and whose solution genuinely uses at least one rotation.
 */
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const E = require('./engine.js');
const S = require('./solver.js');

const argv = process.argv.slice(2);
const COUNT     = +(argv[0] || 240);
const NCOLORS   = +(argv[1] || 8);
const K         = 4;
const NEMPTY    = +(argv[2] || 2);
const SCRAMBLE  = +(argv[3] || 52);
const MIN_PAR   = +(argv[4] || 28);
const MAX_PAR   = +(argv[5] || 40);

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

function solvedBoard(rng) {
  const tubes = [];
  for (let c = 0; c < NCOLORS; c++) tubes.push(Array(K).fill(c));
  for (let e = 0; e < NEMPTY; e++) tubes.push([]);
  // shuffle tube order
  for (let i = tubes.length - 1; i > 0; i--) { const j = randInt(rng, i + 1); const t = tubes[i]; tubes[i] = tubes[j]; tubes[j] = t; }
  return tubes;
}

function reversePourOptions(board) {
  const opts = [];
  for (let s = 0; s < board.length; s++) {
    const ts = board[s];
    if (ts.length === 0) continue;
    const c = ts[ts.length - 1];
    let r = 1; for (let i = ts.length - 2; i >= 0 && ts[i] === c; i--) r++;
    for (let k = 1; k <= r; k++) {
      if (!(k < r || ts.length === r)) continue;       // don't expose a different under-colour
      for (let d = 0; d < board.length; d++) {
        if (d === s) continue;
        const td = board[d];
        if (td.length > 0 && td[td.length - 1] === c) continue; // forward must move EXACTLY k
        if (K - td.length < k) continue;
        opts.push({ s: s, d: d, k: k, c: c });
      }
    }
  }
  return opts;
}

function scramble(rng) {
  let board = solvedBoard(rng);
  let lastRotate = false;
  let moves = 0, guard = 0;
  while (moves < SCRAMBLE && guard < SCRAMBLE * 40) {
    guard++;
    const doRotate = !lastRotate && rng() < 0.16;
    if (doRotate) { board = E.rotate(board); lastRotate = true; moves++; continue; }
    const opts = reversePourOptions(board);
    if (opts.length === 0) { lastRotate = false; continue; }
    // prefer options that land a colour onto a DIFFERENT colour (more disorder)
    const mixers = opts.filter(o => board[o.d].length > 0);
    const o = (mixers.length && rng() < 0.7) ? choice(rng, mixers) : choice(rng, opts);
    const moved = board[o.s].splice(board[o.s].length - o.k, o.k);
    for (const b of moved) board[o.d].push(b);   // moved are all colour c
    lastRotate = false; moves++;
  }
  return board;
}

function usesRotation(moves) { return moves.some(m => m.type === 'rotate'); }

const puzzles = [];
let tries = 0;
const seed0 = 0x9e3779b9;
const t0 = Date.now();
while (puzzles.length < COUNT && tries < COUNT * 60) {
  const rng = mulberry32((seed0 ^ Math.imul(tries + 1, 2654435761)) >>> 0);
  tries++;
  const board = scramble(rng);
  if (E.solved(board)) continue;
  const res = S.solve(board, K, { weight: 2, nodeCap: 250000 });
  if (!res) continue;                       // couldn't solve within budget -> skip
  if (res.length < MIN_PAR || res.length > MAX_PAR) continue;
  if (!usesRotation(res.moves)) continue;   // keep the rotation-flavoured ones
  puzzles.push({ tubes: board, capacity: K, colors: NCOLORS, par: res.length });
  if (puzzles.length % 20 === 0) process.stdout.write(`  ${puzzles.length}/${COUNT} (tries=${tries})\n`);
}

const pars = puzzles.map(p => p.par).sort((a, b) => a - b);
const med = pars.length ? pars[pars.length >> 1] : 0;
console.log(`\nGenerated ${puzzles.length} puzzles in ${((Date.now() - t0) / 1000).toFixed(1)}s from ${tries} tries.`);
console.log(`par: min=${pars[0]} median=${med} max=${pars[pars.length - 1]}  (colors=${NCOLORS}, empty=${NEMPTY}, cap=${K})`);

writeFileSync('puzzles.json', JSON.stringify({ version: 1, capacity: K, colors: NCOLORS, empty: NEMPTY, puzzles }));
console.log('wrote puzzles.json');
