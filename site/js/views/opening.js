// An opening page: one card (with its own board) per variation, like a course list.
import { D, fenAfter } from '../data.js';
import { drawMini } from '../board.js';
import { counts } from '../store.js';
import { courseCard } from './cards.js';
import { coursesOf, trapsOf, buildCourse, tiersOf, defaultTier } from '../repertoire.js';
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

  function draw() {
    grid.replaceChildren(...courses.map((c) => courseCard(fam, c, c.side || sideAll)));
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
      h('div', { class: 'panel', style: 'display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:28px' }, h('div', {}, h('h3', {}, `Facing the ${fam.name}?`), h('div', { style: 'color:var(--muted)' }, `Learn how to beat it, with traps for when your opponent goes wrong.`)), h('a', { class: 'btn primary', href: `#/against/${fam.slug}` }, `Play against the ${fam.name}`)),
    ),
  );
  draw();
}
