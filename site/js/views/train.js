import { Chess } from '../../vendor/chess.js';
import { D, START_FEN, nameFor } from '../data.js';
import { Board } from '../board.js';
import { recordRun, discover, isDiscovered, isLearned, INTERVALS, dueEntries, counts } from '../store.js';
import { coursesOf, buildCourse, tiersOf } from '../repertoire.js';
import { describeMove } from '../explain.js';
import { h, sleep, toast } from '../ui.js';

const slugCache = new Map();
function famOf(l) {
  if (!slugCache.size) for (const f of D.families) for (const x of f.lines) slugCache.set(x.id, f);
  return slugCache.get(l.id);
}

const CHEERS = ['Nice move!', 'Great!', 'Yes, that is it!', 'Right!', 'Good one!'];
const cheer = () => CHEERS[Math.floor(Math.random() * CHEERS.length)];
const para = (t, cls) => h('p', cls ? { class: cls } : {}, t);

/* cfg: { mode, hasModes, course:{name,idea}, lessons(), side | sideFor(l), first, pick(prev, mode), crumb, label(l), emptyTitle, emptyBody } */
function mount(root, cfg) {
  const game = new Chess();
  const S = { clean: 0 };
  let run = null;
  let dead = false;

  const board = new Board(h('div'), {
    canMove: (sq) => run && !run.done && !run.busy && run.view === run.played.length && game.get(sq)?.color === run.side[0],
    getTargets: (sq) => game.moves({ square: sq, verbose: true }).map((m) => m.to),
    onMove: (f, t) => onUserMove(f, t),
  });

  const modeLine = h('div', { class: 'modeline' });
  const titleEl = h('h1', { class: 'title', style: 'font-size:clamp(26px,3.2vw,38px);margin:2px 0 0' });
  const bubble = h('div', { class: 'bubble', 'aria-live': 'polite' });
  const dots = h('div', { class: 'dots', 'aria-hidden': 'true' });
  const nameBox = h('div', { class: 'now' });
  const session = h('div', { class: 'session' });
  const modes = h('div', { class: 'modes' });
  const hintBtn = h('button', { class: 'btn', onclick: () => hint(true) }, '💡 Hint');
  const showBtn = h('button', { class: 'btn', onclick: () => showMove() }, '👀 Show me');
  const againBtn = h('button', { class: 'btn', onclick: () => start(run?.target) }, '↺ Again');
  const practiceBtn = h('button', { class: 'btn primary big', onclick: () => switchMode('practice', run?.target) }, '🎯 Practice this line');
  const nextBtn = h('button', { class: 'btn big', onclick: () => next() }, 'Next line');
  const backBtn = h('button', { class: 'btn sm', 'aria-label': 'Back one move', onclick: () => view(-1) }, '◀');
  const fwdBtn = h('button', { class: 'btn sm', 'aria-label': 'Forward one move', onclick: () => view(1) }, '▶');
  const actions = h('div', { class: 'big-actions' });
  const status = h('div', { class: 'status' });

  const say = (kind, nodes) => {
    bubble.className = 'bubble ' + (kind || '');
    bubble.replaceChildren(...[].concat(nodes));
    bubble.scrollTop = 0;
    void bubble.offsetWidth;
    bubble.classList.add('pop');
  };
  const titled = (title, body) => [h('b', {}, title), body ? para(body) : null].filter(Boolean);

  const lessons = () => cfg.lessons();
  const turn = () => (game.turn() === 'w' ? 'white' : 'black');
  const finished = () => run.played.length >= run.target.san.length;
  const mode = () => cfg.mode;

  function drawModes() {
    modes.replaceChildren();
    if (!cfg.hasModes) return;
    const c = counts(lessons().map((l) => l.id));
    const card = (m, icon, name, sub, locked) =>
      h('button', { type: 'button', class: 'mode' + (mode() === m ? ' on' : '') + (locked ? ' locked' : ''), 'aria-pressed': String(mode() === m), onclick: () => (locked ? toast('Learn a line first, then you can practice it') : switchMode(m, run?.target)) }, h('span', { class: 'ic' }, locked ? '🔒' : icon), h('span', { class: 'tx' }, h('b', {}, name), h('small', {}, sub)));
    modes.append(card('learn', '📖', 'Learn', `${c.discovered} of ${c.total} lines seen`, false), card('practice', '🎯', 'Practice', c.discovered ? `${c.learned} of ${c.total} lines learned` : 'Learn a line to unlock', !c.discovered));
  }

  function drawHeader() {
    const q = lessons();
    const i = q.findIndex((l) => l.id === run?.target.id);
    modeLine.replaceChildren(h('span', { class: 'ml' }, mode() === 'learn' ? '📖 Learn' : '🎯 Practice'), h('span', { class: 'mc' }, cfg.course?.name || ''), i >= 0 ? h('span', { class: 'mn' }, `#${i + 1} of ${q.length}`) : null);
    titleEl.textContent = run ? cfg.label(run.target) : cfg.title || '';
  }

  function drawProgress() {
    if (!run) return;
    dots.replaceChildren(...Array.from({ length: run.target.san.length }, (_, i) => h('i', { class: i < run.played.length ? 'done' : i === run.played.length ? 'cur' : '' })));
    const nm = run.played.length ? nameFor(run.played, game.fen()) : null;
    nameBox.replaceChildren(h('b', {}, nm ? nm.line.fam : 'Starting position'), h('span', {}, run.played.length ? `${Math.ceil(run.played.length / 2)} move${run.played.length > 2 ? 's' : ''} played` : 'Nothing played yet'));
    session.textContent = S.clean ? `⭐ ${S.clean} perfect ${S.clean === 1 ? 'line' : 'lines'} this visit` : '';
    backBtn.disabled = run.view <= 0 || run.busy;
    fwdBtn.disabled = run.view >= run.played.length || run.busy;
  }

  function setButtons(state) {
    const show = (b, v) => (b.hidden = !v);
    show(hintBtn, state === 'play');
    show(showBtn, state === 'play' && mode() === 'practice');
    show(againBtn, state === 'play' || state === 'done' || state === 'learned');
    show(practiceBtn, state === 'learned');
    show(nextBtn, state === 'done' || state === 'learned');
    againBtn.textContent = state === 'learned' ? '↺ Watch again' : '↺ Again';
    nextBtn.className = 'btn big' + (state === 'done' ? ' primary' : '');
  }

  function empty() {
    run = null;
    board.locked = false;
    board.setFen(START_FEN);
    dots.replaceChildren();
    nameBox.replaceChildren();
    drawModes();
    const learnMode = mode() === 'learn';
    say('good', [h('b', {}, learnMode ? 'You have seen every line here' : cfg.emptyTitle), para(learnMode ? 'Nice work! Now practice them one by one, so they stick.' : cfg.emptyBody)]);
    actions.replaceChildren(learnMode && cfg.hasModes ? h('button', { class: 'btn primary big', onclick: () => switchMode('practice') }, '🎯 Practice the lines') : h('a', { class: 'btn primary big', href: cfg.backHref || '#/' }, cfg.backLabel || 'Pick an opening'));
  }

  function start(target, newMode) {
    if (dead) return;
    if (newMode) cfg.mode = newMode;
    target = target || cfg.pick(run?.target, mode());
    if (!target) return empty();
    const side = cfg.side || cfg.sideFor(target);
    run = { target, side, played: [], fens: [START_FEN], lasts: [null], view: 0, firstBad: Infinity, fails: new Map(), done: false, busy: false, intro: null, theirText: null };
    game.reset();
    board.locked = false;
    board.setOrientation(side);
    board.setFen(START_FEN);
    actions.replaceChildren(hintBtn, showBtn, againBtn, practiceBtn, nextBtn);
    setButtons('play');
    drawHeader();
    drawModes();
    if (mode() === 'learn') {
      const k = commonStart(target);
      for (let i = 0; i < k; i++) playMove(target.san[i], true);
      run.intro = k > 0 ? 'Same start as the lines you know. Watch what changes this time.' : cfg.course?.idea || null;
    } else {
      say('', titled(side === 'white' ? 'You play White' : 'You play Black', side === 'white' ? 'How do we start this opening? Drag a piece, or tap it and tap where it goes.' : 'Your coach moves first. Then it is your turn.'));
    }
    drawProgress();
    advance();
  }

  // how many moves this line shares with a line you already know (so we only teach what is new)
  function commonStart(target) {
    let best = 0;
    for (const l of lessons()) {
      if (l.id === target.id || !isDiscovered(l.id)) continue;
      let i = 0;
      while (i < l.san.length && i < target.san.length && l.san[i] === target.san[i]) i++;
      best = Math.max(best, i);
    }
    return Math.min(best, target.san.length - 1);
  }

  function playMove(san, instant) {
    const mv = game.move(san);
    run.played.push(san);
    run.fens.push(game.fen());
    run.lasts.push([mv.from, mv.to]);
    run.view = run.played.length;
    board.locked = false;
    board.setFen(game.fen(), { last: [mv.from, mv.to], animate: !instant });
    if (!instant) drawProgress();
    return mv;
  }

  async function advance() {
    if (dead || !run) return;
    if (finished()) return mode() === 'learn' ? completeLearn() : completePractice();
    if (turn() !== run.side) {
      run.busy = true;
      drawProgress();
      await sleep(run.played.length ? 650 : 450);
      if (dead || run.done) return;
      const san = run.target.san[run.played.length];
      if (mode() === 'learn') run.theirText = describeMove(game.fen(), san).text(false);
      playMove(san);
      run.busy = false;
      return advance();
    }
    if (mode() === 'learn') learnPrompt();
    else if (run.played.length) say('', titled('Your turn', 'How do we continue this opening?'));
    drawProgress();
  }

  function learnPrompt(nudge) {
    const d = describeMove(game.fen(), run.target.san[run.played.length]);
    const parts = [];
    if (nudge) parts.push(para(nudge, 'nudge'));
    if (run.intro) parts.push(para(run.intro));
    if (run.theirText) parts.push(para(run.theirText));
    parts.push(para(d.text(true)));
    parts.push(h('p', { class: 'play' }, h('strong', {}, d.instr)));
    say('', parts);
    if (!nudge) {
      run.intro = null;
      run.theirText = null;
    }
  }

  async function onUserMove(from, to) {
    if (!run || run.done || run.busy || turn() !== run.side) return;
    const p = game.get(from);
    let promotion;
    if (p?.type === 'p' && (to[1] === '8' || to[1] === '1')) promotion = await board.askPromotion(p.color, to);
    let mv;
    try {
      mv = game.move({ from, to, promotion });
    } catch {
      return board.setFen(game.fen(), { last: run.lasts.at(-1) });
    }
    const idx = run.played.length;
    game.undo();
    if (run.target.san[idx] !== mv.san) return wrong(to, idx);
    playMove(mv.san);
    if (mode() === 'practice' && !finished()) say('good', titled(cheer(), ''));
    advance();
  }

  async function wrong(to, idx) {
    run.firstBad = Math.min(run.firstBad, idx);
    const n = (run.fails.get(idx) || 0) + 1;
    run.fails.set(idx, n);
    board.el.classList.remove('shake');
    void board.el.offsetWidth;
    board.el.classList.add('shake');
    board.setFen(game.fen(), { last: run.lasts.at(-1) });
    board.setMark(to, 'bad');
    if (mode() === 'learn') learnPrompt('Not that one. Follow the coach:');
    else say('bad', titled('Not that one', n === 1 ? 'Try a different move.' : 'Look for the glowing piece.'));
    await sleep(450);
    if (dead || run.done) return;
    board.setFen(game.fen(), { last: run.lasts.at(-1) });
    if (n >= 2 || mode() === 'learn') hint(false);
  }

  function hint(manual) {
    if (!run || run.done || run.busy || turn() !== run.side) return;
    const m = game.moves({ verbose: true }).find((x) => x.san === run.target.san[run.played.length]);
    if (mode() === 'practice' && manual) run.firstBad = Math.min(run.firstBad, run.played.length);
    if (m) board.setHint(m.from);
    if (manual && mode() === 'practice') say('', titled('Here is a hint', 'Move the glowing piece. You can still finish the line, but a star needs no hints.'));
  }

  function showMove() {
    if (!run || run.done || run.busy || turn() !== run.side) return;
    run.firstBad = Math.min(run.firstBad, run.played.length);
    playMove(run.target.san[run.played.length]);
    advance();
  }

  function view(d) {
    if (!run || run.busy) return;
    run.view = Math.max(0, Math.min(run.played.length, run.view + d));
    board.locked = run.view !== run.played.length;
    board.setFen(run.fens[run.view], { last: run.lasts[run.view] });
    drawProgress();
  }

  function burst() {
    const b = h('div', { class: 'burst', 'aria-hidden': 'true' });
    for (let i = 0; i < 10; i++) b.append(h('i', { style: `left:${10 + Math.random() * 80}%;top:${260 + Math.random() * 40}px;animation-delay:${Math.random() * 0.35}s` }, '⭐'));
    status.append(b);
    setTimeout(() => b.remove(), 1900);
  }

  function meta() {
    const t = run.target;
    return { san: t.san.join(' '), name: t.sub || t.name || '', fam: t.fam || famOf(t)?.name || '', slug: t.slug || famOf(t)?.slug || '', side: run.side };
  }

  function completeLearn() {
    run.done = true;
    discover(run.target.id, meta());
    const left = lessons().filter((l) => !isDiscovered(l.id)).length;
    say('good', [h('b', {}, 'You learned this line!'), para(left ? `${left} more ${left === 1 ? 'line' : 'lines'} to discover in this variation. But first, try this one yourself.` : 'That was the last line in this variation. Now practice them so they stick.')]);
    setButtons('learned');
    nextBtn.hidden = left === 0;
    drawProgress();
    drawModes();
    document.dispatchEvent(new CustomEvent('rookery:progress'));
  }

  function completePractice() {
    run.done = true;
    const clean = run.firstBad === Infinity;
    const s = recordRun(run.target.id, clean, meta());
    const days = INTERVALS[s.box];
    if (clean) {
      S.clean++;
      say('good', titled('Perfect! You earned a star ⭐', `You know ${cfg.label(run.target)}. ${days ? `I will ask you again in ${days} day${days > 1 ? 's' : ''} so you remember it.` : ''}`));
      burst();
    } else {
      say('', titled('Line finished', 'You slipped or used a hint this time. Play it again with no mistakes to earn a star.'));
    }
    setButtons('done');
    againBtn.hidden = clean;
    nextBtn.focus();
    drawProgress();
    drawModes();
    document.dispatchEvent(new CustomEvent('rookery:progress'));
  }

  function next() {
    start(cfg.pick(run?.target, mode()));
  }

  function switchMode(m, target) {
    if (m === 'practice' && cfg.hasModes && !counts(lessons().map((l) => l.id)).discovered) return toast('Learn a line first');
    cfg.mode = m;
    // keep the current line if it fits the mode, otherwise find the next one that does
    const fits = (l) => (m === 'learn' ? true : isDiscovered(l.id));
    start(target && fits(target) ? target : cfg.pick(target, m));
  }

  const onKey = (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (e.key === 'Enter' && run?.done) mode() === 'learn' ? switchMode('practice', run.target) : next();
    else if (e.key === 'ArrowLeft') view(-1);
    else if (e.key === 'ArrowRight') view(1);
  };
  window.addEventListener('keydown', onKey);

  status.append(cfg.crumb, modeLine, titleEl, h('div', { class: 'coach' }, h('div', { class: 'coach-av', 'aria-hidden': 'true' }, h('img', { src: 'pieces/wN.svg', alt: '' })), bubble), actions, modes, session);
  const left = h('div', { class: 'left' }, board.el, h('div', { class: 'under' }, dots, h('div', { class: 'arrows' }, backBtn, fwdBtn)), nameBox);
  root.replaceChildren(h('div', { class: 'split train' }, left, status));
  start(cfg.first);
  return () => {
    dead = true;
    window.removeEventListener('keydown', onKey);
  };
}

