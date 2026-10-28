// The card used for variations everywhere: a board, a name, a line of text, the count and a Start button.
import { fenAfter } from '../data.js';
import { drawMini } from '../board.js';
import { counts } from '../store.js';
import { buildCourse, tiersOf, defaultTier, subCoursesOf } from '../repertoire.js';
import { h } from '../ui.js';

export function courseCard(fam, course, side, { title, text, extra = '', crush = false, noSubs = false } = {}) {
  const tiers = tiersOf(fam, course, side);
  const dt = defaultTier(tiers);
  const built = buildCourse(fam, course, side, dt.key);
  const biggest = tiers.at(-1).count;
  const c = counts(built.leaves.map((l) => l.id));
  const subs = noSubs || course.key.includes('~') ? [] : subCoursesOf(fam, course, side);
  const q = `side=${side}${crush ? '&crush=1' : ''}`;
  const href = subs.length ? `#/variation/${fam.slug}/${course.key}?${q}` : `#/course/${fam.slug}/${course.key}?${q}&tier=${dt.key}`;
  const canvas = h('canvas', { 'aria-hidden': 'true' });
  requestAnimationFrame(() => drawMini(canvas, fenAfter(course.path), side));
  const bar = h('div', { class: 'bar' }, h('i'));
  requestAnimationFrame(() => (bar.firstChild.style.width = (c.total ? (c.learned / c.total) * 100 : 0) + '%'));
  return h(
    'a',
    { class: 'ocard', href, 'aria-label': `${title || course.name}, ${c.learned} of ${c.total} lines learned` },
    canvas,
    h(
      'div',
      { class: 'body' },
      h('h3', {}, title || course.name),
      h('p', {}, text || course.idea),
      h('div', { class: 'count' }, `${subs.length ? `${subs.length} lines to pick from · ` : ''}${biggest} ${biggest === 1 ? 'line' : 'lines'}${extra} · ${c.learned} learned`),
      h('div', { class: 'go' }, bar, h('span', { class: 'play' }, c.discovered === 0 ? 'Start' : c.learned >= c.total ? 'Practice' : 'Continue')),
    ),
  );
}
