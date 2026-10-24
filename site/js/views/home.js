import { D, fenAfter } from '../data.js';
import { drawMini } from '../board.js';
import { counts } from '../store.js';
import { h, debounce } from '../ui.js';

const F = { q: '', side: '', all: false };
const HOW_KEY = 'rookery:how-hidden';

function matches(fam, q) {
  if (!q) return true;
  const ql = q.toLowerCase();
  return fam.name.toLowerCase().includes(ql) || fam.lines.some((l) => l.name.toLowerCase().includes(ql));
}

function sideBadge(side) {
  return h('img', { class: 'side', src: `pieces/${side === 'white' ? 'w' : 'b'}K.svg`, alt: '', title: `You play ${side === 'white' ? 'White' : 'Black'}` });
}

export function card(fam) {
  const ids = fam.tiers.essentials.map((l) => l.id);
  const c = counts(ids);
  const canvas = h('canvas', { 'aria-hidden': 'true' });
  const fen = fenAfter(fam.root.san);
  requestAnimationFrame(() => drawMini(canvas, fen, fam.side));
  const verb = c.learned === 0 ? 'Start' : c.learned >= c.total ? 'Practice' : 'Continue';
  return h(
    'a',
    { class: 'ocard', href: `#/opening/${fam.slug}`, 'aria-label': `${fam.name}, ${c.learned} of ${c.total} lessons learned` },
    canvas,
    h(
      'div',
      { class: 'body' },
      h('h3', {}, fam.name),
      h('p', {}, fam.blurb || `${fam.tiers.essentials.length} lessons to get you started.`),
      h('div', { class: 'count' }, fam.mine ? 'Your own lessons' : `${c.learned} of ${c.total} lessons learned`),
      h('div', { class: 'go' }, (() => { const b = h('div', { class: 'bar' }, h('i')); requestAnimationFrame(() => (b.firstChild.style.width = c.total ? (c.learned / c.total) * 100 + '%' : '0')); return b; })(), h('span', { class: 'play' }, verb)),
    ),
    sideBadge(fam.side),
  );
}

function howItWorks() {
  let hidden = false;
  try {
    hidden = localStorage.getItem(HOW_KEY) === '1';
  } catch {
    /* ignore */
  }
  if (hidden) return null;
  const step = (n, t, d) => h('div', {}, h('b', {}, n), h('strong', {}, t), h('span', {}, d));
  const box = h(
    'div',
    {},
    h('div', { class: 'how' }, step('1', 'Pick an opening', 'Choose one below. Every opening is a set of short lessons.'), step('2', 'Play the moves', 'Your coach plays the other side. Find the right move to win a star.'), step('3', 'Practice', 'Come back each day. Practice brings back what you might forget.')),
    h('button', { class: 'btn sm ghost how-close', style: 'align-self:flex-end', onclick: () => { try { localStorage.setItem(HOW_KEY, '1'); } catch { /* ignore */ } box.remove(); } }, 'Got it, hide this'),
  );
  box.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  return box;
}

export function render(root) {
  const due = counts(D.lines.map((l) => l.id)).due;
  const search = h('input', { type: 'search', placeholder: 'Search openings, like Italian or Sicilian', value: F.q, 'aria-label': 'Search openings' });
  const results = h('div', {});
  const filters = h('div', { class: 'filters' });

  const segBtn = (label, side, img) => h('button', { type: 'button', 'aria-pressed': String(F.side === side), onclick: () => ((F.side = side), drawFilters(), draw()) }, img ? h('img', { src: img, alt: '' }) : null, label);
  function drawFilters() {
    filters.replaceChildren(h('div', { class: 'seg', role: 'group', 'aria-label': 'Which side do you play?' }, segBtn('All', ''), segBtn('White', 'white', 'pieces/wK.svg'), segBtn('Black', 'black', 'pieces/bK.svg')));
  }

  function section(title, list, note) {
    return h('section', {}, h('div', { class: 'section-h' }, h('h2', {}, title), note ? h('span', {}, note) : null), h('div', { class: 'cards' }, list.map(card)));
  }

  function draw() {
    const filtered = D.families.filter((f) => (!F.side || f.side === F.side) && matches(f, F.q.trim()));
    const mine = filtered.filter((f) => f.mine);
    const rest = filtered.filter((f) => !f.mine);
    const searching = F.q.trim() || F.side;
    const kids = [];
    if (due && !searching) {
      kids.push(
        h('div', { class: 'panel', style: 'display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:22px' }, h('div', {}, h('h3', {}, `${due} lesson${due > 1 ? 's' : ''} ready to practice`), h('div', { style: 'color:var(--muted)' }, 'A quick practice keeps your openings fresh.')), h('a', { class: 'btn primary', href: '#/review' }, 'Practice now')),
      );
    }
    if (mine.length) kids.push(section('Your lessons', mine));
    if (searching) {
      kids.push(rest.length ? section(`${rest.length} opening${rest.length > 1 ? 's' : ''} found`, rest) : h('div', { class: 'empty' }, 'No openings found. Try a shorter name, like "sicilian".'));
    } else {
      const popular = rest.filter((f) => f.blurb);
      const others = rest.filter((f) => !f.blurb);
      kids.push(section('Popular openings', popular));
      if (F.all) kids.push(section('More openings', others));
      else if (others.length) kids.push(h('div', { class: 'more-row' }, h('button', { class: 'btn', onclick: () => ((F.all = true), draw()) }, `Show ${others.length} more openings`)));
    }
    results.replaceChildren(...kids);
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
    h(
      'section',
      { class: 'welcome' },
      h('h1', {}, 'Learn chess openings'),
      h('p', {}, 'Pick an opening, play the moves with your coach, and practice until you know them. It is free.'),
      h('label', { class: 'search-big' }, h('span', { 'aria-hidden': 'true', style: 'display:flex', html: '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>' }), search),
      filters,
    ),
    howItWorks(),
    results,
  );
  draw();
}
