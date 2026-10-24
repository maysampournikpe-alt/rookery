import { Chess } from '../../vendor/chess.js';
import { D, START_FEN, nodeAt, nameFor, dbStatsAt, familyOf, slug, epdOf } from '../data.js';
import { Board } from '../board.js';
import { h, moveText, toast, plural } from '../ui.js';

function shortestName(node) {
  if (node.lines.length) return node.lines[0];
  let q = [node];
  let seen = 0;
  while (q.length && seen < 400) {
    const next = [];
    for (const n of q) {
      seen++;
      if (n.lines.length) return n.lines[0];
      next.push(...n.kids.values());
    }
    q = next;
  }
  return null;
}

const wdl = (n) => {
  const t = n.w + n.d + n.b || 1;
  const p = (x) => Math.round((x / t) * 100);
  return h('div', { class: 'wdl', title: `${n.w} white wins · ${n.d} draws · ${n.b} black wins` }, h('i', { class: 'w', style: `flex:${n.w}` }, p(n.w) >= 14 ? p(n.w) + '%' : ''), h('i', { class: 'd', style: `flex:${n.d}` }, p(n.d) >= 14 ? p(n.d) + '%' : ''), h('i', { class: 'b', style: `flex:${n.b}` }, p(n.b) >= 14 ? p(n.b) + '%' : ''));
};

