/* Tumbler — design study: how forgiving is each colour count?
 *
 *   node opening-move-study.mjs [samplesPerColor] [nodeCap]
 *
 * For each colour count C (one empty tube, K=4, tubes = C+1) we deal solvable
 * boards the same way the generator does, then at the STARTING position count
 * how many of the legal opening actions (every legal pour + Rotate) leave the
 * puzzle still solvable — i.e. "lead to success" — vs. dead-end it.
 *
 *   safe%  = mean fraction of opening moves that keep the puzzle solvable
 *   traps  = mean number of opening moves that dead-end the puzzle
 *   par    = mean shortest solution length (A*), a second difficulty read
 *
 * A high safe% + low par = forgiving/easy; a low safe% + high par = punishing.
 * Lets us compare the shipped 5 / 7 / 9 tiers against a proposed 6 / 7 / 8.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const E = require('./engine.js');
const S = require('./solver.js');

const K = 4;
const N = +(process.argv[2] || 200);
const CAP = +(process.argv[3] || 60000);
const COLORS = [5, 6, 7, 8, 9];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Uniform deal (mirrors generate.mjs): shuffle 4·C beads into C full tubes,
// append one empty tube last. tubes = C + 1.
function dealBoard(rng, colors) {
  const tubes = colors + 1;
  const balls = [];
  for (let c = 0; c < colors; c++) for (let k = 0; k < K; k++) balls.push(c);
  for (let i = balls.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = balls[i]; balls[i] = balls[j]; balls[j] = t; }
  const board = [];
  for (let t = 0; t < colors; t++) board.push(balls.slice(t * K, (t + 1) * K));
  for (let e = colors; e < tubes; e++) board.push([]);
  return board;
}
// Solvable within the A* node cap? (returns the solution length, or null)
function parOf(board) {
  const r = S.solve(board, K, { weight: 2, nodeCap: CAP });
  return r ? r.length : null;
}
// Every legal opening action from the start: legal pours + Rotate.
function openingMoves(board) {
  const mvs = E.legalPours(board, K).map((m) => ({ kind: 'pour', m }));
  mvs.push({ kind: 'rotate' });
  return mvs;
}
function applyOpening(board, mv) {
  if (mv.kind === 'rotate') return E.rotate(board);
  return E.applyMove(board, mv.m, K);
}

function studyColor(colors, seedBase) {
  const rng = mulberry32(seedBase);
  let kept = 0, deals = 0, boardsWithTrap = 0;
  let sumOpen = 0, sumSafe = 0, sumSafeFrac = 0, sumPar = 0, sumTraps = 0;
  const safeFracs = [];
  while (kept < N && deals < N * 60) {
    deals++;
    const board = dealBoard(rng, colors);
    if (E.solved(board)) continue;
    const par = parOf(board);
    if (par == null) continue; // unsolvable deal — not a shippable puzzle
    kept++;
    const opens = openingMoves(board);
    let safe = 0;
    for (const mv of opens) {
      const nb = applyOpening(board, mv);
      if (E.solved(nb) || parOf(nb) != null) safe++;
    }
    const frac = safe / opens.length;
    const traps = opens.length - safe;
    if (traps > 0) boardsWithTrap++;
    sumOpen += opens.length; sumSafe += safe; sumSafeFrac += frac; sumPar += par; sumTraps += traps;
    safeFracs.push(frac);
  }
  safeFracs.sort((a, b) => a - b);
  const med = safeFracs.length ? safeFracs[Math.floor(safeFracs.length / 2)] : 0;
  return {
    colors, tubes: colors + 1, kept,
    solvableDealRate: kept / deals,
    meanOpenings: sumOpen / kept,
    meanSafe: sumSafe / kept,
    meanTraps: sumTraps / kept,
    pctBoardsWithTrap: 100 * boardsWithTrap / kept,   // can a wrong first move dead-end you?
    meanSafePct: 100 * sumSafeFrac / kept,
    medianSafePct: 100 * med,
    meanPar: sumPar / kept,
  };
}

console.log(`Tumbler opening-move forgiveness — ${N} solvable puzzles/colour, A* cap ${CAP}\n`);
console.log('colours  tubes  openings  safe%  boardsWithTrap  meanTraps    par');
console.log('-------  -----  --------  -----  --------------  ---------  -----');
const rows = COLORS.map((c, i) => studyColor(c, 0x51ce00 + c * 7919));
for (const r of rows) {
  console.log(
    String(r.colors).padStart(5) + '   ' +
    String(r.tubes).padStart(5) + '  ' +
    r.meanOpenings.toFixed(1).padStart(7) + '  ' +
    r.meanSafePct.toFixed(1).padStart(4) + '%  ' +
    (r.pctBoardsWithTrap.toFixed(1) + '%').padStart(13) + '  ' +
    r.meanTraps.toFixed(2).padStart(8) + '  ' +
    r.meanPar.toFixed(1).padStart(5)
  );
}
console.log('\nCurrent tiers  easy=5  medium=7  hard=9');
console.log('Proposed tiers easy=6  medium=7  hard=8');
