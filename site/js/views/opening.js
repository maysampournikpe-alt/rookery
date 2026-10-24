import { Chess } from '../../vendor/chess.js';
import { D, START_FEN } from '../data.js';
import { Board } from '../board.js';
import { counts, lineState, isDue, LEARNED_BOX } from '../store.js';
import { h, moveText, plural, progressBar, debounce } from '../ui.js';

export function render(root, { slug, query }) {
  const fam = D.famBySlug.get(slug);
  if (!fam) {
    root.replaceChildren(h('div', { class: 'empty' }, 'Opening not found. ', h('a', { href: '#/' }, 'Back to all openings')));
    return;
  }
  const c = counts(fam.lines.map((l) => l.id));
  let line = fam.lines.find((l) => l.id === query.get('line')) || fam.root;
  let ply = line.san.length;
  const game = new Chess();
  const board = new Board(h('div'), {});
  const boardEl = board.el;

  const now = h('div', { class: 'now', 'aria-live': 'polite' });
  const moves = h('div', { class: 'panel movetext' });
  const listEl = h('ul', { class: 'lines', role: 'listbox', 'aria-label': 'Lines' });
  const trainLine = h('a', { class: 'btn primary' }, 'Train this line');

  const sync = (animate = true) => {
    game.reset();
    let last = null;
    for (const m of line.san.slice(0, ply)) {
      const mv = game.move(m);
      last = [mv.from, mv.to];
    }
    board.setFen(game.fen(), { last, animate });
    now.replaceChildren(
      h('b', {}, ply === line.san.length ? line.name : `${line.name} (move ${Math.ceil(ply / 2)})`),
      h('span', {}, `${line.eco || 'Custom'} · ${moveText(line.san)}`),
    );
    moves.replaceChildren(
      ...line.san
        .flatMap((m, i) => [
          i % 2 === 0 ? h('span', { class: 'no' }, `${i / 2 + 1}.`) : null,
          h('span', { class: 'mv' + (i + 1 === ply ? ' cur' : ''), onclick: () => ((ply = i + 1), sync(false)) }, m),
        ])
        .filter(Boolean),
    );
    trainLine.href = `#/train/${fam.slug}?line=${line.id}&side=${fam.side}`;
    for (const li of listEl.children) li.classList.toggle('cur', li.dataset.id === line.id);
  };

  const step = (d) => {
    ply = Math.max(0, Math.min(line.san.length, ply + d));
    sync();
  };
  const onKey = (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowUp') ((ply = 0), sync());
    else if (e.key === 'ArrowDown') ((ply = line.san.length), sync());
  };
  window.addEventListener('keydown', onKey);

  const rowFor = (l) => {
    const s = lineState(l.id);
    const dot = h('span', { class: 'dotstate ' + (isDue(l.id) ? 'due' : s.box >= LEARNED_BOX ? 's2' : s.box > 0 ? 's1' : ''), title: s.box >= LEARNED_BOX ? 'Learned' : s.box > 0 ? 'Learning' : 'New' });
    const depth = l.sub ? Math.min(4, l.sub.split(/[:,]/).length) : 0;
    return h(
      'li',
      { dataset: { id: l.id }, role: 'option', tabindex: 0, style: `padding-left:${12 + depth * 14}px`, onclick: () => ((line = l), (ply = l.san.length), sync()), onkeydown: (e) => e.key === 'Enter' && (line = l, ply = l.san.length, sync()) },
      dot,
      h('span', { class: 'nm' }, l.sub || l.name),
      h('span', { class: 'eco' }, l.eco),
      h('span', { class: 'mv' }, moveText(l.san)),
    );
  };

  const filter = h('input', { type: 'search', placeholder: `Filter ${plural(fam.lines.length, 'line')}…`, 'aria-label': 'Filter lines' });
  let cap = 200;
  const moreBtn = h('button', { class: 'btn sm', style: 'margin:10px 0', onclick: () => ((cap += 400), fill()) });
  const fill = () => {
    const q = filter.value.trim().toLowerCase();
    const items = fam.lines.filter((l) => !q || l.name.toLowerCase().includes(q) || l.eco.toLowerCase() === q || l.san.join(' ').toLowerCase().includes(q));
    // keep the selected line visible even when it sits beyond the cap
    const idx = items.findIndex((l) => l.id === line.id);
    if (idx >= cap) cap = idx + 100;
    listEl.replaceChildren(...items.slice(0, cap).map(rowFor));
    for (const li of listEl.children) li.classList.toggle('cur', li.dataset.id === line.id);
    moreBtn.hidden = items.length <= cap;
    moreBtn.textContent = `Show more (${items.length - cap} more lines)`;
    countNote.textContent = q ? `${items.length} of ${fam.lines.length} lines match` : '';
    listEl.querySelector('.cur')?.scrollIntoView({ block: 'nearest' });
  };
  const countNote = h('div', { class: 'meta', style: 'margin:6px 2px' });
  filter.addEventListener('input', debounce(fill, 120));

  const left = h(
    'div',
    { class: 'left' },
    boardEl,
    now,
    h(
      'div',
      { class: 'nav-row' },
      h('button', { class: 'btn sm', title: 'Start', onclick: () => ((ply = 0), sync()) }, '⏮'),
      h('button', { class: 'btn sm', title: 'Back (←)', onclick: () => step(-1) }, '◀'),
      h('button', { class: 'btn sm', title: 'Forward (→)', onclick: () => step(1) }, '▶'),
      h('button', { class: 'btn sm', title: 'End', onclick: () => ((ply = line.san.length), sync()) }, '⏭'),
      h('button', { class: 'btn sm', onclick: () => board.flip() }, 'Flip'),
      h('a', { class: 'btn sm', href: `#/explorer?m=${encodeURIComponent(line.san.slice(0, ply).join(' '))}` }, 'Explore from here'),
    ),
    moves,
  );
  moves.style.marginTop = '14px';

  const right = h(
    'div',
    { class: 'right' },
    h('p', { class: 'crumb' }, h('a', { href: '#/' }, 'Openings'), ' / ', fam.name),
    h('h1', { class: 'title' }, fam.name),
    fam.blurb && h('p', { class: 'blurb' }, fam.blurb),
    h(
      'div',
      { class: 'meta' },
      h('span', { class: 'tag ' + (fam.side === 'white' ? 'w' : 'b') }, `Play as ${fam.side}`),
      fam.eco && h('span', { class: 'tag' }, fam.eco),
      h('span', {}, plural(fam.lines.length, 'line')),
      h('span', {}, `up to ${Math.ceil(fam.maxPly / 2)} moves deep`),
    ),
    progressBar(c.learned, fam.lines.length),
    h('div', { class: 'bar-label' }, h('span', {}, `${c.learned}/${fam.lines.length} learned`), h('span', {}, c.due ? `${c.due} due for review` : '')),
    h(
      'div',
      { class: 'actions' },
      h('a', { class: 'btn primary', href: `#/train/${fam.slug}?side=${fam.side}` }, `Drill all lines as ${fam.side === 'white' ? 'White' : 'Black'}`),
      h('a', { class: 'btn', href: `#/train/${fam.slug}?side=${fam.side === 'white' ? 'black' : 'white'}` }, `as ${fam.side === 'white' ? 'Black' : 'White'}`),
      c.due > 0 && h('a', { class: 'btn', href: `#/review?fam=${fam.slug}` }, `Review ${c.due} due`),
      trainLine,
    ),
    h('div', { class: 'field' }, filter),
    countNote,
    listEl,
    moreBtn,
  );

  root.replaceChildren(h('div', { class: 'split' }, left, right));
  fill();
  sync(false);
  return () => window.removeEventListener('keydown', onKey);
}
