import { loadData, D } from './data.js';
import { counts, streak, onChange, settings, setSetting } from './store.js';
import { h } from './ui.js';

const app = document.getElementById('app');
let destroy = null;

const routes = [
  [/^$|^\/$|^\/openings$/, 'home', () => import('./views/home.js')],
  [/^\/opening\/([^/]+)$/, 'home', () => import('./views/opening.js')],
  [/^\/course\/([^/]+)\/([^/]+)$/, 'home', () => import('./views/course.js')],
  [/^\/train\/([^/]+)$/, 'home', () => import('./views/train.js')],
  [/^\/crush(?:\/([^/]+))?$/, 'crush', () => import('./views/crush.js')],
  [/^\/traps$/, 'crush', () => import('./views/crush.js')],
  [/^\/traps\/([^/]+)(?:\/([^/]+))?$/, 'crush', () => import('./views/trapbrowse.js')],
  [/^\/variation\/([^/]+)\/([^/]+)$/, 'home', () => import('./views/variation.js')],
  [/^\/review$/, 'review', () => import('./views/train.js'), 'renderReview'],
  [/^\/explorer$/, 'explorer', () => import('./views/explorer.js')],
  [/^\/import$/, 'import', () => import('./views/import.js')],
  [/^\/stats$/, 'stats', () => import('./views/stats.js')],
];

function chrome() {
  const due = counts(D.lines.map((l) => l.id)).due;
  const b = document.getElementById('dueBadge');
  b.hidden = !due;
  b.textContent = due;
  document.querySelector('#streak b').textContent = streak();
}

async function route() {
  document.getElementById('moreMenu').open = false;
  const [path, qs = ''] = location.hash.replace(/^#/, '').split('?');
  const query = new URLSearchParams(qs);
  destroy?.();
  destroy = null;
  for (const [re, nav, load, fn = 'render'] of routes) {
    const m = path.match(re);
    if (!m) continue;
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.nav === nav));
    const mod = await load();
    window.scrollTo(0, 0);
    const out = await mod[fn](app, { slug: m[1] && decodeURIComponent(m[1]), key: m[2] && decodeURIComponent(m[2]), query });
    destroy = typeof out === 'function' ? out : null;
    chrome();
    app.focus({ preventScroll: true });
    return;
  }
  app.replaceChildren(h('div', { class: 'empty' }, 'Page not found. ', h('a', { href: '#/' }, 'Go home')));
}

function applyBoard() {
  const b = settings().board || 'blue';
  document.documentElement.dataset.board = b;
  document.querySelectorAll('#boards button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.board === b)));
}
document.getElementById('boards').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-board]');
  if (!b) return;
  setSetting('board', b.dataset.board);
  applyBoard();
});

function applyTheme() {
  const t = settings().theme;
  document.documentElement.dataset.theme = t;
}

document.getElementById('themeBtn').addEventListener('click', () => {
  const dark = getComputedStyle(document.documentElement).colorScheme === 'dark';
  setSetting('theme', dark ? 'light' : 'dark');
  applyTheme();
});

document.addEventListener('rookery:progress', chrome);
onChange(chrome);
applyTheme();
applyBoard();

app.replaceChildren(h('div', { class: 'empty' }, 'Loading opening lines…'));
try {
  await loadData();
  window.addEventListener('hashchange', route);
  await route();
} catch (e) {
  console.error(e);
  app.replaceChildren(h('div', { class: 'empty' }, 'Could not load opening data. If you opened this file directly, serve the folder over HTTP (npm run dev).'));
}
