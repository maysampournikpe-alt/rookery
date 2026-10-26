// Sanity check for trap chapters: plays each line of every "Traps" chapter, then searches the final position
// (alpha-beta on material, captures extended) and reports how many pawns the trapping side is ahead.
//   node scripts/check-trap.mjs [--min 2]
// A trap passes when the trapper is at least 2 pawns up (or has mated) after best play for a few moves.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from '../site/vendor/chess.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const mat = (c) => {
  let m = 0;
  for (const row of c.board()) for (const q of row) if (q) m += (q.color === 'w' ? 1 : -1) * V[q.type];
  return m;
};
const order = (c) => c.moves({ verbose: true }).sort((a, b) => (b.captured ? V[b.captured] * 10 - V[b.piece] : 0) - (a.captured ? V[a.captured] * 10 - V[a.piece] : 0));
function q(c, alpha, beta, ply) {
  if (c.isCheckmate()) return -100000 + ply;
  const stand = (c.turn() === 'w' ? 1 : -1) * mat(c);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (ply > 8) return alpha;
  for (const m of order(c)) {
    if (!m.captured && !m.promotion) continue;
    c.move(m);
    const s = -q(c, -beta, -alpha, ply + 1);
    c.undo();
    if (s >= beta) return beta;
    if (s > alpha) alpha = s;
  }
  return alpha;
}
function search(c, d, alpha, beta, ply) {
  if (c.isCheckmate()) return -100000 + ply;
  if (c.isDraw()) return 0;
  if (d === 0) return q(c, alpha, beta, ply);
  for (const m of order(c)) {
    c.move(m);
    const s = -search(c, d - 1, -beta, -alpha, ply + 1);
    c.undo();
    if (s >= beta) return beta;
    if (s > alpha) alpha = s;
  }
  return alpha;
}
// score from White's point of view
export const score = (c, depth = 3) => (c.turn() === 'w' ? 1 : -1) * search(c, depth, -1e6, 1e6, 0);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const min = Number(process.argv[process.argv.indexOf('--min') + 1]) || 2;
  const rows = readFileSync(join(root, 'data/lines/studies.tsv'), 'utf8').split('\n').slice(1).filter(Boolean);
  let bad = 0;
  for (const r of rows) {
    const [, name, pgn] = r.split('\t');
    const tag = /\[([wb])\]$/.exec(name);
    if (!tag) continue;
    const c = new Chess();
    c.loadPgn(pgn);
    const s = score(c, 3) / 100;
    const mine = tag[1] === 'w' ? s : -s;
    const flag = mine >= min || c.isCheckmate() ? 'ok  ' : 'WEAK';
    if (flag === 'WEAK') bad++;
    console.log(flag, mine.toFixed(1).padStart(5), name, '|', pgn.split(' ').slice(-5).join(' '));
  }
  console.log(bad ? `${bad} weak lines` : 'all trap lines pass');
}