// next line after `prev` (wrapping) that suits the mode: unseen lines for Learn, seen-but-not-yet-learned for Practice
function pickFrom(queue, prev, mode) {
  if (!queue.length) return null;
  const i = prev ? queue.findIndex((l) => l.id === prev.id) : -1;
  const order = [...queue.slice(i + 1), ...queue.slice(0, Math.max(i + 1, 0))].filter((l) => !prev || l.id !== prev.id);
  const ok = (l) => (mode === 'learn' ? !isDiscovered(l.id) : isDiscovered(l.id) && !isLearned(l.id));
  return order.find(ok) || (prev && ok(prev) ? prev : null);
}

export function render(root, { slug, query }) {
  const fam = D.famBySlug.get(slug);
  if (!fam) return root.replaceChildren(h('div', { class: 'empty' }, 'We could not find that opening.', h('div', {}, h('a', { class: 'btn primary', href: '#/' }, 'See all openings'))));
  const side = query.get('side') || fam.side;
  const courses = coursesOf(fam);
  const course = courses.find((c) => c.key === query.get('course')) || courses[0];
  const tiers = tiersOf(fam, course, side);
  const tier = tiers.some((t) => t.key === query.get('tier')) ? query.get('tier') : tiers[0].key;
  const built = buildCourse(fam, course, side, tier);
  const q = built.leaves;
  const first = q.find((l) => l.id === query.get('line')) || q.find((l) => !isDiscovered(l.id)) || q.find((l) => !isLearned(l.id)) || q[0];
  const requested = query.get('mode');
  const wanted = requested === 'learn' || requested === 'practice' ? requested : isDiscovered(first.id) ? 'practice' : 'learn';
  const back = `#/course/${fam.slug}/${course.key}?side=${side}&tier=${tier}`;
  return mount(root, {
    mode: isDiscovered(first.id) ? wanted : 'learn', // you cannot practice a line you have not seen
    hasModes: true,
    course,
    lessons: () => q,
    side,
    first,
    label: (l) => l.name,
    pick: (prev, mode) => pickFrom(q, prev, mode),
    crumb: h('p', { class: 'crumb', style: 'margin:0' }, h('a', { href: back }, `← ${course.name}`)),
    emptyTitle: 'All your lines are learned!',
    emptyBody: 'Come back when practice is due, or learn another variation.',
    backHref: back,
    backLabel: 'Back to this variation',
  });
}

