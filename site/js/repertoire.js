// Turns the big pile of named lines into a small, deep repertoire per opening:
//  - a handful of hand-picked variations ("courses") per opening
//  - for each course a move tree with ONE move for you at every step and the main replies your opponent can make
//  - every branch of that tree is one lesson
import { D, nodeAt, hashId } from './data.js';

const MAX_LESSONS = 14; // lessons per variation
const DEPTH = 22; // half-moves past the start of the variation (hard cap 34 overall)

// [display name, [normalized head names that belong to it], one-sentence idea]
const CURATED = {
  'Sicilian Defense': [
    ['Najdorf', ['najdorf'], 'Black plays ...a6 early so White\'s pieces cannot use b5, then fights for the centre. The most popular Sicilian of all.'],
    ['Dragon', ['dragon'], 'Black puts the bishop on g7, where it stares down the long diagonal. Sharp, with attacks on both sides.'],
    ['Accelerated Dragon', ['accelerated fianchetto', 'accelerated dragon'], 'Like the Dragon, but Black plays ...g6 straight away. It dodges some of White\'s sharpest attacks.'],
    ['Classical', ['classical', 'richter-rauzer'], 'Black develops the knights and bishop in the natural way. Solid and easy to understand.'],
    ['Scheveningen', ['scheveningen'], 'Black builds a small pawn wall with ...e6 and ...d6, then strikes back when the time is right.'],
    ['Taimanov', ['taimanov'], 'Black plays ...e6 and ...Nc6 and keeps lots of options open.'],
  ],
  'Italian Game': [
    ['Giuoco Piano', ['giuoco piano', 'classical'], 'The classic Italian. White builds a big centre with c3 and d4, and Black can answer in several ways.'],
    ['Quiet Italian', ['giuoco pianissimo'], 'A slow, patient Italian. White plays d3 and brings the pieces out calmly.'],
    ['Two Knights', ['two knights'], 'Black plays ...Nf6 and fights back at once. White can try the tricky Ng5, or play calmly with d3.'],
    ['Evans Gambit', ['evans gambit', 'evans gambit declined', 'evans gambit accepted'], 'White gives up a pawn with b4 to grab the centre and attack fast.'],
    ['Scotch Gambit', ['scotch gambit'], 'White opens the centre with d4 and gives Black a pawn for quick development.'],
  ],
  'Ruy Lopez': [
    ['Closed', ['closed'], 'White keeps the centre tense and builds slowly with c3, d4 and h3. The main road of the Spanish.'],
    ['Open', ['open'], 'Black grabs the e4 pawn with ...Nxe4 and plays for active pieces.'],
    ['Exchange', ['exchange'], 'White trades bishop for knight to damage Black\'s pawns, then heads for a simple, better endgame.'],
    ['Berlin', ['berlin', 'open berlin'], 'Black plays ...Nf6 and welcomes the queen trade. Famously hard to beat.'],
    ['Marshall', ['marshall'], 'Black gives up a pawn for a strong attack on the white king.'],
    ['Schliemann', ['schliemann'], 'Black hits back at once with ...f5. Wild and surprising.'],
  ],
  'French Defense': [
    ['Winawer', ['winawer'], 'Black pins the knight with ...Bb4 and breaks up White\'s pawns. Sharp and double-edged.'],
    ['Tarrasch', ['tarrasch'], 'White plays Nd2 to keep the e4 pawn safe and the game calm.'],
    ['Advance', ['advance'], 'White pushes the pawn to e5 for space. Black attacks the pawn chain with ...c5.'],
    ['Exchange', ['exchange'], 'White trades the centre pawns. A quiet game with a clear plan.'],
    ['Classical', ['classical'], 'Black plays ...Nf6 and ...Be7 and defends solidly.'],
    ['Rubinstein', ['rubinstein'], 'Black trades pawns with ...dxe4 and gets an easy, comfortable game.'],
  ],
  'Caro-Kann Defense': [
    ['Advance', ['advance'], 'White pushes the pawn to e5. Black develops the bishop outside the pawn chain with ...Bf5.'],
    ['Classical', ['classical', 'karpov'], 'Black takes on e4, then plays ...Bf5. Very solid.'],
    ['Panov Attack', ['panov-botvinnik', 'panov attack', 'accelerated panov attack', 'panov'], 'White attacks the centre with c4. Active play for both sides.'],
    ['Exchange', ['exchange'], 'White trades on d5. A quiet game with a clear structure.'],
    ['Two Knights', ['two knights'], 'White develops with Nf3 and Nc3 and avoids heavy theory.'],
  ],
  "Queen's Gambit": [
    ['Orthodox', ['orthodox'], 'Black builds a solid set-up with ...e6, ...Be7 and ...Nf6.'],
    ['Exchange', ['exchange'], 'White takes on d5 and gets a clear plan: an attack on the queenside.'],
    ['Semi-Tarrasch', ['semi-tarrasch'], 'Black plays ...c5 to open the centre with an active game.'],
    ['Tartakower', ['tartakower'], 'Black plays ...h6 and ...b6 and aims for a flexible set-up.'],
    ['Albin Countergambit', ['albin'], 'Black sacrifices a pawn with ...e5 for a lively game.'],
    ['Chigorin', ['chigorin'], 'Black plays ...Nc6 and goes for piece play instead of the usual pawn moves.'],
  ],
  "King's Indian Defense": [
    ['Sämisch', ['samisch'], 'White plays f3 and builds a wall of pawns. Black attacks with ...c5 or ...e5.'],
    ['Fianchetto', ['fianchetto'], 'White puts the bishop on g2 and plays a calm, flexible game.'],
    ['Mar del Plata', ['mar del plata'], 'Black\'s famous pawn storm against the white king in the main line.'],
    ['Four Pawns Attack', ['four pawns attack'], 'White grabs lots of space with pawns on c4, d4, e4 and f4.'],
    ['Averbakh', ['averbakh'], 'White develops Be2 and Bg5, pinning the knight.'],
  ],
  'English Opening': [
    ['Symmetrical', ['symmetrical'], 'Black copies with ...c5. A slow, subtle fight for the centre.'],
    ["King's English", ["king's english", "king's"], 'Black plays ...e5 and takes space in the centre while White fianchettoes.'],
    ['Four Knights', ['four knights'], 'Both sides develop their knights first, then the game opens up.'],
    ['Closed', ['closed'], 'White fianchettoes the bishop and builds slowly.'],
    ['Bremen', ['bremen'], 'A King\'s English set-up where White plays g3 and Bg2.'],
  ],
  'Nimzo-Indian Defense': [
    ['Classical', ['classical'], 'White plays Qc2 so a bishop trade will not wreck the pawns.'],
    ['Sämisch', ['samisch'], 'White plays a3 and takes the bishop pair, accepting doubled pawns for lots of space.'],
    ['Leningrad', ['leningrad'], 'White plays Bg5 to pin the knight and fight for e4.'],
    ['Rubinstein', ['rubinstein system', 'rubinstein'], 'White plays e3 and builds simply and solidly.'],
  ],
  'Slav Defense': [
    ['Exchange', ['exchange'], 'White trades on d5 and plays a quiet, even game.'],
    ['Dutch Variation', ['dutch'], 'Black plays ...f5, an ambitious pawn move in the Slav.'],
    ['Czech', ['czech'], 'Black takes on c4, then plays ...a6, a modern set-up.'],
    ['Slav-Réti', ['slav-reti'], 'White plays Nf3 and a slow fianchetto.'],
  ],
  'Scotch Game': [
    ['Scotch Gambit', ['scotch gambit'], 'White lets Black take a pawn to get fast development.'],
    ['Classical', ['classical'], 'Black plays ...Bc5 and goes for active pieces.'],
    ['Steinitz', ['steinitz'], 'Black plays ...Qh4 and attacks the e4 pawn right away.'],
    ['Mieses', ['mieses'], 'White trades on c6 and pushes e5 for space and speed.'],
  ],
  "King's Gambit": [
    ["Bishop's Gambit", ["bishop's gambit"], 'White develops the bishop to c4, aiming at the weak f7 square.'],
    ['Falkbeer', ['falkbeer countergambit', 'falkbeer'], 'Black replies ...d5 and hits White\'s centre at once.'],
    ['Kieseritzky', ['kieseritzky gambit'], 'Black grabs two pawns; White fights back with h4 and Ne5.'],
    ['Classical', ['classical'], 'Black plays ...g5 and tries to hold the extra pawn.'],
  ],
  'Dutch Defense': [
    ['Leningrad', ['leningrad'], 'Black fianchettoes the bishop to g7 and aims for a kingside attack.'],
    ['Stonewall', ['stonewall'], 'Black builds a wall of pawns on c6, d5, e6 and f5.'],
    ['Staunton Gambit', ['staunton gambit'], 'White plays e4 to blow open the centre after ...f5.'],
    ['Classical', ['classical'], 'Black plays ...e6 and ...d6 for a solid, flexible set-up.'],
  ],
  'Catalan Opening': [
    ['Closed', ['closed'], 'White\'s bishop on g2 puts long-term pressure on the queenside while Black stays solid.'],
    ['Open', ['open'], 'Black takes the c4 pawn; White wins it back with active play.'],
  ],
  "Petrov's Defense": [
    ['Modern Attack', ['modern attack'], 'White plays d4 right away. Both sides trade pieces.'],
    ['Classical Attack', ['classical attack', 'classical'], 'White takes on e5 and builds the centre with d4.'],
  ],
  'Grünfeld Defense': [
    ['Exchange', ['exchange', 'classical exchange', 'modern exchange'], 'White takes on d5 and builds a big centre. Black hits it from every side.'],
    ['Russian', ['russian', 'early russian'], 'White plays Qb3 and Nf3. Black attacks the centre with ...dxc4.'],
    ['Three Knights', ['three knights'], 'White develops with Nf3 instead of e4 for a calmer game.'],
    ['Stockholm', ['stockholm'], 'White develops the bishop to g5 quickly.'],
  ],
  'Pirc Defense': [
    ['Classical', ['classical'], 'White develops normally with Nf3 and Be2.'],
    ['Austrian Attack', ['austrian', 'austrian attack'], 'White plays f4 for a big centre and a quick attack.'],
    ['150 Attack', ['150 attack'], 'White plays Be3, Qd2 and Bh6 to trade the dark-squared bishops.'],
  ],
};

