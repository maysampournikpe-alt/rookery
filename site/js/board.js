// Interactive chessboard: click-to-move, drag-and-drop, legal-move dots, last-move + hint highlights,
// promotion picker, slide animation. Rendering only; game logic lives with the caller.
const FILES = 'abcdefgh';
const piece = (p) => `pieces/${p.color}${p.type.toUpperCase()}.svg`;

export function parseFen(fen) {
  const map = {};
  const rows = fen.split(' ')[0].split('/');
  rows.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += +ch;
      else {
        map[FILES[f] + (8 - r)] = { color: ch === ch.toUpperCase() ? 'w' : 'b', type: ch.toLowerCase() };
        f++;
      }
    }
  });
  return map;
}

export class Board {
  constructor(el, opts = {}) {
    this.el = el;
    this.orientation = opts.orientation || 'white';
    this.getTargets = opts.getTargets || (() => []);
    this.canMove = opts.canMove || (() => false);
    this.onMove = opts.onMove || (() => {});
    this.pieces = {};
    this.last = null;
    this.hint = null;
    this.mark = null; // {sq, cls}
    this.selected = null;
    this.locked = false;
    el.classList.add('board');
    el.innerHTML = '';
    this.grid = document.createElement('div');
    this.grid.className = 'board-grid';
    el.append(this.grid);
    this.grid.addEventListener('pointerdown', (e) => this.#down(e));
    this.render();
  }

  setFen(fen, { last = null, animate = false } = {}) {
    const prev = this.pieces;
    this.pieces = parseFen(fen);
    this.last = last;
    this.selected = null;
    this.hint = null;
    this.mark = null;
    this.render();
    if (animate && last) this.#slide(last[0], last[1], prev);
  }

  setOrientation(o) {
    this.orientation = o;
    this.render();
  }

  flip() {
    this.setOrientation(this.orientation === 'white' ? 'black' : 'white');
  }

  setHint(sq) {
    this.hint = sq;
    this.render();
  }

  setMark(sq, cls) {
    this.mark = sq ? { sq, cls } : null;
    this.render();
  }

  #order() {
    const sqs = [];
    for (let r = 8; r >= 1; r--) for (let f = 0; f < 8; f++) sqs.push(FILES[f] + r);
    return this.orientation === 'white' ? sqs : sqs.reverse();
  }

  render() {
    const order = this.#order();
    const targets = this.selected ? new Set(this.getTargets(this.selected)) : new Set();
    const frag = document.createDocumentFragment();
    order.forEach((sq, i) => {
      const d = document.createElement('div');
      const file = FILES.indexOf(sq[0]);
      const rank = +sq[1];
      d.className = 'sq ' + ((file + rank) % 2 === 0 ? 'dark' : 'light');
      d.dataset.sq = sq;
      if (this.last && this.last.includes(sq)) d.classList.add('last');
      if (this.selected === sq) d.classList.add('sel');
      if (this.hint === sq) d.classList.add('hint');
      if (this.mark && this.mark.sq === sq) d.classList.add(this.mark.cls);
      if (targets.has(sq)) d.classList.add(this.pieces[sq] ? 'cap' : 'dot');
      const p = this.pieces[sq];
      if (p) {
        const img = document.createElement('img');
        img.src = piece(p);
        img.alt = '';
        img.draggable = false;
        img.className = 'pc';
        d.append(img);
      }
      const col = i % 8;
      const row = Math.floor(i / 8);
      if (col === 0) d.insertAdjacentHTML('beforeend', `<b class="rk">${sq[1]}</b>`);
      if (row === 7) d.insertAdjacentHTML('beforeend', `<b class="fl">${sq[0]}</b>`);
      frag.append(d);
    });
    this.grid.replaceChildren(frag);
  }

