import { Chess } from '../../vendor/chess.js';
import { D, fenAfter, START_FEN } from '../data.js';
import { Board, drawMini } from '../board.js';
import { counts, streak, xp } from '../store.js';
import { h, plural, progressBar, debounce, moveText } from '../ui.js';

const F = { q: '', side: '', first: '', vol: '', sort: 'lines', shown: 36 };
const FIRSTS = [['e4', '1.e4'], ['d4', '1.d4'], ['c4', '1.c4'], ['Nf3', '1.Nf3'], ['other', 'Other']];

function matches(fam, q) {
  if (!q) return { ok: true };
  const ql = q.toLowerCase();
  if (fam.name.toLowerCase().includes(ql)) return { ok: true, hits: fam.lines.length };
  const moveQ = ql.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/).join(' ');
  const looksMoves = /^[a-hnbrqko][a-h1-8x=+#\-o]*( |$)/i.test(moveQ) && /\d|^[nbrqk]/i.test(moveQ);
  let hits = 0;
  for (const l of fam.lines) {
    if (l.name.toLowerCase().includes(ql) || l.eco.toLowerCase() === ql || (looksMoves && l.san.join(' ').toLowerCase().startsWith(moveQ))) hits++;
  }
  return { ok: hits > 0, hits };
}

function visible() {
  const out = [];
  for (const fam of D.families) {
    if (F.side && fam.side !== F.side) continue;
    if (F.first) {
      const known = ['e4', 'd4', 'c4', 'Nf3'];
      if (F.first === 'other' ? known.includes(fam.first) : fam.first !== F.first) continue;
    }
    if (F.vol && !fam.volumes.has(F.vol)) continue;
    const m = matches(fam, F.q.trim());
    if (!m.ok) continue;
    out.push({ fam, hits: m.hits });
  }
  const prog = (f) => counts(f.lines.map((l) => l.id));
  if (F.sort === 'az') out.sort((a, b) => a.fam.name.localeCompare(b.fam.name));
  else if (F.sort === 'progress') out.sort((a, b) => prog(b.fam).learned / b.fam.lines.length - prog(a.fam).learned / a.fam.lines.length);
  else if (F.sort === 'due') out.sort((a, b) => prog(b.fam).due - prog(a.fam).due);
  return out.sort((a, b) => Number(b.fam.mine) - Number(a.fam.mine));
}

function famCard(fam, hits) {
  const c = counts(fam.lines.map((l) => l.id));
  const canvas = h('canvas', { 'aria-hidden': 'true' });
  const fen = fenAfter(fam.root.san);
  requestAnimationFrame(() => drawMini(canvas, fen, fam.side));
  const blurb = fam.blurb || `${plural(fam.lines.length, 'named line')}, starting ${moveText(fam.root.san)}.`;
  return h(
    'a',
    { class: 'card', href: `#/opening/${fam.slug}` },
    canvas,
    h(
      'div',
      {},
      h('h3', {}, fam.name),
      h('p', {}, blurb),
      h(
        'div',
        { class: 'meta' },
        h('span', { class: 'tag ' + (fam.side === 'white' ? 'w' : 'b') }, fam.side === 'white' ? 'White' : 'Black'),
        fam.mine ? h('span', { class: 'tag mine' }, 'Mine') : fam.eco && h('span', { class: 'tag' }, fam.eco),
        h('span', {}, plural(fam.lines.length, 'line')),
        hits != null && F.q && h('span', {}, `· ${hits} match`),
        c.due > 0 && h('span', { style: 'color:var(--ox)' }, `· ${c.due} due`),
      ),
      progressBar(c.learned, fam.lines.length),
      h('div', { class: 'bar-label' }, h('span', {}, `${c.learned}/${fam.lines.length} learned`), h('span', {}, 'Open →')),
    ),
  );
}

function heroBoard(wrap) {
  const board = new Board(wrap.querySelector('.hb'), { orientation: 'white' });
  const cap = wrap.querySelector('.hero-cap');
  const pool = D.lines.filter((l) => !l.mine && l.san.length >= 10 && l.san.length <= 22 && /Sicilian|Ruy|Italian|Queen's Gambit|King's Indian|French|Caro|Scotch|Nimzo|English|Grünfeld|Catalan/.test(l.fam));
  let dead = false;
  const loop = async () => {
    while (!dead) {
      const line = pool[Math.floor(Math.random() * pool.length)];
      const c = new Chess();
      board.setFen(START_FEN);
      cap.innerHTML = '';
      cap.append(h('b', {}, line.name), h('span', {}, line.eco));
      for (const m of line.san) {
        await new Promise((r) => setTimeout(r, 850));
        if (dead) return;
        const mv = c.move(m);
        board.setFen(c.fen(), { last: [mv.from, mv.to], animate: true });
      }
      await new Promise((r) => setTimeout(r, 2600));
    }
  };
  loop();
  return () => (dead = true);
}