export const norm = (h) =>
  h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/saemisch/, 'samisch')
    .replace(/ variations?$/, '')
    .replace(/ defen[cs]e$/, '')
    .trim();

const headOf = (l) => norm((l.sub || '').replace(/^(Declined|Accepted)(: )?/, '').split(/[:,]/)[0]);
const byLen = (a, b) => a.san.length - b.san.length;

function cmpPath(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return a.length - b.length;
}

// a trie of just the given lines: n = how many of THEM pass through each position
function groupTrie(lines) {
  const root = { kids: new Map(), n: 0 };
  for (const l of lines) {
    let n = root;
    n.n++;
    for (const m of l.san) {
      if (!n.kids.has(m)) n.kids.set(m, { kids: new Map(), n: 0 });
      n = n.kids.get(m);
      n.n++;
    }
  }
  return root;
}

// the shared start of a variation: follow the main road while at least 80% of its lines still agree
function trunk(lines) {
  const root = groupTrie(lines);
  let node = root;
  const path = [];
  for (;;) {
    let best = null;
    for (const [m, k] of node.kids) if (!best || k.n > best[1].n) best = [m, k];
    if (!best || best[1].n < lines.length * 0.8) break;
    path.push(best[0]);
    node = best[1];
  }
  return { path, node };
}

