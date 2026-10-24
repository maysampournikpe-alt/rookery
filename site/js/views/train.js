import { Chess } from '../../vendor/chess.js';
import { D, START_FEN, nameFor } from '../data.js';
import { Board } from '../board.js';
import { lineState, recordRun, isLearned, INTERVALS, dueEntries } from '../store.js';
import { coursesOf, buildCourse } from '../repertoire.js';
import { h, moveText, sleep } from '../ui.js';

const slugCache = new Map();
function famOf(l) {
  if (!slugCache.size) for (const f of D.families) for (const x of f.lines) slugCache.set(x.id, f);
  return slugCache.get(l.id);
}

const CHEERS = ['Nice move!', 'Great!', 'Yes, that is it!', 'Right!', 'Good one!'];
const cheer = () => CHEERS[Math.floor(Math.random() * CHEERS.length)];

// cfg: {title, crumb, queue, side | sideFor(line), emptyTitle, emptyBody, first, allowSide}
function mount(root, cfg) {
  const game = new Chess();
  const S = { clean: 0 };
  let run = null;
  let last = null;
  let dead = false;

  const board = new Board(h('div'), {
    canMove: (sq) => run && !run.done && !run.busy && game.get(sq)?.color === run.side[0],
    getTargets: (sq) => game.moves({ square: sq, verbose: true }).map((m) => m.to),
    onMove: (f, t) => onUserMove(f, t),
  });

  const titleEl = h('h1', { class: 'title', style: 'font-size:clamp(28px,3.6vw,42px);margin:4px 0 0' }, cfg.title);
  const subEl = h('div', { style: 'color:var(--muted)' });
  const bubble = h('div', { class: 'bubble', 'aria-live': 'polite' });
  const dots = h('div', { class: 'dots', 'aria-hidden': 'true' });
  const nameBox = h('div', { class: 'now' });
  const session = h('div', { class: 'session' });
  const hintBtn = h('button', { class: 'btn', onclick: () => hint(true) }, '💡 Hint');
  const showBtn = h('button', { class: 'btn', onclick: () => showMove() }, '👀 Show me');
  const againBtn = h('button', { class: 'btn', onclick: () => start(run?.target) }, '↺ Try again');
  const nextBtn = h('button', { class: 'btn primary big', onclick: () => next() }, 'Next lesson');
  const sideSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'You play' });
  const status = h('div', { class: 'status' });

  function say(kind, title, body) {
    bubble.className = 'bubble ' + (kind || '');
    bubble.replaceChildren(h('b', {}, title), body || '');
    void bubble.offsetWidth;
    bubble.classList.add('pop');
  }

  function drawSide() {
    if (!cfg.allowSide) return sideSeg.replaceChildren();
    sideSeg.replaceChildren(
      h('span', { style: 'padding:0 10px 0 12px;align-self:center;color:var(--muted);font-size:14px' }, 'You play'),
      ...['white', 'black'].map((s) => h('button', { type: 'button', 'aria-pressed': String(run?.side === s), onclick: () => ((cfg.side = s), start(run?.target)) }, h('img', { src: `pieces/${s === 'white' ? 'w' : 'b'}K.svg`, alt: '' }), s === 'white' ? 'White' : 'Black')),
    );
  }

  function drawProgress() {
    if (!run) return;
    dots.replaceChildren(...Array.from({ length: run.target.san.length }, (_, i) => h('i', { class: i < run.played.length ? 'done' : i === run.played.length ? 'cur' : '' })));
    const nm = run.played.length ? nameFor(run.played, game.fen()) : null;
    nameBox.replaceChildren(h('b', {}, nm ? nm.line.fam : 'Starting position'), h('span', {}, run.played.length ? moveText(run.played) : 'Nothing played yet'));
    const q = cfg.queue();
    const i = q.findIndex((l) => l.id === run.target.id);
    subEl.textContent = cfg.counter ? cfg.counter(q, i) : '';
    session.textContent = S.clean ? `⭐ ${S.clean} perfect ${S.clean === 1 ? 'lesson' : 'lessons'} this visit` : '';
  }

  function start(target) {
    if (dead) return;
    target = target || cfg.pick(run?.target);
    if (!target) {
      board.setFen(START_FEN);
      say('good', cfg.emptyTitle, cfg.emptyBody);
      dots.replaceChildren();
      nameBox.replaceChildren();
      [hintBtn, showBtn, againBtn, nextBtn].forEach((b) => (b.hidden = true));
      status.append(h('div', { class: 'big-actions' }, h('a', { class: 'btn primary big', href: '#/' }, 'Pick an opening')));
      return;
    }
    const side = cfg.side || cfg.sideFor(target);
    run = { target, side, played: [], cand: [target], firstBad: Infinity, fails: new Map(), done: false, busy: false };
    game.reset();
    last = null;
    if (cfg.lessonTitle) titleEl.textContent = cfg.lessonTitle(target);
    board.setOrientation(side);
    board.setFen(START_FEN);
    nextBtn.hidden = true;
    [hintBtn, showBtn, againBtn].forEach((b) => ((b.disabled = false), (b.hidden = false)));
    say('', side === 'white' ? 'You play White' : 'You play Black', side === 'white' ? 'Make the first move. Drag a piece, or tap it and tap where it goes.' : 'Your coach moves first. Watch, then make your move.');
    drawSide();
    drawProgress();
    advance();
  }

  const finished = () => run.played.length >= run.target.san.length;
  const turn = () => (game.turn() === 'w' ? 'white' : 'black');

  async function advance() {
    if (dead || !run) return;
    if (finished()) return complete();
    if (turn() !== run.side) {
      run.busy = true;
      await sleep(run.played.length ? 480 : 300);
      if (dead || run.done) return;
      play(run.target.san[run.played.length]);
      run.busy = false;
      return advance();
    }
    if (run.played.length) say('', 'Your turn', 'What is the next move?');
  }

  function play(san) {
    const mv = game.move(san);
    run.played.push(san);
    last = [mv.from, mv.to];
    board.setFen(game.fen(), { last, animate: true });
    drawProgress();
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
      return board.setFen(game.fen(), { last });
    }
    const idx = run.played.length;
    game.undo();
    if (run.target.san[idx] !== mv.san) return wrong(to, idx);
    play(mv.san);
    if (!finished()) say('good', cheer(), '');
    advance();
  }

  async function wrong(to, idx) {
    run.firstBad = Math.min(run.firstBad, idx);
    const n = (run.fails.get(idx) || 0) + 1;
    run.fails.set(idx, n);
    board.el.classList.remove('shake');
    void board.el.offsetWidth;
    board.el.classList.add('shake');
    board.setFen(game.fen(), { last });
    board.setMark(to, 'bad');
    say('bad', 'Not that one', n === 1 ? 'Try a different move.' : 'Look for the glowing piece.');
    await sleep(450);
    if (dead || run.done) return;
    board.setFen(game.fen(), { last });
    if (n >= 2) hint(false);
  }

  function hint(manual) {
    if (!run || run.done || run.busy || turn() !== run.side) return;
    const san = run.target.san[run.played.length];
    const m = game.moves({ verbose: true }).find((x) => x.san === san);
    if (manual) run.firstBad = Math.min(run.firstBad, run.played.length);
    if (m) board.setHint(m.from);
    if (manual) say('', 'Here is a hint', 'Move the glowing piece. You can still finish the lesson, but a star needs no hints.');
  }

  function showMove() {
    if (!run || run.done || run.busy || turn() !== run.side) return;
    run.firstBad = Math.min(run.firstBad, run.played.length);
    play(run.target.san[run.played.length]);
    advance();
  }

  function burst() {
    const b = h('div', { class: 'burst', 'aria-hidden': 'true' });
    for (let i = 0; i < 10; i++) b.append(h('i', { style: `left:${10 + Math.random() * 80}%;top:${260 + Math.random() * 40}px;animation-delay:${Math.random() * 0.35}s` }, '⭐'));
    status.append(b);
    setTimeout(() => b.remove(), 1900);
  }

  function complete() {
    run.done = true;
    const clean = run.firstBad === Infinity;
    const t = run.target;
    const s = recordRun(t.id, clean, { san: t.san.join(' '), name: t.sub || t.name || '', fam: t.fam || famOf(t)?.name || '', slug: t.slug || famOf(t)?.slug || '', side: run.side });
    const nm = nameFor(run.played, game.fen())?.line;
    const days = INTERVALS[s.box];
    if (clean) {
      S.clean++;
      say('good', 'Perfect! You earned a star ⭐', `You learned ${run.target.sub || nm?.name || 'this lesson'}. ${days ? `I will ask you again in ${days} day${days > 1 ? 's' : ''} so you remember it.` : ''}`);
      burst();
    } else {
      say('', 'Lesson finished', 'You slipped or used a hint this time. Play it again with no mistakes to earn a star.');
    }
    [hintBtn, showBtn].forEach((b) => (b.hidden = true));
    againBtn.hidden = clean;
    againBtn.disabled = false;
    nextBtn.hidden = false;
    nextBtn.focus();
    drawProgress();
    board.setFen(game.fen(), { last });
    document.dispatchEvent(new CustomEvent('rookery:progress'));
  }

  function next() {
    start(cfg.pick(run?.target));
  }

  const onKey = (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (e.key === 'Enter' && run?.done) next();
  };
  window.addEventListener('keydown', onKey);

  status.append(
    cfg.crumb,
    titleEl,
    subEl,
    h('div', { class: 'coach', style: 'margin-top:8px' }, h('div', { class: 'coach-av', 'aria-hidden': 'true' }, h('img', { src: 'pieces/wN.svg', alt: '' })), bubble),
    h('div', { class: 'big-actions' }, hintBtn, showBtn, againBtn, nextBtn),
    sideSeg,
    session,
  );
  const left = h('div', { class: 'left' }, board.el, dots, nameBox);
  root.replaceChildren(h('div', { class: 'split train' }, left, status));
  start(cfg.first);
  return () => {
    dead = true;
    window.removeEventListener('keydown', onKey);
  };
}

