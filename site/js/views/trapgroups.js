// Traps of one opening as study-like panels: a heading per variation and a numbered list of trap chapters.
import { counts } from '../store.js';
import { trapGroups, buildCourse, tiersOf, defaultTier } from '../repertoire.js';
import { h } from '../ui.js';

const WORD = { Mate: 'checkmate', Fork: 'fork', Queen: 'wins the queen', Rook: 'wins a rook', Piece: 'wins a piece' };

export function trapPanels(fam, keep = () => true) {
  return trapGroups(fam).map((g) => {
    const rows = g.chapters
      .filter((c) => keep(c, c.course.side || fam.side))
      .map((c, i) => {
        const side = c.course.side || fam.side;
        const dt = defaultTier(tiersOf(fam, c.course, side));
        const k = counts(buildCourse(fam, c.course, side, dt.key).leaves.map((l) => l.id));
        return h(
          'a',
          { class: 'tchap', href: `#/course/${fam.slug}/${c.course.key}?side=${side}&tier=${dt.key}`, 'aria-label': `${c.title}, a trap against the ${fam.name}` },
          h('b', {}, String(i + 1)),
          h('span', { class: 'nm' }, c.title),
          h('span', { class: 'tag' }, `${WORD[c.tag]} · ${side === 'white' ? 'White' : 'Black'}`),
          k.total && k.learned >= k.total ? h('i', { class: 'ok', title: 'Learned' }, '✓') : null,
        );
      });
    if (!rows.length) return null;
    const heading = g.name === 'Famous traps' ? `Famous traps against the ${fam.name}` : g.name === 'Main line' ? `Traps against the ${fam.name}` : `Traps against the ${g.name}`;
    return h('section', { class: 'tgroup' }, h('h3', {}, heading), h('div', { class: 'tlist' }, ...rows));
  }).filter(Boolean);
}
