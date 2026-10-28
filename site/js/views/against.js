// "Playing against the Pirc": the moves to play against an opening, line by line, with the traps for when the opponent goes wrong.
import { D } from '../data.js';
import { drawMini } from '../board.js';
import { fenAfter } from '../data.js';
import { coursesOf, trapsOf, popularRank, antiSide, trapsInLine, crushTitle } from '../repertoire.js';
import { courseCard } from './cards.js';
import { h, debounce } from '../ui.js';

const F = { q: '' };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function index(root) {
  const fams = D.families.filter((f) => !f.small && !f.mine && coursesOf(f).length).sort((a, b) => popularRank(a) - popularRank(b));
  const search = h('input', { type: 'search', placeholder: 'Which opening do you want to beat? Like Pirc or London', value: F.q, 'aria-label': 'Search openings' });
  const grid = h('div', { class: 'cards', style: 'margin-top:18px' });
  function draw() {
    const q = F.q.trim().toLowerCase();
    grid.replaceChildren(
      ...fams
        .filter((f) => !q || f.name.toLowerCase().includes(q))
        .map((fam) => {
          const you = antiSide(fam);
          const traps = trapsOf(fam).filter((t) => (t.side || fam.side) === you).length;
          const canvas = h('canvas', { 'aria-hidden': 'true' });
          requestAnimationFrame(() => drawMini(canvas, fenAfter(fam.root.san), you));
          return h(
            'a',
            { class: 'ocard', href: `#/against/${fam.slug}` },
            canvas,
            h('div', { class: 'body' }, h('h3', {}, `Against the ${fam.name}`), h('p', {}, `What to play as ${you === 'white' ? 'White' : 'Black'} against every line of the ${fam.name}, and the traps that punish mistakes.`), h('div', { class: 'count' }, `${plural(coursesOf(fam).length, 'variation')} · ${plural(traps, 'trap')}`), h('div', { class: 'go' }, h('div', { class: 'bar' }, h('i')), h('span', { class: 'play' }, 'Start'))),
            h('img', { class: 'side', src: `pieces/${you === 'white' ? 'w' : 'b'}K.svg`, alt: '', title: `You play ${you === 'white' ? 'White' : 'Black'}` }),
          );
        }),
    );
  }
  search.addEventListener('input', debounce(() => ((F.q = search.value), draw()), 140));
  root.replaceChildren(h('section', { class: 'welcome' }, h('h1', {}, 'Play against an opening'), h('p', {}, 'Pick the opening your opponents play. Learn the best answer to each of its lines, and the traps to set if they go wrong. Most played first.'), h('label', { class: 'search-big' }, search)), grid);
  draw();
}

function study(root, fam) {
  const you = antiSide(fam);
  const courses = coursesOf(fam);
  const traps = trapsOf(fam).filter((t) => (t.side || fam.side) === you);
  const cards = courses.map((c) => {
    const n = trapsInLine(fam, c, you).length;
    return courseCard(fam, c, you, { title: crushTitle(c.name), text: `${/^(vs|against) /i.test(c.name) ? `Play ${c.name.replace(/^(vs|against)\s+/i, '')} against the ${fam.name}` : 'Your answer to the ' + c.name}${n ? ', with the traps that punish mistakes' : ''}.`, extra: n ? ` · ${plural(n, 'trap')}` : '', crush: true });
  });
  root.replaceChildren(
    h(
      'div',
      { style: 'padding-top:6px' },
      h('p', { class: 'crumb' }, h('a', { href: '#/against' }, '← All openings')),
      h('h1', { class: 'title' }, `Playing against the ${fam.name}`),
      h('p', { class: 'blurb' }, `You play ${you === 'white' ? 'White' : 'Black'}. Each card is one way your opponent can play the ${fam.name}: learn your moves against it first, then the traps for when they go wrong.`),
      h('div', { class: 'section-h', style: 'margin-top:8px' }, h('h2', {}, 'Pick their line'), h('span', {}, `${plural(courses.length, 'variation')} · ${plural(traps.length, 'trap')}`)),
      h('div', { class: 'cards' }, ...cards),
    ),
  );
}

export function render(root, { slug }) {
  if (!slug) return index(root);
  const fam = D.famBySlug.get(slug);
  if (!fam) return void root.replaceChildren(h('div', { class: 'empty' }, 'We could not find that opening.', h('div', {}, h('a', { class: 'btn primary', href: '#/against' }, 'Back'))));
  study(root, fam);
}
