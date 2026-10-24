import { Chess } from '../../vendor/chess.js';
import { D } from '../data.js';
import { Board } from '../board.js';
import { counts, lineState, isDue, isLearned } from '../store.js';
import { h, moveText, plural, debounce } from '../ui.js';

const TIERS = [
  ['essentials', 'Essentials', 'The main ideas. Learn these first.'],
  ['advanced', 'Advanced', 'More variations, once the basics feel easy.'],
  ['expert', 'Expert', 'Deep lines for serious study.'],
];

export function render(root, { slug, query }) {
  const fam = D.famBySlug.get(slug);
  if (!fam) {
    root.replaceChildren(h('div', { class: 'empty' }, 'We could not find that opening.', h('div', {}, h('a', { class: 'btn primary', href: '#/' }, 'See all openings'))));
    return;
  }
  let side = query.get('side') || fam.side;
  let line = fam.lines.find((l) => l.id === query.get('line')) || fam.root;
  let ply = line.san.length;
  const game = new Chess();
  const board = new Board(h('div'), {});
  const now = h('div', { class: 'now', 'aria-live': 'polite' });
  const startBtn = h('a', { class: 'btn primary big' });
  const sideSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Play as' });
  const tiersEl = h('div', {});
  const find = h('input', { type: 'search', placeholder: 'Find a lesson', 'aria-label': 'Find a lesson' });

  const ess = fam.tiers.essentials;
  const href = (l, tier) => `#/train/${fam.slug}?line=${l.id}&side=${side}&tier=${tier || 'essentials'}`;

  function drawStart() {
    const c = counts(ess.map((l) => l.id));
    const next = ess.find((l) => !isLearned(l.id)) || ess[0];
    startBtn.textContent = c.learned === 0 ? 'Start learning' : c.learned < c.total ? 'Continue learning' : 'Play the lessons again';
    startBtn.href = href(next);
    sideSeg.replaceChildren(
      ...['white', 'black'].map((s) => h('button', { type: 'button', 'aria-pressed': String(side === s), onclick: () => ((side = s), drawStart(), fillTiers()) }, h('img', { src: `pieces/${s === 'white' ? 'w' : 'b'}K.svg`, alt: '' }), s === 'white' ? 'White' : 'Black')),
    );
  }

  const show = () => {
    game.reset();
    let last = null;
    for (const m of line.san.slice(0, ply)) {
      const mv = game.move(m);
      last = [mv.from, mv.to];
    }
    board.setOrientation(side);
    board.setFen(game.fen(), { last, animate: true });
    now.replaceChildren(h('b', {}, line.sub || line.name), h('span', {}, moveText(line.san.slice(0, ply)) || 'Starting position'));
    for (const li of tiersEl.querySelectorAll('li')) li.classList.toggle('cur', li.dataset.id === line.id);
  };
  const step = (d) => {
    ply = Math.max(0, Math.min(line.san.length, ply + d));
    show();
  };
  const onKey = (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  };
  window.addEventListener('keydown', onKey);

  const row = (l, tier) => {
    const s = lineState(l.id);
    const due = isDue(l.id);
    return h(
      'li',
      { dataset: { id: l.id }, tabindex: 0, onclick: () => ((line = l), (ply = l.san.length), show()), onkeydown: (e) => e.key === 'Enter' && ((line = l), (ply = l.san.length), show()) },
      h('span', { class: 'st ' + (s.box >= 1 ? 'done' : due ? 'due' : ''), title: s.box >= 1 ? 'Learned' : 'Not learned yet' }, '✓'),
      h('span', {}, h('span', { class: 'nm' }, l.sub || `${fam.name} main line`), h('span', { class: 'mv' }, moveText(l.san))),
      due ? h('span', { class: 'practice' }, 'Practice') : null,
      h('a', { class: 'btn sm primary', href: href(l, tier), onclick: (e) => e.stopPropagation() }, 'Play'),
    );
  };

  const caps = { essentials: 100, advanced: 100, expert: 100 };
  function fillTiers() {
    const q = find.value.trim().toLowerCase();
    const open = new Set([...tiersEl.querySelectorAll('details[open]')].map((d) => d.dataset.tier));
    if (!tiersEl.children.length) open.add('essentials');
    tiersEl.replaceChildren(
      ...TIERS.map(([key, title, hint]) => {
        const all = fam.tiers[key];
        if (!all.length) return null;
        const c = counts(all.map((l) => l.id));
        const items = q ? all.filter((l) => l.name.toLowerCase().includes(q) || l.san.join(' ').toLowerCase().includes(q)) : all;
        if (q && !items.length) return null;
        const list = h('ul', { class: 'lessons' });
        const draw = () => {
          list.replaceChildren(...items.slice(0, caps[key]).map((l) => row(l, key)));
          if (items.length > caps[key]) list.append(h('li', { style: 'display:flex;justify-content:center' }, h('button', { class: 'btn sm', onclick: (e) => (e.stopPropagation(), (caps[key] += 300), draw()) }, `Show more (${items.length - caps[key]} left)`)));
          for (const li of list.querySelectorAll('li[data-id]')) li.classList.toggle('cur', li.dataset.id === line.id);
        };
        const bar = h('div', { class: 'bar' }, h('i'));
        requestAnimationFrame(() => (bar.firstChild.style.width = (c.total ? (c.learned / c.total) * 100 : 0) + '%'));
        const d = h('details', { class: 'tier', dataset: { tier: key } }, h('summary', {}, h('h3', {}, title), h('span', { class: 'hint' }, hint), h('span', { class: 'num' }, `${c.learned}/${c.total}`), bar), list);
        if (open.has(key) || q) d.open = true;
        let drawn = false;
        const lazy = () => {
          if (d.open && !drawn) (drawn = true), draw();
        };
        d.addEventListener('toggle', lazy);
        lazy();
        return d;
      }),
    );
  }
  find.addEventListener('input', debounce(fillTiers, 150));

  const c0 = counts(ess.map((l) => l.id));
  const left = h(
    'div',
    { class: 'left' },
    board.el,
    now,
    h('div', { class: 'nav-row' }, h('button', { class: 'btn sm', 'aria-label': 'Back one move', onclick: () => step(-1) }, '◀'), h('button', { class: 'btn sm', 'aria-label': 'Forward one move', onclick: () => step(1) }, '▶'), h('button', { class: 'btn sm', onclick: () => board.flip() }, 'Flip board')),
  );
  const right = h(
    'div',
    { class: 'right' },
    h('p', { class: 'crumb' }, h('a', { href: '#/' }, '← All openings')),
    h('h1', { class: 'title' }, fam.name),
    fam.blurb && h('p', { class: 'blurb' }, fam.blurb),
    h('div', { class: 'start-row' }, startBtn, h('div', {}, h('div', { style: 'color:var(--muted);font-size:14px;margin-bottom:6px' }, 'You play'), sideSeg)),
    fam.lines.length > 12 ? h('div', { class: 'find' }, find) : null,
    tiersEl,
  );
  root.replaceChildren(h('div', { class: 'split' }, left, right));
  drawStart();
  fillTiers();
  show();
  return () => window.removeEventListener('keydown', onKey);
}
