import { D } from '../data.js';
import { counts, streak, xp, exportProgress, importProgress, resetAll, LEARNED_BOX, MASTERED_BOX, lineState } from '../store.js';
import { h, download, toast, progressBar, plural } from '../ui.js';

export function render(root) {
  const all = counts(D.lines.map((l) => l.id));
  const mastered = D.lines.filter((l) => lineState(l.id).box >= MASTERED_BOX).length;
  const byVol = ['A', 'B', 'C', 'D', 'E'].map((v) => {
    const ls = D.lines.filter((l) => l.eco[0] === v);
    return { v, ...counts(ls.map((l) => l.id)) };
  });
  const names = { A: 'Flank & irregular', B: 'Semi-open (1.e4)', C: 'Open games & French', D: 'Closed & Queen\'s Gambit', E: 'Indian defences' };
  const tiles = [
    ['Lines learned', `${all.learned}`, `of ${D.lines.length.toLocaleString()}`],
    ['Due now', `${all.due}`, all.due ? 'ready for review' : 'all caught up'],
    ['Mastered', `${mastered}`, 'long intervals'],
    ['Streak', `${streak()}`, `day${streak() === 1 ? '' : 's'} · ${xp()} XP`],
  ];

  const fams = D.families
    .map((f) => ({ f, c: counts(f.lines.map((l) => l.id)) }))
    .filter((x) => x.c.started)
    .sort((a, b) => b.c.learned / b.f.lines.length - a.c.learned / a.f.lines.length)
    .slice(0, 12);

  const importer = h('input', { type: 'file', accept: '.json', style: 'display:none', onchange: async (e) => {
    try {
      importProgress(await e.target.files[0].text());
      toast('Progress restored');
      render(root);
    } catch (err) {
      toast(err.message);
    }
  } });

  root.replaceChildren(
    h(
      'div',
      { style: 'padding-top:28px' },
      h('p', { class: 'crumb', style: 'margin:0' }, 'Progress'),
      h('h1', { class: 'title' }, 'Your repertoire'),
      all.due > 0 && h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/review' }, `Review ${all.due} due line${all.due > 1 ? 's' : ''}`)),
      h('div', { class: 'grid2' }, tiles.map(([k, v, s]) => h('div', { class: 'panel' }, h('div', { class: 'meta' }, k), h('div', { class: 'big' }, v), h('div', { class: 'meta' }, s)))),
      h(
        'div',
        { class: 'grid2' },
        h('div', { class: 'panel' }, h('h3', {}, 'By ECO volume'), ...byVol.map((x) => h('div', { style: 'margin-top:14px' }, h('div', { class: 'bar-label', style: 'margin:0' }, h('span', {}, `${x.v} · ${names[x.v]}`), h('span', {}, `${x.learned}/${x.total}`)), progressBar(x.learned, x.total)))),
        h(
          'div',
          { class: 'panel' },
          h('h3', {}, 'Openings in progress'),
          fams.length
            ? h('ul', { class: 'list' }, fams.map(({ f, c }) => h('li', {}, h('span', {}, h('a', { href: `#/opening/${f.slug}` }, f.name)), h('span', { class: 'meta', style: 'flex:none' }, `${c.learned}/${f.lines.length}`))))
            : h('p', { style: 'color:var(--muted)' }, 'Train a line and it will appear here.'),
        ),
      ),
      h(
        'div',
        { class: 'panel', style: 'margin-top:16px' },
        h('h3', {}, 'Your data'),
        h('p', { style: 'color:var(--muted)' }, 'Progress is saved in this browser. Export a backup to move it between devices.'),
        h(
          'div',
          { class: 'actions' },
          h('button', { class: 'btn', onclick: () => download('rookery-progress.json', exportProgress(), 'application/json') }, 'Export progress'),
          h('button', { class: 'btn', onclick: () => importer.click() }, 'Import progress'),
          h('button', { class: 'btn ghost', onclick: () => confirm('Erase all progress? This cannot be undone.') && (resetAll(), render(root)) }, 'Reset'),
          importer,
        ),
      ),
    ),
  );
}