export function render(root) {
  const total = D.lines.length;
  const all = counts(D.lines.map((l) => l.id));
  const stop = [];
  const hero = h(
    'section',
    { class: 'hero' },
    h(
      'div',
      {},
      h('h1', { html: 'Every opening.<br>Every line. <em>Free.</em>' }),
      h('p', { class: 'lead' }, `Train ${total.toLocaleString()} named lines across ${D.families.length} openings with spaced repetition, explore any position, and drop in your own PGN repertoires and master databases. No account, no paywall, no limits.`),
      h(
        'div',
        { class: 'cta' },
        h('a', { class: 'btn primary', href: all.due ? '#/review' : '#/opening/italian-game' }, all.due ? `Review ${all.due} due line${all.due > 1 ? 's' : ''}` : 'Start with the Italian Game'),
        h('a', { class: 'btn', href: '#/explorer' }, 'Open the explorer'),
        h('a', { class: 'btn ghost', href: '#/import' }, 'Import PGN'),
      ),
      h(
        'div',
        { class: 'stats-row' },
        h('div', {}, h('b', {}, total.toLocaleString()), h('span', {}, 'lines')),
        h('div', {}, h('b', {}, String(D.families.length)), h('span', {}, 'openings')),
        h('div', {}, h('b', {}, `${all.learned}`), h('span', {}, 'learned')),
        h('div', {}, h('b', {}, '$0'), h('span', {}, 'forever')),
      ),
    ),
    h('div', { class: 'hero-board' }, h('div', { class: 'hb' }), h('div', { class: 'hero-cap' })),
  );

  const grid = h('div', { class: 'grid' });
  const more = h('div', { class: 'more' });
  const note = h('span', { class: 'count-note' });

  const chip = (label, key, val) => {
    const b = h('button', { class: 'chip', 'aria-pressed': String(F[key] === val), onclick: () => ((F[key] = F[key] === val ? '' : val), (F.shown = 36), sync()) }, label);
    return b;
  };

  const toolbar = h('div', { class: 'toolbar' });
  const search = h('input', { type: 'search', placeholder: 'Search openings, variations, ECO codes or moves (e.g. 1.e4 c5 Nf3)…', value: F.q, 'aria-label': 'Search openings' });
  search.addEventListener(
    'input',
    debounce(() => {
      F.q = search.value;
      F.shown = 36;
      draw();
    }, 140),
  );

  function buildToolbar() {
    toolbar.replaceChildren(
      h('label', { class: 'search' }, h('span', { 'aria-hidden': 'true' }, '⌕'), search),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Side' }, chip('White', 'side', 'white'), chip('Black', 'side', 'black')),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'First move' }, FIRSTS.map(([v, l]) => chip(l, 'first', v))),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'ECO volume' }, ['A', 'B', 'C', 'D', 'E'].map((v) => chip(v, 'vol', v))),
      h(
        'select',
        { class: 'sel', 'aria-label': 'Sort', onchange: (e) => ((F.sort = e.target.value), draw()) },
        [['lines', 'Most lines'], ['az', 'A → Z'], ['progress', 'Most learned'], ['due', 'Most due']].map(([v, l]) => h('option', { value: v, selected: F.sort === v }, l)),
      ),
      note,
    );
  }

  function sync() {
    buildToolbar();
    draw();
  }

  function draw() {
    const list = visible();
    note.textContent = `${list.length} opening${list.length === 1 ? '' : 's'}`;
    grid.replaceChildren(...list.slice(0, F.shown).map(({ fam, hits }) => famCard(fam, hits)));
    more.replaceChildren();
    if (list.length > F.shown) more.append(h('button', { class: 'btn', onclick: () => ((F.shown += 48), draw()) }, `Show more (${list.length - F.shown} left)`));
    if (!list.length) grid.append(h('div', { class: 'empty' }, 'No openings match. Try fewer filters or a different spelling.'));
  }

  root.replaceChildren(hero, toolbar, grid, more);
  buildToolbar();
  draw();
  stop.push(heroBoard(hero));
  return () => stop.forEach((f) => f());
}
