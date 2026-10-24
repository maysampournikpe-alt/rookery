import { entries, dueEntries, streak, stars, exportProgress, importProgress, resetAll, LEARNED_BOX } from '../store.js';
import { h, download, toast, progressBar } from '../ui.js';

export function render(root) {
  const all = entries();
  const learned = all.filter(([, s]) => s.box >= LEARNED_BOX);
  const due = dueEntries().length;
  const tiles = [
    ['Lessons learned', String(learned.length), 'with a perfect run'],
    ['Ready to practice', String(due), due ? 'waiting for you' : 'all caught up'],
    ['Stars', String(stars()), 'perfect lessons'],
    ['Days in a row', String(streak()), 'keep it going'],
  ];
  const byOpening = new Map();
  for (const [, s] of all) {
    const fam = s.m?.fam;
    if (!fam) continue;
    const o = byOpening.get(fam) || { slug: s.m.slug, done: 0, tried: 0 };
    o.tried++;
    if (s.box >= LEARNED_BOX) o.done++;
    byOpening.set(fam, o);
  }
  const rows = [...byOpening].sort((a, b) => b[1].done - a[1].done);
  const importer = h('input', {
    type: 'file',
    accept: '.json',
    style: 'display:none',
    onchange: async (e) => {
      try {
        importProgress(await e.target.files[0].text());
        toast('Progress restored');
        render(root);
      } catch (err) {
        toast(err.message);
      }
    },
  });
  root.replaceChildren(
    h(
      'div',
      { style: 'padding-top:28px' },
      h('p', { class: 'crumb', style: 'margin:0' }, h('a', { href: '#/' }, '← All openings')),
      h('h1', { class: 'title' }, 'My progress'),
      due > 0 && h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/review' }, `Practice ${due} lesson${due > 1 ? 's' : ''}`)),
      h('div', { class: 'grid2' }, tiles.map(([k, v, sub]) => h('div', { class: 'panel' }, h('div', { class: 'meta' }, k), h('div', { class: 'big' }, v), h('div', { class: 'meta' }, sub)))),
      h(
        'div',
        { class: 'panel', style: 'margin-top:16px' },
        h('h3', {}, 'Openings you are learning'),
        rows.length
          ? h('ul', { class: 'list' }, rows.map(([fam, o]) => h('li', {}, h('span', {}, o.slug ? h('a', { href: `#/opening/${o.slug}` }, fam) : fam), h('span', { class: 'meta', style: 'flex:none' }, `${o.done} learned`))))
          : h('p', { style: 'color:var(--muted)' }, 'Finish a lesson and your opening shows up here.'),
      ),
      h(
        'div',
        { class: 'panel', style: 'margin-top:16px' },
        h('h3', {}, 'Your data'),
        h('p', { style: 'color:var(--muted)' }, 'Your progress is saved in this browser. Download a backup to move it to another device.'),
        h(
          'div',
          { class: 'actions' },
          h('button', { class: 'btn', onclick: () => download('rookery-progress.json', exportProgress(), 'application/json') }, 'Download backup'),
          h('button', { class: 'btn', onclick: () => importer.click() }, 'Restore backup'),
          h('button', { class: 'btn ghost', onclick: () => confirm('Erase all progress? This cannot be undone.') && (resetAll(), render(root)) }, 'Start over'),
          importer,
        ),
      ),
    ),
  );
}
