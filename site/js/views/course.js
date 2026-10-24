// One variation: pick a depth (Essentials / Advanced / Expert), start learning, and see the whole tree.
import { Chess } from '../../vendor/chess.js';
import { D, nameFor } from '../data.js';
import { Board } from '../board.js';
import { counts, isDue, isLearned, isDiscovered } from '../store.js';
import { coursesOf, buildCourse, tiersOf } from '../repertoire.js';
import { h } from '../ui.js';

export function render(root, { slug, key, query }) {
  const fam = D.famBySlug.get(slug);
  const courses = fam ? coursesOf(fam) : [];
  const course = courses.find((c) => c.key === key);
  if (!fam || !course) {
    root.replaceChildren(h('div', { class: 'empty' }, 'We could not find that variation.', h('div', {}, h('a', { class: 'btn primary', href: fam ? `#/opening/${fam.slug}` : '#/' }, 'Back'))));
    return;
  }
  let side = query.get('side') || fam.side;
  let tier = query.get('tier') || 'essentials';
  const game = new Chess();
  const board = new Board(h('div'), {});
  const now = h('div', { class: 'now', 'aria-live': 'polite' });
  const depths = h('div', { class: 'course-tabs', role: 'group', 'aria-label': 'How deep?' });
  const panel = h('div', { class: 'course-panel' });
  const sideSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'You play' });
  let shown = [];

  const current = () => buildCourse(fam, course, side, tier);
  const trainHref = (l, mode) => `#/train/${fam.slug}?course=${course.key}&side=${side}&tier=${tier}&line=${l.id}${mode ? '&mode=' + mode : ''}`;
  const mineAt = (i) => (i % 2 === 0) === (side === 'white');
  const theirs = () => (side === 'white' ? 'Black' : 'White');

  function preview(path, animate = true) {
    shown = path;
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

  function chip(path, i, first) {
    const m = path[i];
    const white = i % 2 === 0;
    const label = white ? `${i / 2 + 1}.${m}` : first ? `${(i + 1) / 2}…${m}` : m;
    return h('button', { type: 'button', class: 'mv ' + (mineAt(i) ? 'mine' : 'theirs'), dataset: { path: path.slice(0, i + 1).join(' ') }, title: mineAt(i) ? 'Your move' : 'Their move', onclick: () => preview(path.slice(0, i + 1)) }, label);
  }

  function leafRow(l) {
    const done = isLearned(l.id);
    const seen = isDiscovered(l.id);
    return h(
      'div',
      { class: 'leaf' },
      h('span', { class: 'st ' + (done ? 'done' : seen ? 'seen' : isDue(l.id) ? 'due' : ''), title: done ? 'Learned' : seen ? 'Seen. Practice it to learn it.' : 'Not seen yet' }, '✓'),
      h('span', { class: 'nm' }, l.sub),
      h('a', { class: 'btn sm primary', href: trainHref(l, seen ? 'practice' : 'learn') }, seen ? 'Practice' : 'Learn this line'),
    );
  }

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
    const k = counts(built.leaves.map((l) => l.id));
    const toLearn = built.leaves.find((l) => !isDiscovered(l.id));
    const toPractice = built.leaves.find((l) => isDiscovered(l.id) && !isLearned(l.id));
    let node = built.tree;
    for (const m of course.path) node = node.kids.get(m) || node;
    panel.replaceChildren(
      h(
        'div',
        { class: 'start-row' },
        toLearn
          ? h('a', { class: 'btn primary big', href: trainHref(toLearn, 'learn') }, k.discovered === 0 ? 'Start learning' : 'Continue learning')
          : h('a', { class: 'btn primary big', href: trainHref(toPractice || built.leaves[0], 'practice') }, toPractice ? 'Practice your lines' : 'Play the lines again'),
        toLearn && toPractice ? h('a', { class: 'btn big', href: trainHref(toPractice, 'practice') }, 'Practice') : null,
        h('span', { class: 'meta' }, `${k.discovered} of ${k.total} lines seen · ${k.learned} learned`),
      ),
      course.path.length ? h('div', { class: 'tree-head' }, h('b', {}, 'Start with these moves'), h('div', { class: 'seq' }, ...course.path.map((_, i) => chip(course.path, i, i === 0)))) : null,
      h('div', { class: 'tree-head' }, h('b', {}, 'What to play'), h('span', { class: 'legend' }, h('i', { class: 'mine' }, 'Your move'), h('i', { class: 'theirs' }, 'Their move'), 'Tap any move to see it.')),
      renderNode(node, course.path, false),
    );
    preview(shown.length ? shown : course.path, false);
  }

  function drawControls() {
    const tiers = tiersOf(fam, course, side);
    if (!tiers.some((t) => t.key === tier)) tier = tiers[0].key;
    depths.replaceChildren(
      ...tiers.map((t) => h('button', { type: 'button', class: 'course-tab', 'aria-selected': String(t.key === tier), title: t.hint, onclick: () => ((tier = t.key), (shown = []), drawControls(), drawPanel()) }, h('b', {}, t.label), h('span', {}, `${t.count} ${t.count === 1 ? 'line' : 'lines'}`))),
    );
    sideSeg.replaceChildren(
      ...['white', 'black'].map((s) => h('button', { type: 'button', 'aria-pressed': String(side === s), onclick: () => ((side = s), (shown = []), drawControls(), drawPanel()) }, h('img', { src: `pieces/${s === 'white' ? 'w' : 'b'}K.svg`, alt: '' }), s === 'white' ? 'White' : 'Black')),
    );
  }

  const back = () => preview(shown.slice(0, Math.max(0, shown.length - 1)));
  const onKey = (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowLeft') back();
  };
  window.addEventListener('keydown', onKey);

  const left = h('div', { class: 'left' }, board.el, now, h('div', { class: 'nav-row' }, h('button', { class: 'btn sm', onclick: back }, '◀ Back one move'), h('button', { class: 'btn sm', onclick: () => board.flip() }, 'Flip board')));
  const right = h(
    'div',
    { class: 'right' },
    h('p', { class: 'crumb' }, h('a', { href: `#/opening/${fam.slug}?side=${side}` }, `← ${fam.name}`)),
    h('h1', { class: 'title' }, course.name),
    h('p', { class: 'blurb' }, course.idea),
    h('div', { class: 'who' }, h('span', {}, 'You play'), sideSeg),
    courses.length ? h('h3', { class: 'pick' }, 'How deep do you want to go?') : null,
    depths,
    panel,
  );
  root.replaceChildren(h('div', { class: 'split' }, left, right));
  drawControls();
  drawPanel();
  return () => window.removeEventListener('keydown', onKey);
}
