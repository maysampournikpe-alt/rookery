// Plain-language commentary for a move, written from the actual position (what it attacks, whether it
// develops a piece, castles, gives check...). It states facts and simple ideas; it is not engine analysis.
import { Chess } from '../vendor/chess.js';

const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 99 };
const FILES = 'abcdefgh';
const CENTER = new Set(['d4', 'e4', 'd5', 'e5']);
const HOME = { n: { w: ['b1', 'g1'], b: ['b8', 'g8'] }, b: { w: ['c1', 'f1'], b: ['c8', 'f8'] } };

// squares a piece on `sq` attacks, by geometry (stops at the first piece it meets)
function attacks(board, sq, piece, color) {
  const f = FILES.indexOf(sq[0]);
  const r = 8 - +sq[1];
  const out = [];
  const at = (ff, rr) => (ff >= 0 && ff < 8 && rr >= 0 && rr < 8 ? FILES[ff] + (8 - rr) : null);
  const ray = (df, dr) => {
    for (let k = 1; k < 8; k++) {
      const s = at(f + df * k, r + dr * k);
      if (!s) break;
      out.push(s);
      if (board[r + dr * k][f + df * k]) break;
    }
  };
  if (piece === 'n') for (const [df, dr] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) { const s = at(f + df, r + dr); if (s) out.push(s); }
  else if (piece === 'k') for (const df of [-1, 0, 1]) for (const dr of [-1, 0, 1]) { if (df || dr) { const s = at(f + df, r + dr); if (s) out.push(s); } }
  else if (piece === 'p') for (const df of [-1, 1]) { const s = at(f + df, r + (color === 'w' ? -1 : 1)); if (s) out.push(s); }
  else {
    if (piece !== 'r') for (const [df, dr] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) ray(df, dr);
    if (piece !== 'b') for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ray(df, dr);
  }
  return out;
}

function who(color, mine) {
  const side = color === 'w' ? 'White' : 'Black';
  return mine ? { S: 'We', poss: 'our', s: '', side } : { S: side, poss: 'their', s: 's', side };
}

// returns { instr: "Play bishop to e3.", text: (mine) => "We develop our bishop ...", piece, from, to }
export function describeMove(fenBefore, san) {
  const g = new Chess(fenBefore);
  const mv = g.move(san);
  const board = g.board();
  const piece = mv.piece;
  const color = mv.color;
  const to = mv.to;
  const enemy = color === 'w' ? 'b' : 'w';
  const pieceAt = (sq) => {
    const f = FILES.indexOf(sq[0]);
    const r = 8 - +sq[1];
    return board[r][f];
  };
  const att = attacks(board, to, piece, color);
  const targets = att.map((s) => ({ s, p: pieceAt(s) })).filter((x) => x.p && x.p.color === enemy && x.p.type !== 'k');
  targets.sort((a, b) => VAL[b.p.type] - VAL[a.p.type]);
  const hitsCenter = att.some((s) => CENTER.has(s)) || CENTER.has(to);
  const castle = mv.flags.includes('k') ? 'kingside' : mv.flags.includes('q') ? 'queenside' : null;
  const check = mv.san.endsWith('+');
  const mate = mv.san.endsWith('#');

  let instr;
  if (castle) instr = `Castle ${castle}.`;
  else if (mv.captured) instr = piece === 'p' ? `Play pawn takes on ${to}.` : `Play ${NAME[piece]} takes on ${to}.`;
  else instr = `Play ${NAME[piece]} to ${to}.`;
  if (mv.promotion) instr = `Play pawn to ${to} and promote to a ${NAME[mv.promotion]}.`;

  const text = (mine) => {
    const w = who(color, mine);
    const P = w.poss;
    let t;
    const tail = () => {
      const t0 = targets[0];
      if (!t0) return hitsCenter ? ` and keep${w.s} an eye on the center` : '';
      const nm = NAME[t0.p.type];
      if (t0.p.type === 'p' && (t0.s === 'f7' || t0.s === 'f2')) return `, eyeing the weak pawn on ${t0.s}`;
      return `, attacking the ${nm} on ${t0.s}`;
    };
    if (castle) t = `${w.S} castle${w.s} ${castle} to tuck ${P} king away safely and bring ${P} rook into the game`;
    else if (mv.captured) t = `${w.S} take${w.s} the ${NAME[mv.captured]} on ${to}${piece === 'p' ? ' with a pawn' : ''}`;
    else if (piece === 'p') {
      const file = to[0];
      const rank = +to[1];
      const from = mv.from;
      if ((file === 'd' || file === 'e') && (rank === 4 || rank === 5) && (from[1] === '2' || from[1] === '7')) t = `${w.S} stake${w.s} a claim in the center with a pawn`;
      else if (file === 'c' && (rank === 4 || rank === 5)) t = `${w.S} fight${w.s} for the center from the side with the c-pawn`;
      else if ((file === 'e' || file === 'd') && (rank === 3 || rank === 6)) t = `${w.S} open${w.s} a path for ${P} bishop and give${w.s ? 's' : ''} ${P} queen room`;
      else if (file === 'g' || file === 'b') t = `${w.S} make${w.s} room for ${P} bishop to sit on the long diagonal`;
      else if (file === 'c' && (rank === 3 || rank === 6)) t = `${w.S} support${w.s} a later central pawn push`;
      else if (file === 'f') t = `${w.S} push${w.s === 's' ? 'es' : ''} the f-pawn to fight for the center and open the f-file`;
      else if (file === 'a' || file === 'h') t = `${w.S} gain${w.s} a little space on the edge of the board`;
      else t = `${w.S} advance${w.s} a pawn to gain space`;
      if (targets[0]) t += `, attacking the ${NAME[targets[0].p.type]} on ${targets[0].s}`;
    } else if (piece === 'k') t = `${w.S} step${w.s} ${P} king to ${to}`;
    else if (piece === 'r') {
      const f = FILES.indexOf(to[0]);
      const open = board.every((row) => !(row[f] && row[f].type === 'p'));
      t = `${w.S} bring${w.s} ${P} rook to ${to}${open ? ', taking the open ' + to[0] + '-file' : ''}`;
    } else if (piece === 'q') t = `${w.S} bring${w.s} ${P} queen out to ${to}${tail()}`;
    else {
      const developing = (HOME[piece]?.[color] || []).includes(mv.from);
      t = `${w.S} ${developing ? 'develop' : 'move'}${w.s} ${P} ${NAME[piece]} to ${to}${tail()}`;
    }
    t += '.';
    if (mate) t += ' That is checkmate!';
    else if (check) t += ' It gives check!';
    return t;
  };
  return { instr, text, piece, from: mv.from, to, san: mv.san, color };
}
