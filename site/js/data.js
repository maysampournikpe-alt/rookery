// Loads the opening dataset and builds: families, a move trie, and a position (EPD) index.
import { Chess } from '../vendor/chess.js';
import { BLURBS } from './blurbs.js';
import { kvAll } from './db.js';

const PROMOTE = {
  'Torre Attack': 'Torre Attack',
  'Colle System': 'Colle System',
  'London System': 'London System',
  'Accelerated London System': 'London System',
  'Barry Attack': 'Barry Attack',
  'Levitsky Attack': 'Levitsky Attack',
  'Stonewall Attack': 'Stonewall Attack',
  Veresov: 'Richter-Veresov Attack',
  'Veresov Attack': 'Richter-Veresov Attack',
  'Budapest Gambit': 'Budapest Gambit',
  'Budapest Gambit Accepted': 'Budapest Gambit',
};
const CATCHALL = new Set(["Queen's Pawn Game", 'Indian Defense']);

const FIX = {
  Trompowsky: 'Trompowsky Attack',
  'Evans Gambit': 'Italian Game',
  'Neo-Benoni': 'Benoni Defense',
  'Ponziani Countergambit': 'Ponziani Opening',
  "Queen's Pawn": "Queen's Pawn Game",
  'Russian-Three Knights Game': "Petrov's Defense",
};

export function familyOf(name) {
  const parts = name.split(': ');
  let fam = parts[0].replace(/, with .*$/, '');
  if (parts.length === 1) fam = fam.split(',')[0].replace(/ \d.*$/, '');
  fam = fam.replace(/^(.*(?:Gambit|Game|Defense|Countergambit)) (?:Accepted|Declined)$/, '$1');
  fam = FIX[fam] || fam;
  if (CATCHALL.has(fam) && parts[1]) {
    const base = parts[1].split(',')[0];
    if (PROMOTE[base]) fam = PROMOTE[base];
  }
  return fam;
}

// What is left of a line's name once the family is removed: "Declined: Albin Countergambit", "Najdorf Variation", ...
export function subOf(name, fam) {
  const parts = name.split(': ');
  const strip = (t) => (t.startsWith(fam) ? t.slice(fam.length).replace(/^[,:\s]+/, '') : t);
  let rest =
    parts.length > 1
      ? [parts[0].startsWith(fam) ? parts[0].slice(fam.length).replace(/^[,\s]+/, '') : '', ...parts.slice(1)].filter(Boolean).join(': ')
      : strip(name);
  rest = strip(rest);
  return rest === fam ? '' : rest;
}

