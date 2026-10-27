// Traps, browsed with the same cards as the openings: openings -> variations -> traps.
import { D, fenAfter } from '../data.js';
import { drawMini } from '../board.js';
import { counts } from '../store.js';
import { trapsOf, trapGroups, popularRank, buildCourse, tiersOf, defaultTier } from '../repertoire.js';
import { h, debounce } from '../ui.js';

const F = { q: '', side: '' };
const WORD = { Mate: 'checkmate', Fork: 'fork', Queen: 'wins the queen', Rook: 'wins a rook', Piece: 'wins a piece' };
const slugOf = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function card({ title, text, count, href, fen, side, pct, verb, rank }) {
  const canvas = h('canvas', { 'aria-hidden': 'true' });
  requestAnimationFrame(() => drawMini(canvas, fen, side));
  const bar = h('div', { class: 'bar' }, h('i'));
  requestAnimationFrame(() => (bar.firstChild.style.width = pct + '%'));
  return h(
    'a',
    { class: 'ocard', href, 'aria-label': title },
    canvas,
    h('div', { class: 'body' }, h('h3', {}, rank ? h('span', { class: 'rank' }, `#${rank}`) : null, title), h('p', {}, text), h('div', { class: 'count' }, count), h('div', { class: 'go' }, bar, h('span', { class: 'play' }, verb))),
    side ? h('img', { class: 'side', src: `pieces/${side === 'white' ? 'w' : 'b'}K.svg`, alt: '', title: `You play ${side === 'white' ? 'White' : 'Black'}` }) : null,
  );
}

// how far along the learner is across some trap chapters
function progress(fam, chapters) {
  const ids = chapters.flatMap((c) => {
    const side = c.course.side || fam.side;
    return buildCourse(fam, c.course, side, defaultTier(tiersOf(fam, c.course, side)).key).leaves.map((l) => l.id);
  });
  const k = counts(ids);
  return { pct: k.total ? (k.learned / k.total) * 100 : 0, learned: k.learned, started: k.discovered > 0, done: k.total && k.learned >= k.total };
}
const verbOf = (p) => (!p.started ? 'Start' : p.done ? 'Practice' : 'Continue');
const kinds = (chapters) => [...new Set(chapters.map((c) => WORD[c.tag]))].slice(0, 2).join(', ');

// one card per variation, for the opening page and the variation list
export function variationCards(fam) {
  return trapGroups(fam).map((g, gi) => {
    const p = progress(fam, g.chapters);
    const first = g.chapters[0].course;
    const side = g.chapters.every((c) => (c.course.side || fam.side) === (first.side || fam.side)) ? first.side || fam.side : fam.side;
    const heading = g.name === 'Famous traps' ? `Famous traps against the ${fam.name}` : g.name === 'Main line' ? `Traps against the ${fam.name}` : `Traps against the ${g.name}`;
    return card({ title: heading, text: `${g.chapters.length} trap${g.chapters.length > 1 ? 's' : ''}: ${kinds(g.chapters)}.`, count: `${g.chapters.length} trap${g.chapters.length > 1 ? 's' : ''} · ${p.learned} learned`, href: `#/traps/${fam.slug}/${slugOf(g.name)}`, fen: fenAfter(first.path), side, pct: p.pct, verb: verbOf(p), rank: gi + 1 });
  });
}

function head(root, crumbs, title, blurb, extra) {
  return h('section', { class: 'welcome' }, h('p', { class: 'crumb' }, ...crumbs), h('h1', {}, title), blurb ? h('p', {}, blurb) : null, extra);
}

