// One variation, Chess.com style: a side panel with Learn / Practice tabs, a progress bar and a list of lines.
import { Chess } from '../../vendor/chess.js';
import { D, nameFor, fenAfter } from '../data.js';
import { Board, drawMini } from '../board.js';
import { counts, isLearned, isDiscovered } from '../store.js';
import { allCoursesOf, buildCourse, tiersOf, defaultTier } from '../repertoire.js';
import { h } from '../ui.js';

export function render(root, { slug, key, query }) {
  const fam = D.famBySlug.get(slug);
  const courses = fam ? allCoursesOf(fam) : [];
  const course = courses.find((c) => c.key === key);
  if (!fam || !course) {
    root.replaceChildren(h('div', { class: 'empty' }, 'We could not find that variation.', h('div', {}, h('a', { class: 'btn primary', href: fam ? `#/opening/${fam.slug}` : '#/' }, 'Back'))));
    return;
  }
  let side = query.get('side') || course.side || fam.side;
  let tier = query.get('tier') || defaultTier(tiersOf(fam, course, side)).key;
  let tab = query.get('tab') === 'practice' ? 'practice' : 'learn';
  const game = new Chess();
  const board = new Board(h('div'), {});
  const panel = h('div', { class: 'panel-card' });
  let shown = [];
  let selected = null;

  const current = () => buildCourse(fam, course, side, tier);
  const trainHref = (l, mode) => `#/train/${fam.slug}?course=${course.key}&side=${side}&tier=${tier}&line=${l.id}&mode=${mode}`;
  const mineAt = (i) => (i % 2 === 0) === (side === 'white');
  const theirs = () => (side === 'white' ? 'Black' : 'White');
  const shortName = (l) => l.sub.replace(new RegExp('^' + course.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':?\\s*'), '') || 'Main line';
  const moveCount = (l) => `${Math.ceil(l.san.length / 2)} moves`;

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
    for (const c of panel.querySelectorAll('.mv')) c.classList.toggle('cur', c.dataset.path === path.join(' '));
  }

  function chip(path, i, first) {
    const m = path[i];
    const white = i % 2 === 0;
    const label = white ? `${i / 2 + 1}.${m}` : first ? `${(i + 1) / 2}…${m}` : m;
    return h('button', { type: 'button', class: 'mv ' + (mineAt(i) ? 'mine' : 'theirs'), dataset: { path: path.slice(0, i + 1).join(' ') }, title: mineAt(i) ? 'Your move' : 'Their move', onclick: () => preview(path.slice(0, i + 1)) }, label);
  }

  // the branches: one stretch of forced moves, then "If they play ..." for every reply we cover
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
    if (n.leaf) out.push(h('div', { class: 'meta', style: 'margin:4px 0 8px' }, `→ ${shortName(n.leaf)}`));
    else if (n.kids.size > 1) {
      out.push(
        h(
          'div',
          { class: 'branches' },
          [...n.kids].map(([m, k]) => {
            const pp = [...p, m];
            const lead = mineAt(p.length) ? 'Or you can play' : `If ${theirs()} plays`;
            return h('div', { class: 'branch' }, h('div', { class: 'if' }, h('span', { class: 'lead' }, lead), chip(pp, pp.length - 1, true)), renderNode(k, pp, true));
          }),
        ),
      );
    }
    return h('div', { class: 'node' }, ...out);
  }

  function draw() {
    const tiers = tiersOf(fam, course, side);
    if (!tiers.some((t) => t.key === tier)) tier = tiers[0].key;
    const built = current();
    const all = built.leaves;
    const k = counts(all.map((l) => l.id));
    const seenN = all.filter((l) => isDiscovered(l.id) && !isLearned(l.id)).length;
    const list = tab === 'learn' ? all : all.filter((l) => isDiscovered(l.id));
    const toLearn = all.find((l) => !isDiscovered(l.id));
    const toPractice = all.find((l) => isDiscovered(l.id) && !isLearned(l.id)) || all.find((l) => isDiscovered(l.id));
    const pct = k.total ? Math.round((k.learned / k.total) * 100) : 0;

    const say = k.discovered === 0 ? 'Pick a line below to start learning.' : toLearn ? "Let's continue - pick a line below to keep learning." : seenN ? 'You have seen every line. Take the quiz on each one so they stick.' : 'You know every line here. Great job!';
    const mini = h('canvas', { 'aria-hidden': 'true' });
    requestAnimationFrame(() => drawMini(mini, fenAfter(course.path), side));

    const rows = list.length
      ? list.map((l) =>
          h(
            'li',
            { class: l.id === selected ? 'cur' : '', tabindex: 0, onmouseenter: () => ((selected = l.id), preview(l.san, false)), onclick: () => (location.hash = trainHref(l, tab === 'learn' ? 'learn' : 'practice')), onkeydown: (e) => e.key === 'Enter' && (location.hash = trainHref(l, tab === 'learn' ? 'learn' : 'practice')) },
            h('span', { class: 'st ' + (isLearned(l.id) ? 'done' : isDiscovered(l.id) ? 'seen' : ''), title: isLearned(l.id) ? 'Learned' : isDiscovered(l.id) ? 'Seen. Take the quiz to learn it.' : 'Not seen yet' }, '✓'),
            h('span', { class: 'nm' }, shortName(l)),
            h('span', { class: 'ct' }, moveCount(l)),
          ),
        )
      : [h('li', { style: 'cursor:default' }, h('span'), h('span', { class: 'nm', style: 'color:var(--muted)' }, 'Learn a line first, then you can take its quiz here.'), h('span'))];

    let node = built.tree;
    for (const m of course.path) node = node.kids.get(m) || node;

    panel.replaceChildren(
      h('div', { class: 'pc-head' }, h('a', { class: 'back', href: course.trap ? '#/traps' : `#/opening/${fam.slug}?side=${side}`, 'aria-label': course.trap ? 'Back to traps' : `Back to ${fam.name}` }, '←'), h('h1', { class: 'pc-title' }, course.name), h('span', { class: 'pc-side' }, '')),
      h(
        'div',
        { class: 'pc-body' },
        h('div', { class: 'coach' }, h('div', { class: 'coach-av', 'aria-hidden': 'true' }, h('img', { src: 'pieces/wN.svg', alt: '' })), h('div', { class: 'bubble' }, h('p', {}, say))),
        h(
          'div',
          { class: 'tabs2', role: 'tablist' },
          h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === 'learn'), onclick: () => ((tab = 'learn'), draw()) }, 'Learn'),
          h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === 'practice'), onclick: () => ((tab = 'practice'), draw()) }, 'Practice', seenN ? h('span', { class: 'n' }, String(seenN)) : null),
        ),
        h('div', { class: 'ocard-mini' }, mini, h('div', {}, h('h3', {}, course.trap ? course.name : fam.name + ': ' + course.name), h('p', {}, course.idea))),
        h('div', { class: 'prog-row' }, h('div', { class: 'progress' }, h('i', { style: `width:${pct}%` })), h('b', {}, `${pct}%`), h('span', {}, side === 'white' ? 'White' : 'Black')),
        h('div', { class: 'seg', role: 'group', 'aria-label': 'You play', style: 'align-self:flex-start' }, ...['white', 'black'].map((s) => h('button', { type: 'button', 'aria-pressed': String(side === s), onclick: () => ((side = s), (selected = null), draw()) }, h('img', { src: `pieces/${s === 'white' ? 'w' : 'b'}K.svg`, alt: '' }), `Play as ${s === 'white' ? 'White' : 'Black'}`))),
        tier === 'expert' ? h('p', { class: 'meta', style: 'margin:0' }, 'Expert has every line we know, so some positions have more than one good move for you.') : null,
        tiers.length > 1 ? h('div', { class: 'depth', role: 'group', 'aria-label': 'How deep?' }, tiers.map((t) => h('button', { type: 'button', title: t.hint, 'aria-pressed': String(t.key === tier), onclick: () => ((tier = t.key), (selected = null), draw()) }, `${t.label} · ${t.count} ${t.count === 1 ? 'line' : 'lines'}`))) : null,
        h('ul', { class: 'line-list' }, ...rows),
        h(
          'details',
          { class: 'branches-box' },
          h('summary', {}, 'See all the branches (if they play this, you play that)'),
          h('div', { class: 'tree-head' }, course.path.length ? h('div', { class: 'seq' }, ...course.path.map((_, i) => chip(course.path, i, i === 0))) : null, h('span', { class: 'legend' }, h('i', { class: 'mine' }, 'Your move'), h('i', { class: 'theirs' }, 'Their move'), 'Tap a move to see it.'), renderNode(node, course.path, false)),
        ),
      ),
      h('div', { class: 'pc-foot' }, tab === 'learn' || !toPractice ? h('a', { class: 'btn primary big block', href: trainHref(toLearn || all[0], 'learn') }, toLearn ? 'Learn' : 'Watch the lines again') : h('a', { class: 'btn primary big block', href: trainHref(toPractice, 'practice') }, 'Practice')),
    );
    preview(shown.length ? shown : selected ? all.find((l) => l.id === selected)?.san || course.path : course.path, false);
  }

  const onKey = (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowLeft') preview(shown.slice(0, Math.max(0, shown.length - 1)));
  };
  window.addEventListener('keydown', onKey);

  const left = h('div', { class: 'left' }, board.el, h('div', { class: 'nav-row' }, h('button', { class: 'btn sm', onclick: () => preview(shown.slice(0, Math.max(0, shown.length - 1))) }, '◀ Back one move'), h('button', { class: 'btn sm', onclick: () => board.flip() }, 'Flip board')));
  root.replaceChildren(h('div', { class: 'split' }, left, panel));
  draw();
  return () => window.removeEventListener('keydown', onKey);
}
