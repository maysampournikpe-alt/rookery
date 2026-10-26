import { Chess } from '../../vendor/chess.js';
import { D, START_FEN } from '../data.js';
import { Board } from '../board.js';
import { recordRun, discover, isDiscovered, isLearned, INTERVALS, dueEntries } from '../store.js';
import { coursesOf, buildCourse, tiersOf } from '../repertoire.js';
import { describeMove } from '../explain.js';
import { h, sleep } from '../ui.js';

const slugCache = new Map();
function famOf(l) {
  if (!slugCache.size) for (const f of D.families) for (const x of f.lines) slugCache.set(x.id, f);
  return slugCache.get(l.id);
}

const para = (t, cls) => h('p', cls ? { class: cls } : {}, t);

/* cfg: { entry:'learn'|'practice', mode, course, lessons(), side | sideFor(l), first, pick(prev, mode), label(l), backHref, backLabel, emptyTitle, emptyBody } */
function mount(root, cfg) {
  const game = new Chess();
  const S = { clean: 0 };
  let run = null;
  let dead = false;
  let onPrimary = null;

  const board = new Board(h('div'), {
    canMove: (sq) => run && !run.done && !run.busy && run.view === run.played.length && game.get(sq)?.color === run.side[0],
    getTargets: (sq) => game.moves({ square: sq, verbose: true }).map((m) => m.to),
    onMove: (f, t) => onUserMove(f, t),
  });

  const titleEl = h('h1', { class: 'pc-title' });
  const sideEl = h('span', { class: 'pc-side' });
  const bubble = h('div', { class: 'bubble', 'aria-live': 'polite' });
  const movesEl = h('div', { class: 'moves-list', 'aria-label': 'Moves so far' });
  const bar = h('i');
  const primary = h('button', { class: 'btn primary big block', type: 'button', onclick: () => onPrimary?.() });
  const hintBtn = h('button', { class: 'btn block', type: 'button', onclick: () => hint(true) }, '💡 Hint');
  const againBtn = h('button', { class: 'btn block', type: 'button', onclick: () => start(run?.target) }, '↺ Try again');
  const toolBtn = (label, aria, fn) => h('button', { type: 'button', 'aria-label': aria, onclick: fn }, label);
  const tStart = toolBtn('⏮', 'Start', () => view(-99));
  const tBack = toolBtn('◀', 'Back one move', () => view(-1));
  const tFwd = toolBtn('▶', 'Forward one move', () => view(1));
  const tEnd = toolBtn('⏭', 'Latest move', () => view(99));
  const card = h(
    'div',
    { class: 'panel-card' },
    h('div', { class: 'pc-head' }, h('a', { class: 'back', href: cfg.backHref || '#/', 'aria-label': cfg.backLabel || 'Back' }, '←'), titleEl, sideEl),
    h('div', { class: 'pc-body' }, h('div', { class: 'coach' }, h('div', { class: 'coach-av', 'aria-hidden': 'true' }, h('img', { src: 'pieces/wN.svg', alt: '' })), bubble), movesEl),
    h('div', { class: 'pc-foot' }, h('div', { class: 'progress', 'aria-hidden': 'true' }, bar), hintBtn, againBtn, primary, h('div', { class: 'pc-tools' }, tStart, tBack, tFwd, tEnd)),
  );

  const say = (kind, nodes) => {
    bubble.className = 'bubble ' + (kind || '');
    bubble.replaceChildren(...[].concat(nodes));
    bubble.scrollTop = 0;
    void bubble.offsetWidth;
    bubble.classList.add('pop');
  };
  const setPrimary = (label, fn, { disabled = false } = {}) => {
    primary.hidden = !label;
    primary.textContent = label || '';
    primary.disabled = disabled;
    onPrimary = fn || null;
  };

  const lessons = () => cfg.lessons();
  const turn = () => (game.turn() === 'w' ? 'white' : 'black');
  const finished = () => run.played.length >= run.target.san.length;
  const mode = () => cfg.mode;

  function drawMoves() {
    movesEl.replaceChildren();
    movesEl.hidden = mode() !== 'learn' || !run || !run.played.length;
    if (movesEl.hidden) return;
    const cells = [];
    run.played.forEach((m, i) => {
      if (i % 2 === 0) cells.push(h('span', { class: 'n' }, `${i / 2 + 1}.`));
      cells.push(h('span', { class: 'm' + (i + 1 === run.view ? ' cur' : '') }, m));
    });
    if (run.played.length % 2 === 1) cells.push(h('span', { class: 'm' }));
    movesEl.append(...cells);
    movesEl.scrollTop = movesEl.scrollHeight;
  }

  function drawProgress() {
    if (!run) return;
    bar.style.width = (run.played.length / run.target.san.length) * 100 + '%';
    tStart.disabled = tBack.disabled = run.view <= 0 || run.busy;
    tFwd.disabled = tEnd.disabled = run.view >= run.played.length || run.busy;
    drawMoves();
  }

  function setHeader() {
    titleEl.textContent = run ? cfg.label(run.target) : cfg.title || '';
    sideEl.textContent = mode() === 'learn' ? 'Learn' : 'Quiz';
  }

  function showButtons({ hint: showHint = false, again = false } = {}) {
    hintBtn.hidden = !showHint;
    againBtn.hidden = !again;
  }

  function empty() {
    run = null;
    board.locked = false;
    board.setArrows([]);
    board.setFen(START_FEN);
    movesEl.hidden = true;
    bar.style.width = '0';
    showButtons();
    const learn = mode() === 'learn';
    say('good', [para(learn ? 'You have seen every line here!' : cfg.emptyTitle), para(learn ? 'Nice work. Now take the quiz on each line so the moves stick.' : cfg.emptyBody)]);
    titleEl.textContent = cfg.title || cfg.course?.name || '';
    if (learn && cfg.entry !== 'practice' && cfg.lessons().some((l) => isDiscovered(l.id) && !isLearned(l.id))) setPrimary('Start the quiz', () => switchMode('practice'));
    else setPrimary(cfg.backLabel ? `Back` : 'Pick an opening', () => (location.hash = cfg.backHref || '#/'));
  }

  function start(target, newMode) {
    if (dead) return;
    if (newMode) cfg.mode = newMode;
    target = target || cfg.pick(run?.target, mode());
    if (!target) return empty();
    const side = cfg.side || cfg.sideFor(target);
    run = { target, side, played: [], fens: [START_FEN], lasts: [null], view: 0, firstBad: Infinity, fails: new Map(), done: false, busy: false, intro: null };
    game.reset();
    board.locked = false;
    board.setOrientation(side);
    board.setFen(START_FEN);
    setHeader();
    if (mode() === 'learn') {
      showButtons();
      const k = commonStart(target);
      for (let i = 0; i < k; i++) playMove(target.san[i], true);
      run.intro = k > 0 ? 'Same start as the lines you know. Watch what changes this time.' : cfg.course?.idea || null;
      drawProgress();
      stepLearn();
    } else {
      showButtons({ hint: true });
      setPrimary(null);
      drawProgress();
      advancePractice();
    }
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

  /* ---------- Learn: the coach tells you what to play, then explains what the opponent did ---------- */
  function stepLearn() {
    if (dead || !run) return;
    if (finished()) return completeLearn();
    if (turn() !== run.side) return opponentStep();
    const d = describeMove(game.fen(), run.target.san[run.played.length]);
    const parts = [];
    if (run.intro) parts.push(para(run.intro));
    parts.push(h('p', {}, h('strong', {}, d.instr)));
    parts.push(para(d.text(true)));
    run.intro = null;
    say('', parts);
    board.setArrows([[d.from, d.to]]);
    setPrimary('Continue', null, { disabled: true });
    drawProgress();
  }

  async function opponentStep() {
    run.busy = true;
    setPrimary('Continue', null, { disabled: true });
    drawProgress();
    await sleep(run.played.length ? 450 : 350);
    if (dead || run.done) return;
    const san = run.target.san[run.played.length];
    const d = describeMove(game.fen(), san);
    playMove(san);
    run.busy = false;
    if (finished()) return completeLearn(d.text(false));
    const parts = [];
    if (run.intro) parts.push(para(run.intro));
    parts.push(para(d.text(false)));
    run.intro = null;
    say('', parts);
    setPrimary('Continue', () => stepLearn());
    drawProgress();
  }

  function completeLearn(extra) {
    run.done = true;
    board.setArrows([]);
    discover(run.target.id, meta());
    say('good', [extra ? para(extra) : null, h('p', {}, h('strong', {}, "Great start! Now let's see if you can remember the moves."))].filter(Boolean));
    setPrimary('Start Quiz', () => switchMode('practice', run.target));
    showButtons();
    drawProgress();
    document.dispatchEvent(new CustomEvent('rookery:progress'));
  }

  /* ---------- Quiz: play it from memory ---------- */
  async function advancePractice() {
    if (dead || !run) return;
    if (finished()) return completePractice();
    if (turn() !== run.side) {
      run.busy = true;
      drawProgress();
      await sleep(run.played.length ? 450 : 300);
      if (dead || run.done) return;
      playMove(run.target.san[run.played.length]);
      run.busy = false;
      return advancePractice();
    }
    say('', para('Play the correct move'));
    drawProgress();
  }

  function completePractice() {
    run.done = true;
    const clean = run.firstBad === Infinity;
    const s = recordRun(run.target.id, clean, meta());
    const days = INTERVALS[s.box];
    if (clean) {
      S.clean++;
      say('good', [h('p', {}, h('strong', {}, 'Perfect! You earned a star ⭐')), para(days ? `You know this line. I will ask you again in ${days} day${days > 1 ? 's' : ''} so you remember it.` : 'You know this line.')]);
      burst();
    } else {
      say('', [h('p', {}, h('strong', {}, 'Line finished')), para('You slipped or used a hint this time. Play it again with no mistakes to earn a star.')]);
    }
    showButtons({ again: !clean });
    setPrimary('Continue', () => next());
    primary.focus();
    drawProgress();
    document.dispatchEvent(new CustomEvent('rookery:progress'));
  }

  /* ---------- moves from the player ---------- */
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
    board.setArrows([]);
    playMove(mv.san);
    if (mode() === 'learn') stepLearn();
    else advancePractice();
  }

  async function wrong(to, idx) {
    run.firstBad = Math.min(run.firstBad, idx);
    const n = (run.fails.get(idx) || 0) + 1;
    run.fails.set(idx, n);
    board.el.classList.remove('shake');
    void board.el.offsetWidth;
    board.el.classList.add('shake');
    const arrows = board.arrows;
    board.setFen(game.fen(), { last: run.lasts.at(-1) });
    board.setArrows(arrows);
    board.setMark(to, 'bad');
    if (mode() === 'learn') {
      const keep = [...bubble.childNodes].filter((n) => !n.classList?.contains('nudge'));
      bubble.replaceChildren(para('Not that one. Follow the arrow.', 'nudge'), ...keep);
    }
    else say('bad', [para('Not that one', 'nudge'), para(n === 1 ? 'Try a different move.' : 'Look for the glowing piece.')]);
    await sleep(450);
    if (dead || run.done) return;
    board.setFen(game.fen(), { last: run.lasts.at(-1) });
    board.setArrows(arrows);
    if (n >= 2 && mode() === 'practice') hint(false);
  }

  function hint(manual) {
    if (!run || run.done || run.busy || turn() !== run.side) return;
    const m = game.moves({ verbose: true }).find((x) => x.san === run.target.san[run.played.length]);
    if (manual) run.firstBad = Math.min(run.firstBad, run.played.length);
    if (m) board.setHint(m.from);
    if (manual) say('', [h('p', {}, h('strong', {}, 'Here is a hint')), para('Move the glowing piece. You can still finish the line, but a star needs no hints.')]);
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
    for (let i = 0; i < 10; i++) b.append(h('i', { style: `left:${10 + Math.random() * 80}%;top:${280 + Math.random() * 40}px;animation-delay:${Math.random() * 0.35}s` }, '⭐'));
    card.append(b);
    setTimeout(() => b.remove(), 1900);
  }

  function meta() {
    const t = run.target;
    return { san: t.san.join(' '), name: t.sub || t.name || '', fam: t.fam || famOf(t)?.name || '', slug: t.slug || famOf(t)?.slug || '', side: run.side };
  }

  // after a quiz: keep learning new lines (if you came to learn), otherwise keep practicing
  function next() {
    if (cfg.entry === 'learn') {
      const t = cfg.pick(run?.target, 'learn');
      if (t) {
        cfg.mode = 'learn';
        return start(t);
      }
    }
    cfg.mode = cfg.entry === 'learn' && cfg.pick(run?.target, 'practice') ? 'practice' : cfg.entry;
    start(cfg.pick(run?.target, cfg.mode));
  }

  function switchMode(m, target) {
    cfg.mode = m;
    start(target || cfg.pick(null, m), m);
  }

  const onKey = (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (e.key === 'Enter' && onPrimary && !primary.disabled && !primary.hidden) onPrimary();
    else if (e.key === 'ArrowLeft') view(-1);
    else if (e.key === 'ArrowRight') view(1);
  };
  window.addEventListener('keydown', onKey);

  const left = h('div', { class: 'left' }, board.el);
  root.replaceChildren(h('div', { class: 'split train' }, left, card));
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
  const entry = requested === 'practice' ? 'practice' : 'learn';
  const back = `#/course/${fam.slug}/${course.key}?side=${side}&tier=${tier}`;
  return mount(root, {
    entry,
    mode: isDiscovered(first.id) && requested !== 'learn' ? 'practice' : 'learn', // you cannot quiz a line you have not seen
    course,
    lessons: () => q,
    side,
    first,
    label: (l) => l.name.replace(new RegExp('^' + course.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':?\\s*'), '') || course.name,
    pick: (prev, mode) => pickFrom(q, prev, mode),
    backHref: back,
    backLabel: course.name,
    title: course.name,
    emptyTitle: 'All your lines are learned!',
    emptyBody: 'Come back when practice is due, or learn another variation.',
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
    entry: 'practice',
    mode: 'practice',
    course: { name: 'Practice' },
    lessons: queue,
    sideFor: (l) => l.side || 'white',
    label: (l) => (l.fam ? `${l.fam}: ${l.name || ''}`.replace(/: $/, '') : l.name),
    pick: (prev) => queue().find((l) => !prev || l.id !== prev.id) || null,
    backHref: '#/',
    backLabel: 'All openings',
    title: 'Practice',
    emptyTitle: 'All done for today! 🎉',
    emptyBody: 'Nothing to practice right now. Come back tomorrow, or learn a new opening.',
  });
}