  #slide(from, to, prev) {
    const a = this.grid.querySelector(`[data-sq=${from}]`);
    const b = this.grid.querySelector(`[data-sq=${to}]`);
    const img = b?.querySelector('.pc');
    if (!a || !img) return;
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    img.animate(
      [{ transform: `translate(${ra.left - rb.left}px, ${ra.top - rb.top}px)` }, { transform: 'translate(0,0)' }],
      { duration: 140, easing: 'ease-out' },
    );
  }

  #sqFromPoint(x, y) {
    const r = this.grid.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
    const col = Math.min(7, Math.floor(((x - r.left) / r.width) * 8));
    const row = Math.min(7, Math.floor(((y - r.top) / r.height) * 8));
    return this.#order()[row * 8 + col];
  }

  #down(e) {
    if (this.locked || e.button > 0) return;
    const sq = this.#sqFromPoint(e.clientX, e.clientY);
    if (!sq) return;
    // second tap on a highlighted target completes a click-click move
    if (this.selected && this.selected !== sq && this.getTargets(this.selected).includes(sq)) {
      return this.#attempt(this.selected, sq);
    }
    if (!this.pieces[sq] || !this.canMove(sq)) {
      this.selected = null;
      return this.render();
    }
    this.selected = sq;
    this.render();
    this.#startDrag(e, sq);
  }

  #startDrag(e, from) {
    const src = this.grid.querySelector(`[data-sq=${from}] .pc`);
    if (!src) return;
    const size = src.getBoundingClientRect().width;
    const ghost = src.cloneNode();
    ghost.className = 'pc drag-ghost';
    Object.assign(ghost.style, { width: size + 'px', height: size + 'px', left: e.clientX - size / 2 + 'px', top: e.clientY - size / 2 + 'px' });
    document.body.append(ghost);
    src.style.opacity = '0.25';
    let moved = false;
    const move = (ev) => {
      moved = true;
      ghost.style.left = ev.clientX - size / 2 + 'px';
      ghost.style.top = ev.clientY - size / 2 + 'px';
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      ghost.remove();
      src.style.opacity = '';
      if (!moved) return;
      const to = this.#sqFromPoint(ev.clientX, ev.clientY);
      if (to && to !== from && this.getTargets(from).includes(to)) this.#attempt(from, to);
      else this.render();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  #attempt(from, to) {
    this.selected = null;
    this.onMove(from, to);
  }

  askPromotion(color, to) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'promo';
      const idx = this.#order().indexOf(to);
      wrap.style.left = (idx % 8) * 12.5 + '%';
      wrap.style.top = (Math.floor(idx / 8) < 4 ? 0 : 50) + '%';
      for (const t of ['q', 'n', 'r', 'b']) {
        const b = document.createElement('button');
        b.innerHTML = `<img src="${piece({ color, type: t })}" alt="${t}">`;
        b.onclick = () => {
          wrap.remove();
          resolve(t);
        };
        wrap.append(b);
      }
      this.el.append(wrap);
    });
  }
}

// Lightweight canvas mini-board used by cards.
const cache = new Map();
function img(src) {
  if (!cache.has(src)) {
    const i = new Image();
    i.src = src;
    cache.set(src, new Promise((res) => (i.onload = () => res(i))));
  }
  return cache.get(src);
}

export async function drawMini(canvas, fen, orientation = 'white') {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = canvas.clientWidth || 140;
  canvas.width = canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  const s = (size * dpr) / 8;
  const light = getComputedStyle(document.documentElement).getPropertyValue('--sq-light').trim() || '#e8d9b5';
  const dark = getComputedStyle(document.documentElement).getPropertyValue('--sq-dark').trim() || '#a67a52';
  const pcs = parseFen(fen);
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      ctx.fillStyle = (r + f) % 2 === 0 ? light : dark;
      ctx.fillRect(f * s, r * s, s, s);
    }
  const jobs = Object.entries(pcs).map(async ([sq, p]) => {
    let f = FILES.indexOf(sq[0]);
    let r = 8 - +sq[1];
    if (orientation === 'black') {
      f = 7 - f;
      r = 7 - r;
    }
    const im = await img(piece(p));
    ctx.drawImage(im, f * s, r * s, s, s);
  });
  await Promise.all(jobs);
}
