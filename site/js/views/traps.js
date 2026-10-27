// Every trap we teach, sorted by the opening it is a trap against, then by variation (like the chapters of a study).
import { D } from '../data.js';
import { trapsOf, popularRank } from '../repertoire.js';
import { trapPanels } from './trapgroups.js';
import { h, debounce } from '../ui.js';

const F = { q: '', side: '' };

export function render(root) {
  const fams = D.families.filter((f) => trapsOf(f).length).sort((a, b) => popularRank(a) - popularRank(b));
  const total = fams.reduce((n, f) => n + trapsOf(f).length, 0);
  const search = h('input', { type: 'search', placeholder: 'Search by opening, like Pirc or Smith-Morra', value: F.q, 'aria-label': 'Search traps' });
  const filters = h('div', { class: 'filters' });
  const results = h('div', {});
  const segBtn = (label, side, img) => h('button', { type: 'button', 'aria-pressed': String(F.side === side), onclick: () => ((F.side = side), drawFilters(), draw()) }, img ? h('img', { src: img, alt: '' }) : null, label);
  function drawFilters() {
    filters.replaceChildren(h('div', { class: 'seg', role: 'group', 'aria-label': 'Which side sets the trap?' }, segBtn('All', ''), segBtn('As White', 'white', 'pieces/wK.svg'), segBtn('As Black', 'black', 'pieces/bK.svg')));
  }
  function draw() {
    const q = F.q.trim().toLowerCase();
    const kids = [];
    for (const fam of fams) {
      const famHit = !q || fam.name.toLowerCase().includes(q);
      const panels = trapPanels(fam, (c, side) => (!F.side || side === F.side) && (famHit || c.title.toLowerCase().includes(q)));
      if (!panels.length) continue;
      kids.push(h('section', { class: 'tfam' }, h('div', { class: 'section-h' }, h('h2', {}, h('a', { href: `#/opening/${fam.slug}`, style: 'color:inherit;text-decoration:none' }, `Traps against the ${fam.name}`)), h('span', {}, `${trapsOf(fam).length} traps`)), h('div', { class: 'tgroups' }, panels)));
    }
    results.replaceChildren(...(kids.length ? kids : [h('div', { class: 'empty' }, 'No traps found. Try a shorter name.')]));
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
    h('section', { class: 'welcome' }, h('h1', {}, 'Opening traps'), h('p', {}, `${total} traps, sorted by the opening they are played against. The most played openings come first. Pick a variation, then a trap.`), h('label', { class: 'search-big' }, search), filters),
    results,
  );
  draw();
}
