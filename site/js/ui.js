export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}

let tt;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('on'), 2200);
}

export function moveText(san, from = 0) {
  return san
    .slice(from)
    .map((m, i) => {
      const ply = from + i;
      return ply % 2 === 0 ? `${ply / 2 + 1}.${m}` : i === 0 ? `${(ply + 1) / 2}...${m}` : m;
    })
    .join(' ');
}

export const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? '' : 's'}`;

export function progressBar(done, total) {
  const bar = h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': done });
  const i = h('i');
  bar.append(i);
  requestAnimationFrame(() => (i.style.width = total ? (done / total) * 100 + '%' : '0'));
  return bar;
}

export function download(name, text, type = 'text/plain') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a);
  a.click();
  a.remove();
}

export function debounce(fn, ms = 120) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