export function render(root, { query }) {
  const game = new Chess();
  let san = [];
  let last = null;
  const board = new Board(h('div'), {
    canMove: (sq) => game.get(sq)?.color === game.turn(),
    getTargets: (sq) => game.moves({ square: sq, verbose: true }).map((m) => m.to),
    onMove: async (f, t) => {
      const p = game.get(f);
      let promotion;
      if (p?.type === 'p' && (t[1] === '8' || t[1] === '1')) promotion = await board.askPromotion(p.color, t);
      try {
        play(game.move({ from: f, to: t, promotion }).san, true);
      } catch {
        board.setFen(game.fen(), { last });
      }
    },
  });

  const now = h('div', { class: 'now' });
  const table = h('div', { class: 'panel' });
  const moves = h('div', { class: 'panel movetext' });
  const info = h('div', {});

  function play(m, fromGame = false) {
    if (!fromGame) game.move(m);
    san.push(m);
    refresh(true);
  }

  function setPath(path) {
    game.reset();
    san = [];
    for (const m of path) {
      try {
        game.move(m);
        san.push(m);
      } catch {
        break;
      }
    }
    refresh(false);
  }

  function refresh(animate) {
    const hist = game.history({ verbose: true });
    const lm = hist.at(-1);
    last = lm ? [lm.from, lm.to] : null;
    board.setFen(game.fen(), { last, animate });
    history.replaceState(null, '', `#/explorer${san.length ? '?m=' + encodeURIComponent(san.join(' ')) : ''}`);
    const nm = san.length ? nameFor(san, game.fen()) : null;
    now.replaceChildren(
      h('b', {}, nm ? nm.line.name : 'Starting position'),
      h('span', {}, nm ? `${nm.line.eco || 'Custom'}${nm.transposed ? ' · by transposition' : !nm.exact ? ` · last named at move ${Math.ceil(nm.ply / 2)}` : ''}` : 'Play any move, or pick a continuation'),
      nm && h('a', { class: 'btn sm', style: 'margin-top:8px;align-self:flex-start', href: `#/opening/${slug(nm.line.fam)}?line=${nm.line.id}` }, `Open ${nm.line.fam}`),
    );
    moves.replaceChildren(
      ...san
        .flatMap((m, i) => [i % 2 === 0 ? h('span', { class: 'no' }, `${i / 2 + 1}.`) : null, h('span', { class: 'mv' + (i + 1 === san.length ? ' cur' : ''), onclick: () => setPath(san.slice(0, i + 1)) }, m)])
        .filter(Boolean),
      san.length ? null : h('span', { style: 'color:var(--muted)' }, 'No moves yet'),
    );
    drawTable();
  }

  function drawTable() {
    let node = nodeAt(san);
    let via = null;
    if (!node) {
      const hit = D.epd.get(epdOf(game.fen()));
      if (hit?.length) {
        node = nodeAt(hit[0].san);
        via = hit[0];
      }
    }
    const rows = new Map(); // san -> {kids, line, db}
    if (node) for (const [m, k] of node.kids) rows.set(m, { m, node: k, line: shortestName(k), n: k.n });
    const dbs = dbStatsAt(san);
    for (const { db, node: dn } of dbs) for (const [m, k] of Object.entries(dn.c || {})) (rows.get(m) || rows.set(m, { m }).get(m))[`db:${db.name}`] = k;
    const list = [...rows.values()].sort((a, b) => dbTotal(b) - dbTotal(a) || (b.n || 0) - (a.n || 0));
    const ply = san.length;
    const prefix = (m) => (ply % 2 === 0 ? `${ply / 2 + 1}.` : `${(ply + 1) / 2}…`) + m;

    const head = h('tr', {}, h('th', {}, 'Move'), h('th', {}, 'Leads to'), h('th', {}, 'Lines'), ...dbs.map(({ db }) => h('th', {}, db.name)));
    table.replaceChildren(
      via && h('p', { style: 'margin:0 0 10px;color:var(--muted)' }, `This position is also reached in ${via.name}. Showing its continuations.`),
      list.length
        ? h(
            'table',
            { class: 'cont' },
            h('thead', {}, head),
            h(
              'tbody',
              {},
              list.map((r) =>
                h(
                  'tr',
                  { class: 'row', tabindex: 0, onclick: () => tryMove(r.m), onkeydown: (e) => e.key === 'Enter' && tryMove(r.m) },
                  h('td', { class: 'san' }, prefix(r.m)),
                  h('td', {}, r.line ? h('div', {}, r.line.name, h('div', { class: 'sub' }, r.line.eco)) : h('span', { class: 'sub' }, '—')),
                  h('td', {}, r.n ? String(r.n) : '—'),
                  ...dbs.map(({ db }) => {
                    const k = r[`db:${db.name}`];
                    return h('td', {}, k ? h('div', {}, h('div', { class: 'sub' }, plural(k.n, 'game')), wdl(k)) : '');
                  }),
                ),
              ),
            ),
          )
        : h('p', { style: 'margin:0;color:var(--muted)' }, node ? 'End of the named lines. Keep playing freely.' : 'Out of book: no named opening continues from this position.'),
    );
  }
  const dbTotal = (r) => Object.entries(r).reduce((a, [k, v]) => a + (k.startsWith('db:') ? v.n : 0), 0);

  function tryMove(m) {
    try {
      play(game.move(m).san, true);
    } catch {
      toast('That move is not legal here');
    }
  }

  const undo = () => {
    if (!san.length) return;
    setPath(san.slice(0, -1));
  };
  const onKey = (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowLeft') undo();
  };
  window.addEventListener('keydown', onKey);

  const copy = (t, label) => navigator.clipboard?.writeText(t).then(() => toast(label + ' copied'), () => toast('Copy failed'));
  const left = h(
    'div',
    { class: 'left' },
    board.el,
    now,
    h(
      'div',
      { class: 'nav-row' },
      h('button', { class: 'btn sm', onclick: undo, title: 'Undo (←)' }, '◀ Undo'),
      h('button', { class: 'btn sm', onclick: () => setPath([]) }, 'Reset'),
      h('button', { class: 'btn sm', onclick: () => board.flip() }, 'Flip'),
      h('button', { class: 'btn sm', onclick: () => copy(moveText(san), 'PGN') }, 'Copy PGN'),
      h('button', { class: 'btn sm', onclick: () => copy(game.fen(), 'FEN') }, 'Copy FEN'),
    ),
    h('div', { style: 'margin-top:14px' }, moves),
  );
  const right = h(
    'div',
    {},
    h('p', { class: 'crumb' }, 'Explorer'),
    h('h1', { class: 'title' }, 'Position explorer'),
    h('p', { class: 'blurb' }, `Play moves on the board or click a continuation. Every position is matched against ${D.lines.length.toLocaleString()} named lines, including transpositions${D.databases.length ? ` and ${plural(D.databases.length, 'game database')}` : ''}. Import PGN databases to see win rates.`),
    table,
  );
  root.replaceChildren(h('div', { class: 'split' }, left, right));
  const m = query.get('m');
  setPath(m ? m.split(' ') : []);
  return () => window.removeEventListener('keydown', onKey);
}
