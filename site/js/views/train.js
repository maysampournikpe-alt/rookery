import { Chess } from '../../vendor/chess.js';
import { D, START_FEN, nameFor } from '../data.js';
import { Board } from '../board.js';
import { lineState, recordRun, isDue, counts, LEARNED_BOX, INTERVALS, streak, xp } from '../store.js';
import { h, moveText, plural, sleep, toast } from '../ui.js';

const famOf = (l) => D.famBySlug.get(slugOfLine(l));
const slugCache = new Map();
function slugOfLine(l) {
  if (!slugCache.size) for (const f of D.families) for (const x of f.lines) slugCache.set(x.id, f.slug);
  return slugCache.get(l.id);
}

function weight(l) {
  const s = lineState(l.id);
  if (isDue(l.id)) return 6;
  if (s.box === 0) return 3;
  if (s.box < LEARNED_BOX) return 2;
  return 1;
}

function pickWeighted(lines, avoid) {
  const pool = lines.length > 1 && avoid ? lines.filter((l) => l.id !== avoid.id) : lines;
  const total = pool.reduce((a, l) => a + weight(l), 0);
  let r = Math.random() * total;
  for (const l of pool) if ((r -= weight(l)) <= 0) return l;
  return pool.at(-1);
}

// cfg: {title, crumb, pool, side (fixed) | sideFor(line), strict, queue(), allowSideSwitch}
function mount(root, cfg) {
  const game = new Chess();
  const S = { runs: 0, clean: 0, mistakes: 0 };
  let run = null;
  let last = null;
  let dead = false;

  const board = new Board(h('div'), {
    canMove: (sq) => run && !run.done && !run.busy && game.get(sq)?.color === run.side[0],
    getTargets: (sq) => game.moves({ square: sq, verbose: true }).map((m) => m.to),
    onMove: (f, t) => onUserMove(f, t),
  });

  const msg = h('div', { class: 'msg', 'aria-live': 'polite' });
  const prog = h('div', { class: 'prog', 'aria-hidden': 'true' });
  const nameBox = h('div', { class: 'now' });
  const stats = h('div', { class: 'kv' });
  const famProg = h('div', { class: 'meta' });
  const hintBtn = h('button', { class: 'btn', onclick: () => hint() }, 'Hint');
  const showBtn = h('button', { class: 'btn', onclick: () => showMove() }, 'Show move');
  const restartBtn = h('button', { class: 'btn', onclick: () => start(run?.target) }, 'Restart');
  const nextBtn = h('button', { class: 'btn primary', onclick: () => next() }, 'Next line →');
  const sideSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Play as' });

  function setMsg(kind, title, body) {
    msg.className = 'msg ' + (kind || '');
    msg.replaceChildren(h('b', {}, title), body ? (typeof body === 'string' ? body : body) : '');
  }

  function drawStats() {
    stats.replaceChildren(
      h('div', {}, h('b', {}, String(S.clean)), h('span', {}, 'Clean runs')),
      h('div', {}, h('b', {}, String(S.mistakes)), h('span', {}, 'Mistakes')),
      h('div', {}, h('b', {}, `🔥 ${streak()}`), h('span', {}, `${xp()} XP`)),
    );
    const c = counts(cfg.pool.map((l) => l.id));
    famProg.replaceChildren(h('span', {}, `${c.learned}/${c.total} learned`), c.due ? h('span', {}, `· ${c.due} due`) : '');
  }

  function drawSide() {
    if (!cfg.allowSideSwitch) return sideSeg.replaceChildren();
    sideSeg.replaceChildren(
      ...['white', 'black'].map((s) =>
        h('button', { 'aria-pressed': String((cfg.side || run?.side) === s), onclick: () => ((cfg.side = s), start(run?.target)) }, s === 'white' ? 'White' : 'Black'),
      ),
    );
  }

  function drawProgress() {
    if (!run) return;
    const n = run.target.san.length;
    prog.replaceChildren(...Array.from({ length: n }, (_, i) => h('i', { class: i < run.played.length ? 'done' : i === run.played.length ? 'cur' : '' })));
    const nm = run.played.length ? nameFor(run.played, game.fen()) : null;
    nameBox.replaceChildren(h('b', {}, nm ? nm.line.name : 'Starting position'), h('span', {}, nm ? `${nm.line.eco || 'Custom'}${run.played.length ? ' · ' + moveText(run.played) : ''}` : 'Make your first move'));
  }

  function start(target) {
    if (dead) return;
    target = target || cfg.pick(run?.target);
    if (!target) {
      board.setFen(START_FEN);
      setMsg('good', 'All caught up', cfg.emptyText || 'Nothing left to train here.');
      prog.replaceChildren();
      nameBox.replaceChildren();
      [hintBtn, showBtn, restartBtn, nextBtn].forEach((b) => (b.disabled = true));
      return;
    }
    const side = cfg.side || cfg.sideFor(target);
    run = { target, side, played: [], cand: cfg.strict ? [target] : cfg.pool.slice(), firstBad: Infinity, hints: 0, done: false, busy: false };
    game.reset();
    last = null;
    board.setOrientation(side);
    board.setFen(START_FEN);
    nextBtn.hidden = true;
    [hintBtn, showBtn, restartBtn].forEach((b) => ((b.disabled = false), (b.hidden = false)));
    setMsg('', `Play as ${side === 'white' ? 'White' : 'Black'}`, `Find the book moves. ${plural(target.san.length, 'half-move')} in this line.`);
    drawSide();
    drawProgress();
    drawStats();
    advance();
  }

  const finished = () => run.played.length >= run.target.san.length || !run.cand.some((l) => l.san.length > run.played.length);
  const turn = () => (game.turn() === 'w' ? 'white' : 'black');

  async function advance() {
    if (dead || !run) return;
    if (finished()) return complete();
    if (turn() !== run.side) {
      run.busy = true;
      await sleep(run.played.length ? 420 : 250);
      if (dead || run.done) return;
      const san = run.target.san[run.played.length];
      play(san);
      run.busy = false;
      return advance();
    }
    // user's turn
    if (run.played.length === 0) setMsg('', 'Your move', 'Drag a piece or click to move.');
  }

  function play(san) {
    const idx = run.played.length;
    const mv = game.move(san);
    run.played.push(san);
    run.cand = run.cand.filter((l) => l.san[idx] === san);
    if (!run.cand.includes(run.target) || run.target.san.length <= idx) {
      const alt = run.cand.filter((l) => l.san.length > run.played.length);
      if (alt.length) run.target = pickWeighted(alt);
    }
    last = [mv.from, mv.to];
    board.setFen(game.fen(), { last, animate: true });
    drawProgress();
    return mv;
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
    if (!run.cand.some((l) => l.san[idx] === mv.san)) return wrong(mv, from, to);
    play(mv.san);
    setMsg('good', 'Correct', '');
    advance();
  }

  function bookMoves() {
    const idx = run.played.length;
    return [...new Set(run.cand.map((l) => l.san[idx]).filter(Boolean))];
  }

  async function wrong(mv, from, to) {
    run.firstBad = Math.min(run.firstBad, run.played.length);
    S.mistakes++;
    const book = bookMoves();
    board.el.classList.remove('shake');
    void board.el.offsetWidth;
    board.el.classList.add('shake');
    board.setFen(game.fen(), { last });
    board.setMark(to, 'bad');
    setMsg('bad', `${mv.san} is not in the book`, book.length ? `Book move${book.length > 1 ? 's' : ''}: ${book.slice(0, 4).join(', ')}${book.length > 4 ? '…' : ''}. Try again.` : 'Try again.');
    drawStats();
    await sleep(500);
    if (!dead) board.setFen(game.fen(), { last });
  }

  function hint() {
    if (!run || run.done || run.busy || turn() !== run.side) return;
    const san = run.target.san[run.played.length];
    const m = game.moves({ verbose: true }).find((x) => x.san === san);
    run.firstBad = Math.min(run.firstBad, run.played.length);
    run.hints++;
    if (m) board.setHint(m.from);
    setMsg('', 'Hint', 'Move the highlighted piece. This run will not count as clean.');
  }

  function showMove() {
    if (!run || run.done || run.busy || turn() !== run.side) return;
    run.firstBad = Math.min(run.firstBad, run.played.length);
    const san = run.target.san[run.played.length];
    play(san);
    setMsg('', `Book move: ${san}`, '');
    advance();
  }

  function complete() {
    run.done = true;
    const played = run.played;
    const credited = cfg.pool.filter((l) => l.san.length <= played.length && l.san.every((m, i) => played[i] === m));
    let clean = false;
    let n = 0;
    for (const l of credited) {
      if (cfg.strict && l.id !== run.target.id) continue;
      const ok = run.firstBad >= l.san.length;
      recordRun(l.id, ok);
      n++;
      if (l.id === run.target.id || l.san.length === played.length) clean = ok;
    }
    S.runs++;
    if (clean) S.clean++;
    const tl = lineState(run.target.id);
    const days = INTERVALS[tl.box];
    const nm = nameFor(played, game.fen())?.line;
    setMsg(
      clean ? 'good' : 'bad',
      clean ? `Line complete — clean! ${nm ? '' : ''}` : 'Line complete',
      h(
        'span',
        {},
        nm ? h('strong', {}, nm.name) : '',
        nm ? ' · ' : '',
        clean ? (days ? `next review in ${days} day${days > 1 ? 's' : ''}` : 'review again soon') : 'it will come back sooner; mistakes and hints reset progress a little',
        n > 1 ? ` · ${n} lines credited` : '',
      ),
    );
    [hintBtn, showBtn].forEach((b) => (b.hidden = true));
    nextBtn.hidden = false;
    nextBtn.focus();
    drawProgress();
    drawStats();
    board.setFen(game.fen(), { last });
    document.dispatchEvent(new CustomEvent('rookery:progress'));
  }

  function next() {
    start(cfg.pick(run?.target));
  }

  const onKey = (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (e.key === 'Enter' && run?.done) next();
    else if (e.key.toLowerCase() === 'h') hint();
  };
  window.addEventListener('keydown', onKey);

  const left = h(
    'div',
    { class: 'left' },
    board.el,
    nameBox,
    prog,
    h('div', { class: 'nav-row' }, hintBtn, showBtn, restartBtn, h('button', { class: 'btn', onclick: () => board.flip() }, 'Flip'), nextBtn),
  );
  const right = h(
    'div',
    { class: 'status' },
    cfg.crumb,
    h('h1', { class: 'title' }, cfg.title),
    h('div', { class: 'actions', style: 'margin:0' }, sideSeg, famProg),
    msg,
    stats,
    cfg.footer || '',
  );
  root.replaceChildren(h('div', { class: 'split' }, left, right));
  start(cfg.first);
  return () => {
    dead = true;
    window.removeEventListener('keydown', onKey);
  };
}