export const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function hashId(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const D = {
  lines: [],
  byId: new Map(),
  families: [],
  famBySlug: new Map(),
  root: null,
  epd: new Map(),
  databases: [],
  ready: false,
};

function newNode() {
  return { kids: new Map(), lines: [], n: 0 };
}

function addLine(l) {
  D.lines.push(l);
  D.byId.set(l.id, l);
  let node = D.root;
  node.n++;
  for (const m of l.san) {
    let k = node.kids.get(m);
    if (!k) node.kids.set(m, (k = newNode()));
    node = k;
    node.n++;
  }
  node.lines.push(l);
  if (!D.epd.has(l.epd)) D.epd.set(l.epd, []);
  D.epd.get(l.epd).push(l);
}

export function epdOf(fen) {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function fenAfter(san) {
  const c = new Chess();
  for (const m of san) c.move(m);
  return c.fen();
}

function describeSide(root, fam) {
  if (/Defen[cs]e|Counter/.test(fam) && !/Gambit|Opening|Attack/.test(fam)) return 'black';
  return root.san.length % 2 === 1 ? 'white' : 'black';
}

function buildFamilies() {
  const map = new Map();
  for (const l of D.lines) {
    if (!map.has(l.fam)) map.set(l.fam, []);
    map.get(l.fam).push(l);
  }
  D.families = [...map].map(([name, lines]) => {
    lines.sort((a, b) => cmpSan(a.san, b.san));
    const root = lines.find((l) => l.name === name) || [...lines].sort((a, b) => a.san.length - b.san.length)[0];
    const ecos = [...new Set(lines.map((l) => l.eco).filter(Boolean))].sort();
    const fam = {
      name,
      slug: slug(name),
      lines,
      root,
      side: lines[0].mine ? lines[0].side || 'white' : describeSide(root, name),
      eco: ecos.length ? (ecos.length > 1 ? `${ecos[0]}–${ecos.at(-1)}` : ecos[0]) : '',
      volumes: new Set(ecos.map((e) => e[0])),
      first: root.san[0] || '',
      mine: !!lines[0].mine,
      blurb: BLURBS[name] || '',
      maxPly: Math.max(...lines.map((l) => l.san.length)),
      small: lines.length < 6 && !lines[0].mine, // obscure openings stay out of the main list
    };
    return fam;
  });
  D.families.sort((a, b) => b.lines.length - a.lines.length || a.name.localeCompare(b.name));
  D.famBySlug = new Map(D.families.map((f) => [f.slug, f]));
}

function cmpSan(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return a.length - b.length;
}

export async function loadData() {
  const res = await fetch('data/openings.json');
  const j = await res.json();
  D.root = newNode();
  D.lines = [];
  D.byId.clear();
  D.epd.clear();
  for (const [eco, name, san, epd, srcCode] of j.lines) {
    const moves = san.split(' ');
    // a trailing [w] or [b] says which colour sets the trap
    const tag = /\s\[([wb])\]$/.exec(name);
    const clean = tag ? name.slice(0, tag.index) : name;
    addLine({ id: hashId(san), eco, name: clean, tside: tag ? (tag[1] === 'w' ? 'white' : 'black') : undefined, fam: familyOf(clean), sub: '', san: moves, epd, src: ['lichess', 'book', 'scid'][srcCode] || 'lichess' });
  }
  for (const l of D.lines) {
    l.sub = subOf(l.name, l.fam);
  }
  // user repertoires (imported studies / PGN)
  try {
    for (const rep of await kvAll('rep:')) {
      for (const l of rep.lines) {
        const moves = l.san;
        const id = 'm' + hashId(rep.id + moves.join(' '));
        if (D.byId.has(id)) continue;
        const c = new Chess();
        try {
          for (const m of moves) c.move(m);
        } catch {
          continue;
        }
        addLine({ id, eco: '', name: l.name, fam: rep.name, sub: l.name === rep.name ? '' : l.name, san: moves, epd: epdOf(c.fen()), mine: true, side: rep.side });
      }
    }
    D.databases = await kvAll('db:');
  } catch (e) {
    console.warn('local storage unavailable', e);
  }
  buildFamilies();
  D.ready = true;
  return D;
}

// Bundled game databases can be several MB, so they load only when the Explorer opens.
let staticDbs;
export function loadStaticDbs() {
  staticDbs ||= (async () => {
    try {
      const m = await (await fetch('data/db/manifest.json')).json();
      for (const f of m.files) {
        const db = await (await fetch('data/db/' + f)).json();
        D.databases.push({ ...db, static: true });
      }
    } catch {
      /* no bundled game databases */
    }
  })();
  return staticDbs;
}

export function nodeAt(san) {
  let n = D.root;
  for (const m of san) {
    n = n.kids.get(m);
    if (!n) return null;
  }
  return n;
}

// Best name for a move list: deepest named prefix, falling back to EPD (transposition) match.
export function nameFor(san, fen) {
  for (let i = san.length; i > 0; i--) {
    const n = nodeAt(san.slice(0, i));
    if (n?.lines.length) return { line: n.lines[0], exact: i === san.length, ply: i };
  }
  const hit = D.epd.get(epdOf(fen));
  if (hit?.length) return { line: hit[0], exact: true, ply: san.length, transposed: true };
  return null;
}

export function dbStatsAt(san) {
  const out = [];
  for (const db of D.databases) {
    let n = db.tree;
    for (const m of san) {
      n = n?.c?.[m];
      if (!n) break;
    }
    if (n) out.push({ db, node: n });
  }
  return out;
}

export function linesOf(fam) {
  return fam.lines;
}

export function sideOfLine(line, fam) {
  return fam.side;
}