function openings(root) {
  const fams = D.families.filter((f) => trapsOf(f).length).sort((a, b) => popularRank(a) - popularRank(b));
  const total = fams.reduce((n, f) => n + trapsOf(f).length, 0);
  const search = h('input', { type: 'search', placeholder: 'Search by opening, like Pirc or Smith-Morra', value: F.q, 'aria-label': 'Search traps' });
  const filters = h('div', { class: 'filters' });
  const results = h('div', { class: 'cards', style: 'margin-top:18px' });
  const segBtn = (label, side, img) => h('button', { type: 'button', 'aria-pressed': String(F.side === side), onclick: () => ((F.side = side), drawFilters(), draw()) }, img ? h('img', { src: img, alt: '' }) : null, label);
  function drawFilters() {
    filters.replaceChildren(h('div', { class: 'seg', role: 'group', 'aria-label': 'Which side sets the trap?' }, segBtn('All', ''), segBtn('As White', 'white', 'pieces/wK.svg'), segBtn('As Black', 'black', 'pieces/bK.svg')));
  }
  function draw() {
    const q = F.q.trim().toLowerCase();
    const cards = [];
    let rank = 0;
    for (const fam of fams) {
      if (q && !fam.name.toLowerCase().includes(q) && !trapsOf(fam).some((c) => c.name.toLowerCase().includes(q))) continue;
      const chapters = trapGroups(fam).flatMap((g) => g.chapters).filter((c) => !F.side || (c.course.side || fam.side) === F.side);
      if (!chapters.length) continue;
      const p = progress(fam, chapters);
      const groups = trapGroups(fam).length;
      cards.push(card({ title: fam.name, text: `Traps to set against the ${fam.name}, sorted into ${groups} variation${groups > 1 ? 's' : ''}.`, count: `${chapters.length} trap${chapters.length > 1 ? 's' : ''} · ${groups} variation${groups > 1 ? 's' : ''} · ${p.learned} learned`, href: `#/traps/${fam.slug}`, fen: fenAfter(fam.root.san), side: null, pct: p.pct, verb: verbOf(p), rank: ++rank }));
    }
    results.replaceChildren(...(cards.length ? cards : [h('div', { class: 'empty' }, 'No traps found. Try a shorter name.')]));
  }
  search.addEventListener('input', debounce(() => ((F.q = search.value), draw()), 140));
  drawFilters();
  root.replaceChildren(head(root, [], 'Opening traps', `${total} traps, ranked from the most common to the rarest. #1 is the one you will meet most often.`, h('div', {}, h('label', { class: 'search-big' }, search), filters)), results);
  draw();
}

function variations(root, fam) {
  const cards = variationCards(fam);
  root.replaceChildren(
    head(root, [h('a', { href: '#/traps' }, '← All traps')], `Traps against the ${fam.name}`, `Ranked by how often each variation is played. #1 is the most common.`),
    h('div', { class: 'cards', style: 'margin-top:18px' }, ...cards),
  );
}

function chapters(root, fam, key) {
  const g = trapGroups(fam).find((x) => slugOf(x.name) === key);
  if (!g) return void root.replaceChildren(h('div', { class: 'empty' }, 'We could not find those traps.', h('div', {}, h('a', { class: 'btn primary', href: `#/traps/${fam.slug}` }, 'Back'))));
  const cards = g.chapters.map((c, ci) => {
    const side = c.course.side || fam.side;
    const dt = defaultTier(tiersOf(fam, c.course, side));
    const p = progress(fam, [c]);
    const n = buildCourse(fam, c.course, side, dt.key).leaves.length;
    return card({ title: c.title, text: `${WORD[c.tag][0].toUpperCase() + WORD[c.tag].slice(1)}. You play ${side === 'white' ? 'White' : 'Black'}.`, count: `${n} line${n > 1 ? 's' : ''} · ${p.learned} learned`, href: `#/course/${fam.slug}/${c.course.key}?side=${side}&tier=${dt.key}`, fen: fenAfter(c.course.path), side, pct: p.pct, verb: verbOf(p), rank: ci + 1 });
  });
  const title = g.name === 'Famous traps' ? `Famous traps against the ${fam.name}` : g.name === 'Main line' ? `Traps against the ${fam.name}` : `Traps against the ${g.name}`;
  root.replaceChildren(head(root, [h('a', { href: `#/traps/${fam.slug}` }, `← Traps against the ${fam.name}`)], title, 'Ranked by how early in the game each trap springs. #1 is the one you will meet most often.'), h('div', { class: 'cards', style: 'margin-top:18px' }, ...cards));
}

export function render(root, { slug, key }) {
  if (!slug) return openings(root);
  const fam = D.famBySlug.get(slug);
  if (!fam || !trapsOf(fam).length) return void root.replaceChildren(h('div', { class: 'empty' }, 'We could not find that opening.', h('div', {}, h('a', { class: 'btn primary', href: '#/traps' }, 'All traps'))));
  return key ? chapters(root, fam, key) : variations(root, fam);
}
