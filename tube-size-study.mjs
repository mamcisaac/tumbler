/* Tumbler — design study: does beads-per-colour (tube height K) make a good
 * difficulty dial, and what does 3 vs 4 vs 5 do?
 *
 *   node tube-size-study.mjs [samplesPerCell] [nodeCap]
 *
 * K is the tube capacity = how many beads each colour has = how tall every
 * stack is. It's ORTHOGONAL to colour count: a board with C colours and height
 * K has C full tubes of K beads + 1 empty tube (C+1 tubes, C·K beads). Changing
 * K never changes which glyphs appear — a colour just repeats K times — so it
 * composes freely with the existing bead/glyph set.
 *
 * For each (colours C, height K) cell we deal solvable boards the generator's
 * way and measure:
 *   par        mean shortest solution length (A*)  — the core difficulty read
 *   safe%      mean fraction of legal opening moves that keep it solvable
 *   trap%      fraction of boards where a wrong first move can dead-end you
 *   rot/sol    mean rotations inside the shortest solution — how load-bearing
 *              the signature Rotate mechanic is (deeper stacks → digging → more)
 *   dealOK%    fraction of random deals that are solvable at all (generator yield)
 *
 * Sweeps the three shipped tier colour counts (6/7/8) against K ∈ {3,4,5}.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const E = require('./engine.js');
const S = require('./solver.js');

const N = +(process.argv[2] || 120);
const CAP = +(process.argv[3] || 120000);
const COLORS = [6, 7, 8];
const HEIGHTS = [3, 4, 5];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Uniform deal at height K: shuffle C·K beads into C full tubes of K, append
// one empty tube last. tubes = C + 1.
function dealBoard(rng, colors, K) {
  const balls = [];
  for (let c = 0; c < colors; c++) for (let k = 0; k < K; k++) balls.push(c);
  for (let i = balls.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = balls[i]; balls[i] = balls[j]; balls[j] = t; }
  const board = [];
  for (let t = 0; t < colors; t++) board.push(balls.slice(t * K, (t + 1) * K));
  board.push([]);
  return board;
}
function solveOf(board, K) { return S.solve(board, K, { weight: 2, nodeCap: CAP }); }
function openingMoves(board, K) {
  const mvs = E.legalPours(board, K).map((m) => ({ kind: 'pour', m }));
  mvs.push({ kind: 'rotate' });
  return mvs;
}
function applyOpening(board, mv, K) {
  if (mv.kind === 'rotate') return E.rotate(board);
  return E.applyMove(board, mv.m, K);
}

function studyCell(colors, K, seedBase) {
  const rng = mulberry32(seedBase);
  let kept = 0, deals = 0, dealSolvable = 0, boardsWithTrap = 0;
  let sumSafeFrac = 0, sumPar = 0, sumRot = 0;
  while (kept < N && deals < N * 80) {
    deals++;
    const board = dealBoard(rng, colors, K);
    if (E.solved(board)) continue;
    const sol = solveOf(board, K);
    if (!sol) continue;            // unsolvable deal — not shippable
    dealSolvable++;
    kept++;
    // rotations inside the shortest solution (solver returns .moves)
    const rot = (sol.moves || []).filter((m) => m && m.type === 'rotate').length;
    const opens = openingMoves(board, K);
    let safe = 0;
    for (const mv of opens) {
      const nb = applyOpening(board, mv, K);
      if (!nb) continue;
      if (E.solved(nb) || solveOf(nb, K) != null) safe++;
    }
    const traps = opens.length - safe;
    if (traps > 0) boardsWithTrap++;
    sumSafeFrac += safe / opens.length; sumPar += sol.length; sumRot += rot;
  }
  return {
    colors, K, tubes: colors + 1, beads: colors * K, kept,
    dealOKpct: 100 * dealSolvable / deals,
    safePct: 100 * sumSafeFrac / kept,
    trapPct: 100 * boardsWithTrap / kept,
    par: sumPar / kept,
    rotPerSol: sumRot / kept,
  };
}

console.log(`Tumbler tube-height study — ${N} solvable boards/cell, A* cap ${CAP}\n`);
console.log('colours  height  tubes  beads   par   safe%   trap%   rot/sol   dealOK%');
console.log('-------  ------  -----  -----  -----  -----   -----   -------   -------');
for (const C of COLORS) {
  for (const K of HEIGHTS) {
    const r = studyCell(C, K, (0x51ce00 ^ (C * 7919) ^ (K * 104729)) >>> 0);
    console.log(
      String(r.colors).padStart(5) + '   ' +
      String(r.K).padStart(5) + '   ' +
      String(r.tubes).padStart(5) + '  ' +
      String(r.beads).padStart(5) + '  ' +
      r.par.toFixed(1).padStart(5) + '  ' +
      (r.safePct.toFixed(1) + '%').padStart(6) + '  ' +
      (r.trapPct.toFixed(1) + '%').padStart(6) + '  ' +
      r.rotPerSol.toFixed(2).padStart(7) + '   ' +
      (r.dealOKpct.toFixed(1) + '%').padStart(7)
    );
  }
  console.log('');
}
console.log('Shipped today: all tiers height K=4 (easy 6c / medium 7c / hard 8c).');
