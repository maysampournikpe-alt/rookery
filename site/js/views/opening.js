// An opening page: one card (with its own board) per variation, like a course list.
import { D, fenAfter } from '../data.js';
import { drawMini } from '../board.js';
import { counts } from '../store.js';
import { coursesOf, buildCourse, tiersOf, defaultTier } from '../repertoire.js';
import { h } from '../ui.js';

export function render(root, { slug, query }) {
  const fam = D.famBySlug.get(slug);
  if (!fam) {
    root.replaceChildren(h('div', { class: 'empty' }, 'We could not find that opening.', h('div', {}, h('a', { class: 'btn primary', href: '#/' }, 'See all openings'))));
    return;
  }
  let sideAll = query.get('side') || fam.side;
  const courses = coursesOf(fam);
  const grid = h('div', { class: 'cards' });
  const sideSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'You play' });

  function card(course) {
    const side = course.side || sideAll; // traps are set by one colour
    const tiers = tiersOf(fam, course, side);
    const dt = defaultTier(tiers);
    const essentials = buildCourse(fam, course, side, dt.key);
    const biggest = tiers.at(-1).count;
    const c = counts(essentials.leaves.map((l) => l.id));
    const canvas = h('canvas', { 'aria-hidden': 'true' });
    const fen = fenAfter(course.path);
    requestAnimationFrame(() => drawMini(canvas, fen, side));
    const bar = h('div', { class: 'bar' }, h('i'));
    requestAnimationFrame(() => (bar.firstChild.style.width = (c.total ? (c.learned / c.total) * 100 : 0) + '%'));
    return h(
      'a',
      { class: 'ocard', href: `#/course/${fam.slug}/${course.key}?side=${side}&tier=${dt.key}`, 'aria-label': `${course.name}, ${c.learned} of ${c.total} lines learned` },
      canvas,
      h(
        'div',
        { class: 'body' },
        h('h3', {}, course.name),
        h('p', {}, course.idea),
        h('div', { class: 'count' }, `${biggest} ${biggest === 1 ? 'line' : 'lines'} · ${c.learned} learned`),
        h('div', { class: 'go' }, bar, h('span', { class: 'play' }, c.discovered === 0 ? 'Start' : c.learned >= c.total ? 'Practice' : 'Continue')),
      ),
    );
  }

  function draw() {
    grid.replaceChildren(...courses.map(card));
    sideSeg.replaceChildren(
      ...['white', 'black'].map((s) => h('button', { type: 'button', 'aria-pressed': String(sideAll === s), onclick: () => ((sideAll = s), draw()) }, h('img', { src: `pieces/${s === 'white' ? 'w' : 'b'}K.svg`, alt: '' }), s === 'white' ? 'White' : 'Black')),
    );
  }

  root.replaceChildren(
    h(
      'div',
      { style: 'padding-top:6px' },
      h('p', { class: 'crumb' }, h('a', { href: '#/' }, '← All openings')),
      h('h1', { class: 'title' }, fam.name),
      fam.blurb && h('p', { class: 'blurb' }, fam.blurb),
      h('div', { class: 'who' }, h('span', {}, 'You play'), sideSeg),
      h('div', { class: 'section-h', style: 'margin-top:8px' }, h('h2', {}, courses.length > 1 ? 'Pick a variation' : 'Your lessons'), h('span', {}, `${courses.length} to choose from`)),
      grid,
    ),
  );
  draw();
}
