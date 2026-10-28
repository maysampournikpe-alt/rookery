// A variation with its own page, like an opening: one card per sub-variation (the Najdorf -> English Attack, 6.Bg5 ...).
import { D } from '../data.js';
import { findCourse, subCoursesOf, trapsInLine, crushTitle } from '../repertoire.js';
import { courseCard } from './cards.js';
import { h } from '../ui.js';

export function render(root, { slug, key, query }) {
  const fam = D.famBySlug.get(slug);
  const side0 = query.get('side') || fam?.side;
  const course = fam && findCourse(fam, key, side0);
  if (!course) return void root.replaceChildren(h('div', { class: 'empty' }, 'We could not find that variation.', h('div', {}, h('a', { class: 'btn primary', href: fam ? `#/opening/${fam.slug}` : '#/' }, 'Back'))));
  const side = query.get('side') || fam.side;
  const crush = query.get('crush') === '1';
  const subs = subCoursesOf(fam, course, side);
  const traps = (c) => trapsInLine(fam, c, side).length;
  const extra = (c) => (traps(c) ? ` · ${traps(c)} trap${traps(c) > 1 ? 's' : ''}` : '');
  root.replaceChildren(
    h(
      'div',
      { style: 'padding-top:6px' },
      h('p', { class: 'crumb' }, h('a', { href: crush ? `#/against/${fam.slug}` : `#/opening/${fam.slug}?side=${side}` }, `← ${crush ? 'Playing against the ' : ''}${fam.name}`)),
      h("h1", { class: "title" }, crush ? crushTitle(course.name) : course.name),
      h('p', { class: 'blurb' }, crush ? `${crushTitle(course.name)}: how to beat the ${fam.name} here. You play ${side === 'white' ? 'White' : 'Black'}.` : course.idea),
      h('div', { class: 'section-h', style: 'margin-top:8px' }, h('h2', {}, 'Pick a line'), h('span', {}, `${subs.length + 1} to choose from`)),
      h('div', { class: 'cards' }, courseCard(fam, { ...course, key: course.key }, side, { title: 'All lines', text: `Every line of the ${course.name} together.`, extra: extra(course), crush, noSubs: true }), ...subs.map((c) => courseCard(fam, c, side, { extra: extra(c), crush }))),
    ),
  );
}