export function coursesOf(fam) {
  if (fam._courses) return fam._courses;
  let out = [];
  if (fam.mine) {
    out = [{ key: 'all', name: fam.name, idea: 'Your own lessons.', path: [], lines: fam.lines, custom: true }];
  } else {
    const groups = new Map();
    for (const l of fam.lines) {
      const k = headOf(l);
      if (!k) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(l);
    }
    const used = new Set();
    const make = (name, keys, idea) => {
      const ls = keys.flatMap((k) => groups.get(k) || []);
      if (ls.length < 2) return;
      const t = trunk(ls);
      out.push({ key: keys[0].replace(/[^a-z0-9]+/g, '-'), name, idea, path: t.path, node: t.node, lines: ls });
      keys.forEach((k) => used.add(k));
    };
    for (const [name, keys, idea] of CURATED[fam.name] || []) {
      make(name, keys, idea);
      if (out.length >= 6) break;
    }
    if (out.length < 4) {
      const ranked = [...groups].filter(([k, ls]) => !used.has(k) && ls.length >= 3 && !/^\d|^main line|^normal|^with |^\(/.test(k)).sort((a, b) => b[1].length - a[1].length);
      for (const [k, ls] of ranked) {
        if (out.length >= (CURATED[fam.name] ? 4 : 4)) break;
        const display = ls[0].sub.replace(/^(Declined|Accepted): /, '').split(/[:,]/)[0].trim();
        make(display, [k], `A popular way to play the ${fam.name}.`);
      }
    }
    if (!out.length) {
      const t = trunk(fam.lines);
      out = [{ key: 'main', name: 'Main ideas', idea: `The main ideas of the ${fam.name}.`, path: t.path, node: t.node, lines: fam.lines }];
    }
  }
  // a variation with a single lesson is not worth a tab
  if (!fam.mine) {
    const deep = out.filter((c) => buildCourse(fam, c, fam.side).leaves.length >= 2);
    if (deep.length) out = deep;
  }
  fam._courses = out;
  return out;
}

const SCHEDULES = [
  [4, 3, 2, 1],
  [3, 2, 2, 1],
  [3, 2, 1, 1],
  [2, 2, 1, 1],
  [2, 1, 1, 1],
  [1, 1, 1, 1],
];

const cache = new Map();

function labelFor(san, course, side) {
  let named = '';
  for (let i = san.length; i >= Math.max(1, course.path.length); i--) {
    const l = nodeAt(san.slice(0, i))?.lines[0];
    if (l && l.sub && i > course.path.length) {
      named = l.sub;
      break;
    }
  }
  // raw move strings ("Najdorf, 6.Be2 e5 7.Nb3") make poor names: say what the opponent did instead
  if (!named || /\d+\./.test(named) || /^\d/.test(named)) {
    let i = course.path.length;
    if ((i % 2 === 0) === (side === 'white')) i++; // skip my own move to reach theirs
    const m = san[i];
    if (m) return `${course.name}: when ${side === 'white' ? 'Black' : 'White'} plays ${i % 2 === 0 ? `${i / 2 + 1}.` : `${(i + 1) / 2}...`}${m}`;
    return course.name;
  }
  const rest = named.replace(new RegExp('^' + course.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[,:]?\\s*', 'i'), '').trim();
  return rest ? `${course.name}: ${rest}` : course.name;
}

// Builds the lessons and the move tree for one variation, from the point of view of `side`.
export function buildCourse(fam, course, side) {
  const ck = `${fam.slug}|${course.key}|${side}`;
  if (cache.has(ck)) return cache.get(ck);
  let paths = [];
  if (course.custom) {
    paths = course.lines.map((l) => l.san);
  } else {
    const start = course.node;
    const mine = (ply) => (ply % 2 === 0) === (side === 'white'); // is the move at index `ply` yours?
    const maxLen = Math.min(34, course.path.length + DEPTH);
    for (const sched of SCHEDULES) {
      paths = [];
      const walk = (node, path, decisions) => {
        if (!node || !node.kids.size || path.length >= maxLen) return void paths.push(path);
        const kids = [...node.kids].sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1));
        if (mine(path.length)) return walk(kids[0][1], [...path, kids[0][0]], decisions);
        let pick = kids;
        if (kids.length > 1 && kids[0][1].n >= 2) pick = kids.filter((k) => k[1].n >= 2);
        pick = pick.slice(0, sched[Math.min(decisions, sched.length - 1)]);
        for (const [m, k] of pick) walk(k, [...path, m], decisions + (pick.length > 1 ? 1 : 0));
      };
      walk(start, course.path, 0);
      // a lesson must end on YOUR move
      paths = paths.map((p) => {
        while (p.length > course.path.length && !mine(p.length - 1)) p = p.slice(0, -1);
        return p;
      });
      paths = dedupe(paths);
      if (paths.length <= MAX_LESSONS) break;
    }
    if (!paths.length) paths = course.path.length ? [course.path] : [];
  }
  paths = dedupe(paths).sort(cmpPath);
  const leaves = paths.map((san) => ({ id: hashId(san.join(' ')), san, sub: labelFor(san, course, side), name: labelFor(san, course, side), fam: fam.name, slug: fam.slug, side, course: course.key }));
  const tree = { kids: new Map(), leaf: null };
  for (const l of leaves) {
    let n = tree;
    for (const m of l.san) {
      if (!n.kids.has(m)) n.kids.set(m, { kids: new Map(), leaf: null });
      n = n.kids.get(m);
    }
    n.leaf = l;
  }
  // name each line by every choice the opponent made on the way ("when White plays 6.Be2, then 8.O-O")
  const theirs = side === 'white' ? 'Black' : 'White';
  for (const l of leaves) {
    let n = tree;
    const picks = [];
    l.san.forEach((m, i) => {
      const mineHere = (i % 2 === 0) === (side === 'white');
      if (n.kids.size > 1 && !mineHere) picks.push(`${i % 2 === 0 ? i / 2 + 1 + '.' : (i + 1) / 2 + '...'}${m}`);
      n = n.kids.get(m);
    });
    if (picks.length) l.sub = l.name = `${course.name}: when ${theirs} plays ${picks.join(', then ')}`;
  }
  const res = { course, side, leaves, tree };
  cache.set(ck, res);
  return res;
}

function dedupe(paths) {
  const keys = [...new Set(paths.map((p) => p.join(' ')))];
  return keys
    .filter((k) => !keys.some((o) => o !== k && o.startsWith(k + ' ')))
    .map((k) => (k ? k.split(' ') : []))
    .filter((p) => p.length);
}

// All lessons of an opening for one side (used for progress on the home page).
export function allLessons(fam, side) {
  return coursesOf(fam).flatMap((c) => buildCourse(fam, c, side).leaves);
}
