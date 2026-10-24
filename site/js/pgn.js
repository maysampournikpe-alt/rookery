// PGN utilities shared by the browser importer and scripts/build-gamedb.mjs (no DOM dependencies).

// Splits a PGN stream into individual games without loading the whole file.
export class GameSplitter {
  constructor() {
    this.buf = '';
  }
  // every game starts with an [Event "..."] tag; the last one in the buffer may be incomplete, so hold it back
  push(chunk) {
    this.buf += chunk.replace(/\r\n/g, '\n');
    const idx = this.buf.lastIndexOf('\n[Event ');
    if (idx < 0) return [];
    const done = this.buf.slice(0, idx);
    this.buf = this.buf.slice(idx + 1);
    return done.split(/\n(?=\[Event )/).filter((g) => g.trim());
  }
  end() {
    const t = this.buf.trim();
    this.buf = '';
    return t ? t.split(/\n(?=\[Event )/) : [];
  }
}

export function parseHeaders(text) {
  const h = {};
  for (const m of text.matchAll(/^\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/gm)) h[m[1]] = m[2].replace(/\\"/g, '"');
  return h;
}

const RESULT = /^(1-0|0-1|1\/2-1\/2|\*)$/;

function movetextOf(text) {
  return text.replace(/^\s*\[.*\]\s*$/gm, ' ');
}

function tokenize(s) {
  const out = [];
  const re = /\{[^}]*\}|;[^\n]*|\$\d+|\(|\)|\d+\.(?:\.\.)?|[^\s(){};$]+/g;
  for (const m of s.matchAll(re)) {
    const t = m[0];
    if (t[0] === '{' || t[0] === ';' || t[0] === '$') continue;
    if (/^\d+\.(\.\.)?$/.test(t)) continue;
    out.push(t);
  }
  return out;
}

const clean = (t) => t.replace(/[!?]+$/, '').replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O');

// Returns {headers, main: [san], lines: [[san]]}; `lines` has the main line and every variation (leaf paths only).
export function parseGame(text, { variations = true } = {}) {
  const headers = parseHeaders(text);
  const toks = tokenize(movetextOf(text));
  let cur = [];
  const stack = [];
  const found = [];
  let main = null;
  for (const raw of toks) {
    if (RESULT.test(raw)) continue;
    if (raw === '(') {
      stack.push(cur);
      cur = cur.slice(0, -1);
    } else if (raw === ')') {
      if (variations && cur.length) found.push(cur);
      cur = stack.pop() || cur;
    } else if (stack.length === 0 || variations) {
      if (stack.length && !variations) continue;
      cur = cur.concat(clean(raw));
    }
    if (stack.length === 0) main = cur;
  }
  main = main || cur;
  found.push(main);
  return { headers, main, lines: dropPrefixes(found) };
}

// A line that is a prefix of another adds nothing to a repertoire.
export function dropPrefixes(lines) {
  const keys = lines.map((l) => l.join(' '));
  const uniq = [...new Set(keys)];
  return uniq
    .filter((k) => !uniq.some((o) => o !== k && o.startsWith(k + ' ')))
    .map((k) => (k ? k.split(' ') : []))
    .filter((l) => l.length);
}

export function newStatNode() {
  return { n: 0, w: 0, d: 0, b: 0, c: {} };
}

export function addToStats(root, san, result, maxPly) {
  let node = root;
  const lim = Math.min(san.length, maxPly);
  for (let i = 0; i < lim; i++) {
    let k = node.c[san[i]];
    if (!k) k = node.c[san[i]] = newStatNode();
    node = k;
    node.n++;
    if (result === '1-0') node.w++;
    else if (result === '0-1') node.b++;
    else if (result === '1/2-1/2') node.d++;
  }
}

export function pruneStats(node, minGames) {
  for (const [m, k] of Object.entries(node.c)) {
    if (k.n < minGames) delete node.c[m];
    else pruneStats(k, minGames);
  }
  if (!Object.keys(node.c).length) delete node.c;
  return node;
}

export function acceptGame(h, { minElo = 0, results = true } = {}) {
  const w = +h.WhiteElo || 0;
  const b = +h.BlackElo || 0;
  if (minElo && (w < minElo || b < minElo)) return false;
  if (results && !RESULT.test(h.Result || '')) return false;
  return true;
}