// lessons that are due for practice, rebuilt from what the store remembers about them
function dueLessons(famFilter) {
  const out = [];
  for (const { id, m } of dueEntries()) {
    if (m?.san) {
      if (famFilter && m.slug !== famFilter) continue;
      out.push({ id, san: m.san.split(' '), sub: m.name, name: m.name, fam: m.fam, slug: m.slug, side: m.side });
    } else {
      const l = D.byId.get(id);
      const f = l && famOf(l);
      if (l && f && (!famFilter || f.slug === famFilter)) out.push({ ...l, name: l.sub || l.name, fam: f.name, slug: f.slug, side: f.side });
    }
  }
  return out;
}

export function renderReview(root, { query }) {
  const famFilter = query.get('fam');
  const queue = () => dueLessons(famFilter);
  return mount(root, {
    mode: 'practice',
    hasModes: false,
    course: { name: 'Practice' },
    lessons: queue,
    sideFor: (l) => l.side || 'white',
    label: (l) => l.name || l.fam,
    pick: (prev) => queue().find((l) => !prev || l.id !== prev.id) || null,
    crumb: h('p', { class: 'crumb', style: 'margin:0' }, h('a', { href: '#/' }, '← All openings')),
    title: 'Practice',
    emptyTitle: 'All done for today! 🎉',
    emptyBody: 'Nothing to practice right now. Come back tomorrow, or learn a new opening.',
  });
}
