import { Chess } from '../../vendor/chess.js';
import { D, nameFor } from '../data.js';
import { Board } from '../board.js';
import { counts, isDue, isLearned } from '../store.js';
import { coursesOf, buildCourse } from '../repertoire.js';
import { h, plural } from '../ui.js';

export function render(root, { slug, query }) {
  const fam = D.famBySlug.get(slug);
  if (!fam) {
    root.replaceChildren(h('div', { class: 'empty' }, 'We could not find that opening.', h('div', {}, h('a', { class: 'btn primary', href: '#/' }, 'See all openings'))));
    return;
  }
  let side = query.get('side') || fam.side;
  const courses = coursesOf(fam);
  let courseKey = courses.some((c) => c.key === query.get('course')) ? query.get('course') : courses[0].key;
  const game = new Chess();
  const board = new Board(h('div'), {});
  const now = h('div', { class: 'now', 'aria-live': 'polite' });
  const tabs = h('div', { class: 'course-tabs', role: 'tablist' });
  const panel = h('div', { class: 'course-panel' });
  const sideSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'You play' });
  let shown = [];
  let ply = 0;

  const current = () => buildCourse(fam, courses.find((c) => c.key === courseKey), side);

  function preview(path, animate = true) {
    shown = path;
    ply = path.length;
    game.reset();
    let last = null;
    for (const m of path) {
      const mv = game.move(m);
      last = [mv.from, mv.to];
    }
    board.setOrientation(side);
    board.setFen(game.fen(), { last, animate });
    const nm = path.length ? nameFor(path, game.fen()) : null;
    now.replaceChildren(h('b', {}, nm ? nm.line.sub || nm.line.fam : 'Starting position'), h('span', {}, path.length ? `${Math.ceil(path.length / 2)} move${path.length > 2 ? 's' : ''} in` : 'Tap a move to see it on the board'));
    for (const c of panel.querySelectorAll('.mv')) c.classList.toggle('cur', c.dataset.path === path.join(' '));
  }

  const mineAt = (i) => (i % 2 === 0) === (side === 'white');
  function chip(path, i, first) {
    const m = path[i];
    const white = i % 2 === 0;
    const label = white ? `${i / 2 + 1}.${m}` : first ? `${(i + 1) / 2}…${m}` : m;
    return h('button', { type: 'button', class: 'mv ' + (mineAt(i) ? 'mine' : 'theirs'), dataset: { path: path.slice(0, i + 1).join(' ') }, title: mineAt(i) ? 'Your move' : 'Their move', onclick: () => preview(path.slice(0, i + 1)) }, label);
  }

  function leafRow(l) {
    const done = isLearned(l.id);
    return h(
      'div',
      { class: 'leaf' },
      h('span', { class: 'st ' + (done ? 'done' : isDue(l.id) ? 'due' : ''), title: done ? 'Learned' : 'Not learned yet' }, '✓'),
      h('span', { class: 'nm' }, l.sub),
      h('a', { class: 'btn sm primary', href: trainHref(l) }, 'Play this line'),
    );
  }
  const trainHref = (l) => `#/train/${fam.slug}?course=${courseKey}&side=${side}&line=${l.id}`;
  const theirs = () => (side === 'white' ? 'Black' : 'White');

  // one stretch of forced moves, then "If they play ..." for every reply we cover
  function renderNode(node, path, afterReply) {
    const chips = [];
    let n = node;
    let p = path;
    while (n.kids.size === 1 && !n.leaf) {
      const [m, k] = n.kids.entries().next().value;
      p = [...p, m];
      chips.push(chip(p, p.length - 1, chips.length === 0));
      n = k;
    }
    const out = [];
    if (chips.length) out.push(h('div', { class: 'seq' }, afterReply || mineAt(path.length) ? h('span', { class: 'lead' }, 'you play') : null, ...chips));
    if (n.leaf) out.push(leafRow(n.leaf));
    else if (n.kids.size > 1) {
      out.push(
        h(
          'div',
          { class: 'branches' },
          [...n.kids].map(([m, k]) => {
            const pp = [...p, m];
            return h('div', { class: 'branch' }, h('div', { class: 'if' }, h('span', { class: 'lead' }, `If ${theirs()} plays`), chip(pp, pp.length - 1, true)), renderNode(k, pp, true));
          }),
        ),
      );
    }
    return h('div', { class: 'node' }, ...out);
  }

  function drawPanel() {
    const built = current();
    const c = built.course;
    const k = counts(built.leaves.map((l) => l.id));
    const next = built.leaves.find((l) => !isLearned(l.id)) || built.leaves[0];
    let node = built.tree;
    for (const m of c.path) node = node.kids.get(m) || node;
    panel.replaceChildren(
      h('h2', {}, c.name),
      h('p', { class: 'blurb' }, c.idea),
      h('div', { class: 'start-row' }, h('a', { class: 'btn primary big', href: trainHref(next) }, k.learned === 0 ? 'Start learning' : k.learned < k.total ? 'Continue learning' : 'Play the lessons again'), h('span', { class: 'meta' }, `${k.learned} of ${k.total} ${k.total === 1 ? 'lesson' : 'lessons'} learned`)),
      c.path.length ? h('div', { class: 'tree-head' }, h('b', {}, 'Start with these moves'), h('div', { class: 'seq' }, ...c.path.map((_, i) => chip(c.path, i, i === 0)))) : null,
      h('div', { class: 'tree-head' }, h('b', {}, 'What to play'), h('span', { class: 'legend' }, h('i', { class: 'mine' }, 'Your move'), h('i', { class: 'theirs' }, 'Their move'), 'Tap any move to see it.')),
      renderNode(node, c.path, false),
    );
    preview(shown.length ? shown : c.path, false);
  }

  function drawTabs() {
    tabs.replaceChildren(
      ...courses.map((c) => {
        const b = buildCourse(fam, c, side);
        const k = counts(b.leaves.map((l) => l.id));
        return h('button', { type: 'button', role: 'tab', class: 'course-tab', 'aria-selected': String(c.key === courseKey), onclick: () => ((courseKey = c.key), (shown = []), drawTabs(), drawPanel()) }, h('b', {}, c.name), h('span', {}, `${k.learned}/${k.total}`));
      }),
    );
    sideSeg.replaceChildren(
      ...['white', 'black'].map((s) => h('button', { type: 'button', 'aria-pressed': String(side === s), onclick: () => ((side = s), (shown = []), drawTabs(), drawPanel()) }, h('img', { src: `pieces/${s === 'white' ? 'w' : 'b'}K.svg`, alt: '' }), s === 'white' ? 'White' : 'Black')),
    );
  }

  const onKey = (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowLeft') preview(shown.slice(0, Math.max(0, shown.length - 1)));
  };
  window.addEventListener('keydown', onKey);

  const left = h('div', { class: 'left' }, board.el, now, h('div', { class: 'nav-row' }, h('button', { class: 'btn sm', onclick: () => preview(shown.slice(0, Math.max(0, shown.length - 1))) }, '◀ Back one move'), h('button', { class: 'btn sm', onclick: () => board.flip() }, 'Flip board')));
  const right = h(
    'div',
    { class: 'right' },
    h('p', { class: 'crumb' }, h('a', { href: '#/' }, '← All openings')),
    h('h1', { class: 'title' }, fam.name),
    fam.blurb && h('p', { class: 'blurb' }, fam.blurb),
    h('div', { class: 'who' }, h('span', {}, 'You play'), sideSeg),
    h('h3', { class: 'pick' }, courses.length > 1 ? 'Pick a variation' : 'Your lessons'),
    tabs,
    panel,
  );
  root.replaceChildren(h('div', { class: 'split' }, left, right));
  drawTabs();
  drawPanel();
  return () => window.removeEventListener('keydown', onKey);
}
