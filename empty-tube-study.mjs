/* Tumbler — design study: what changes if every daily starts with ONE fully
 * empty tumbler (i.e. the other 8 start completely full), laid out as two
 * rows of 4 + the empty one centred to the right?
 *
 *   node empty-tube-study.mjs [samples]
 *
 * Compares the CURRENT regime (reverse-scramble spreads the 4 slack slots
 * across the rack — 92% of the shipped pool starts with zero empty tubes)
 * against the PROPOSED regime (uniform deal of 32 beads into 8 full tubes +
 * 1 empty). Written up in empty-tube-study.md.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const E = require('./engine.js');
const S = require('./solver.js');

const NCOLORS = 8, K = 4, SCRAMBLE = 52;
const N = +(process.argv[2] || 120);

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

/* ── current pipeline (mirrors generate.mjs) ─────────────────────── */
function solvedBoard(rng) {
  const tubes = [];
  for (let c = 0; c < NCOLORS; c++) tubes.push(Array(K).fill(c));
  tubes.push([]);
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
      if (!(k < r || ts.length === r)) continue;
      for (let d = 0; d < board.length; d++) {
        if (d === s) continue;
        const td = board[d];
        if (td.length > 0 && td[td.length - 1] === c) continue;
        if (K - td.length < k) continue;
        opts.push({ s, d, k });
      }
    }
  }
  return opts;
}
function scramble(rng) {
  let board = solvedBoard(rng);
  let lastRotate = false, moves = 0, guard = 0;
  while (moves < SCRAMBLE && guard < SCRAMBLE * 40) {
    guard++;
    if (!lastRotate && rng() < 0.16) { board = E.rotate(board); lastRotate = true; moves++; continue; }
    const opts = reversePourOptions(board);
    if (opts.length === 0) { lastRotate = false; continue; }
    const mixers = opts.filter(o => board[o.d].length > 0);
    const o = (mixers.length && rng() < 0.7) ? choice(rng, mixers) : choice(rng, opts);
    const moved = board[o.s].splice(board[o.s].length - o.k, o.k);
    for (const b of moved) board[o.d].push(b);
    lastRotate = false; moves++;
  }
  return board;
}

/* ── proposed pipeline: uniform deal, 8 full tubes + 1 empty ─────── */
function randomFullBoard(rng) {
  const balls = [];
  for (let c = 0; c < NCOLORS; c++) for (let k = 0; k < K; k++) balls.push(c);
  for (let i = balls.length - 1; i > 0; i--) { const j = randInt(rng, i + 1); const t = balls[i]; balls[i] = balls[j]; balls[j] = t; }
  const tubes = [];
  for (let t = 0; t < NCOLORS; t++) tubes.push(balls.slice(t * K, (t + 1) * K));
  tubes.push([]);
  return tubes;
}

/* Classic water sort = this game WITHOUT rotate. Exhaustive BFS, so a -1 is a
 * proof of unsolvability, not a budget miss. */
function solveNoRotate(startBoard, cap) {
  if (E.solved(startBoard)) return 0;
  const seen = new Set([E.key(startBoard)]);
  const q = [[startBoard, 0]];
  let nodes = 0;
  while (q.length) {
    const [board, g] = q.shift();
    if (++nodes > cap) return null;
    for (const mv of E.legalPours(board, K, { prune: true })) {
      const nb = E.applyMove(board, mv, K);
      const nk = E.key(nb);
      if (seen.has(nk)) continue;
      seen.add(nk);
      if (E.solved(nb)) return g + 1;
      q.push([nb, g + 1]);
    }
  }
  return -1;
}

/* Uniformly random legal play, capped — a proxy for how forgiving a board is
 * to aimless play. */
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

function study(name, gen) {
  const w2Pars = [], optRows = [], branch = [];
  let noRotSolvable = 0, noRotUnsolvable = 0, noRotUnknown = 0;
  let rotUsed = 0, rotTotal = 0, unsolvable = 0;
  let playoutWins = 0, playoutTotal = 0;
  let i = 0, made = 0;
  while (made < N) {
    const rng = mulberry32((0x9e3779b9 ^ Math.imul(++i, 2654435761)) >>> 0);
    const board = gen(rng);
    if (!board || E.solved(board)) continue;
    if (name.startsWith('CURRENT') || board.some(t => t.length === 0)) made++; else continue;
    const w2 = S.solve(board, K, { weight: 2, nodeCap: 250000 });
    if (!w2) { unsolvable++; continue; }
    w2Pars.push(w2.length);
    rotTotal += w2.moves.filter(m => m.type === 'rotate').length;
    if (w2.moves.some(m => m.type === 'rotate')) rotUsed++;
    branch.push(E.legalPours(board, K, { prune: true }).length + 1);
    const nr = solveNoRotate(board, 600000);
    if (nr === -1) noRotUnsolvable++; else if (nr === null) noRotUnknown++; else noRotSolvable++;
    if (optRows.length < 40) {
      const w1 = S.solve(board, K, { weight: 1, nodeCap: 2000000 });
      if (w1) optRows.push({ opt: w1.length, w2: w2.length });
    }
    for (let p = 0; p < 30; p++) {
      playoutTotal++;
      if (randomPlayout(board, mulberry32((made * 1000 + p) >>> 0), 300) != null) playoutWins++;
    }
  }
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
  const pars = w2Pars.slice().sort((a, b) => a - b);
  const q = p => pars[Math.min(pars.length - 1, Math.floor(p * pars.length))];
  console.log('\n== ' + name + ' ==  (n=' + pars.length + ', unsolvable within cap: ' + unsolvable + ')');
  console.log('  W=2 par min/p25/med/p75/max: ' + pars[0] + '/' + q(.25) + '/' + q(.5) + '/' + q(.75) + '/' + pars[pars.length - 1] + '  mean ' + mean(pars).toFixed(1));
  console.log('  optimal par mean: ' + mean(optRows.map(o => o.opt)).toFixed(1) + '  (n=' + optRows.length + ', W=2 overshoot +' + mean(optRows.map(o => o.w2 - o.opt)).toFixed(1) + ')');
  console.log('  lands in the 28-40 par window: ' + (100 * pars.filter(p => p >= 28 && p <= 40).length / pars.length).toFixed(1) + '%');
  console.log('  provably unsolvable WITHOUT rotate: ' + (100 * noRotUnsolvable / (noRotSolvable + noRotUnsolvable + noRotUnknown)).toFixed(1) + '%  (budget-exceeded: ' + noRotUnknown + ')');
  console.log('  solutions using >=1 rotate: ' + (100 * rotUsed / pars.length).toFixed(1) + '%  mean rotates ' + (rotTotal / pars.length).toFixed(2));
  console.log('  opening options (useful pours + rotate): mean ' + mean(branch).toFixed(1));
  console.log('  random playouts solved within 300 moves: ' + (100 * playoutWins / playoutTotal).toFixed(1) + '%');
}

console.log('samples per regime: ' + N);
study('CURRENT: reverse-scramble, slack spread anywhere', scramble);
study('PROPOSED: 8 full tubes + 1 empty tube (uniform deal)', randomFullBoard);
