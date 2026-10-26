// Every trap we teach, in one scrolling list. Each trap says which opening it is a trap against.
import { D, fenAfter } from '../data.js';
import { drawMini } from '../board.js';
import { counts } from '../store.js';
import { trapsOf, buildCourse, tiersOf, defaultTier } from '../repertoire.js';
import { h, debounce } from '../ui.js';

const F = { q: '', side: '' };

function allTraps() {
  const out = [];
  for (const fam of D.families) {
    for (const course of trapsOf(fam)) out.push({ fam, course, side: course.side || fam.side });
  }
  return out.sort((a, b) => a.fam.name.localeCompare(b.fam.name) || a.course.name.localeCompare(b.course.name));
}

function card({ fam, course, side }) {
  const tiers = tiersOf(fam, course, side);
  const dt = defaultTier(tiers);
  const built = buildCourse(fam, course, side, dt.key);
  const c = counts(built.leaves.map((l) => l.id));
  const canvas = h('canvas', { 'aria-hidden': 'true' });
  requestAnimationFrame(() => drawMini(canvas, fenAfter(course.path), side));
  const bar = h('div', { class: 'bar' }, h('i'));
  requestAnimationFrame(() => (bar.firstChild.style.width = (c.total ? (c.learned / c.total) * 100 : 0) + '%'));
  return h(
    'a',
    { class: 'ocard', href: `#/course/${fam.slug}/${course.key}?side=${side}&tier=${dt.key}`, 'aria-label': `${course.name}, a trap against the ${fam.name}` },
    canvas,
    h(
      'div',
      { class: 'body' },
      h('h3', {}, course.name),
      h('p', {}, `A trap against the ${fam.name}. You play ${side === 'white' ? 'White' : 'Black'}.`),
      h('div', { class: 'count' }, `${tiers.at(-1).count} ${tiers.at(-1).count === 1 ? 'line' : 'lines'} · ${c.learned} learned`),
      h('div', { class: 'go' }, bar, h('span', { class: 'play' }, c.discovered === 0 ? 'Start' : c.learned >= c.total ? 'Practice' : 'Continue')),
    ),
  );
}

export function render(root) {
  const traps = allTraps();
  const search = h('input', { type: 'search', placeholder: 'Search traps, like Pirc or Smith-Morra', value: F.q, 'aria-label': 'Search traps' });
  const filters = h('div', { class: 'filters' });
  const results = h('div', {});
  const segBtn = (label, side, img) => h('button', { type: 'button', 'aria-pressed': String(F.side === side), onclick: () => ((F.side = side), drawFilters(), draw()) }, img ? h('img', { src: img, alt: '' }) : null, label);
  function drawFilters() {
    filters.replaceChildren(h('div', { class: 'seg', role: 'group', 'aria-label': 'Which side sets the trap?' }, segBtn('All', ''), segBtn('As White', 'white', 'pieces/wK.svg'), segBtn('As Black', 'black', 'pieces/bK.svg')));
  }
  function draw() {
    const q = F.q.trim().toLowerCase();
    const list = traps.filter((t) => (!F.side || t.side === F.side) && (!q || (t.course.name + ' ' + t.fam.name).toLowerCase().includes(q)));
    results.replaceChildren(
      list.length
        ? h('section', {}, h('div', { class: 'section-h' }, h('h2', {}, `${list.length} trap${list.length > 1 ? 's' : ''}`), h('span', {}, 'Tap one to learn it')), h('div', { class: 'cards' }, list.map(card)))
        : h('div', { class: 'empty' }, 'No traps found. Try a shorter name.'),
    );
  }
  search.addEventListener(
    'input',
    debounce(() => {
      F.q = search.value;
      draw();
    }, 140),
  );
  drawFilters();
  root.replaceChildren(
    h('section', { class: 'welcome' }, h('h1', {}, 'Opening traps'), h('p', {}, 'Sneaky tricks that win games fast. Each one is a trap against a named opening. Learn how to set it, and what to do if your opponent sees it.'), h('label', { class: 'search-big' }, search), filters),
    results,
  );
  draw();
}