export function render(root, { slug, query }) {
  const fam = D.famBySlug.get(slug);
  if (!fam) return root.replaceChildren(h('div', { class: 'empty' }, 'Opening not found.'));
  const lineId = query.get('line');
  const first = lineId ? fam.lines.find((l) => l.id === lineId) : null;
  const side = query.get('side') || fam.side;
  const cfg = {
    title: first ? first.name : `Drill: ${fam.name}`,
    crumb: h('p', { class: 'crumb', style: 'margin:0' }, h('a', { href: '#/openings' }, 'Openings'), ' / ', h('a', { href: `#/opening/${fam.slug}` }, fam.name), ' / Train'),
    pool: fam.lines,
    side,
    allowSideSwitch: true,
    strict: !!first && query.get('strict') !== '0',
    first,
    pick: (prev) => (first && cfg.strict ? first : pickWeighted(fam.lines.filter((l) => l.san.length >= 3 || fam.lines.length === 1), prev)),
  };
  return mount(root, cfg);
}

export function renderReview(root, { query }) {
  const famFilter = query.get('fam');
  const all = famFilter ? D.famBySlug.get(famFilter)?.lines || [] : D.lines;
  const dueLines = () => all.filter((l) => isDue(l.id)).sort((a, b) => lineState(a.id).due - lineState(b.id).due);
  const cfg = {
    title: 'Review',
    crumb: h('p', { class: 'crumb', style: 'margin:0' }, h('a', { href: '#/openings' }, 'Openings'), ' / Review'),
    pool: all,
    strict: true,
    sideFor: (l) => famOf(l)?.side || 'white',
    pick: (prev) => {
      const q = dueLines().filter((l) => !prev || l.id !== prev.id || dueLines().length === 1);
      return q[0] || null;
    },
    emptyText: 'No lines are due. Learn something new from the openings page.',
  };
  return mount(root, cfg);
}