// next lesson in the queue: the first one not yet learned after the current one, wrapping around
function nextIn(queue, prev) {
  if (!queue.length) return null;
  if (!prev) return queue.find((l) => !isLearned(l.id)) || queue[0];
  const i = queue.findIndex((l) => l.id === prev.id);
  const order = [...queue.slice(i + 1), ...queue.slice(0, Math.max(i, 0))];
  return order.find((l) => !isLearned(l.id)) || order[0] || prev;
}

export function render(root, { slug, query }) {
  const fam = D.famBySlug.get(slug);
  if (!fam) return root.replaceChildren(h('div', { class: 'empty' }, 'We could not find that opening.', h('div', {}, h('a', { class: 'btn primary', href: '#/' }, 'See all openings'))));
  const side = query.get('side') || fam.side;
  const courses = coursesOf(fam);
  const course = courses.find((c) => c.key === query.get('course')) || courses[0];
  const built = buildCourse(fam, course, side);
  const queue = () => built.leaves;
  const first = built.leaves.find((l) => l.id === query.get('line')) || nextIn(queue(), null);
  return mount(root, {
    title: first.name,
    lessonTitle: (l) => l.name,
    crumb: h('p', { class: 'crumb', style: 'margin:0' }, h('a', { href: `#/opening/${fam.slug}?course=${course.key}&side=${side}` }, `← ${fam.name}: ${course.name}`)),
    queue,
    counter: (q, i) => (i >= 0 ? `Lesson ${i + 1} of ${q.length} in the ${course.name}` : ''),
    side,
    first,
    pick: (prev) => nextIn(queue(), prev),
    emptyTitle: 'Nothing here yet',
    emptyBody: 'This opening has no lessons.',
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
    title: 'Practice',
    lessonTitle: (l) => `Practice: ${l.name || l.fam}`,
    crumb: h('p', { class: 'crumb', style: 'margin:0' }, h('a', { href: '#/' }, '← All openings')),
    queue,
    counter: (q) => `${q.length} lesson${q.length === 1 ? '' : 's'} left to practice`,
    sideFor: (l) => l.side || 'white',
    pick: (prev) => queue().find((l) => !prev || l.id !== prev.id) || null,
    emptyTitle: 'All done for today! 🎉',
    emptyBody: 'Nothing to practice right now. Come back tomorrow, or learn a new opening.',
  });
}
