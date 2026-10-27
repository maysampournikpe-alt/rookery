// Turns the big pile of named lines into a small, deep repertoire per opening:
//  - a handful of hand-picked variations ("courses") per opening
//  - for each course a move tree with ONE move for you at every step and the main replies your opponent can make
//  - every branch of that tree is one lesson
import { D, nodeAt, hashId } from './data.js';

// three depths per variation: how many lines to teach and how far past the start of the variation to go
export const TIERS = {
  essentials: { label: 'Essentials', hint: 'The main lines. Most players start here.', max: 10, depth: 16 },
  advanced: { label: 'Advanced', hint: 'A reply for every move your opponent can make, as deep as the data goes.', max: 120, depth: 34 },
  expert: { label: 'Expert', hint: 'Every line we have, including sidelines where you could choose a different move.', max: 150, depth: 40 },
};

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
  'London System': [
    ['Against ...e6 and ...Bd6', ['classical setup'], 'White builds the London pyramid (d4, e3, c3, Nf3, Bd3) and keeps the bishop safe on g3. Solid and easy to learn.'],
    ['Against ...c5', ['vs ...c5'], 'Black hits d4 with ...c5. White supports the pawn with c3 and e3 and keeps developing calmly.'],
    ['Against ...Bf5', ['vs ...bf5'], 'Black copies White\'s bishop move. White develops with Nd2 and can chase the bishop with Nh4.'],
    ["Against the King's Indian set-up", ["vs the king's indian setup"], 'Against ...g6 and ...Bg7, White plays e3, Be2 and h3, castles, and builds a solid centre.'],
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

const strip = (sub) => (sub || '').replace(/^(Declined|Accepted)(: |, )(?=.)/, ''); // "Accepted, Chicago Defense" is the Chicago Defense
const trapName = (sub) => /^traps?, (.+)$/i.exec(strip(sub))?.[1].split(/[:,]/)[0].trim();
const trapNote = (sub) => (/^traps?, (.+)$/i.exec(strip(sub))?.[1].split(/,\s*/).slice(1).join(', ') || '').trim();
const headOf = (l) => {
  const t = trapName(l.sub);
  if (t) return 'trap: ' + norm(t); // every named trap is its own variation
  return norm(strip(l.sub).split(/[:,]/)[0]);
};
const byLen = (a, b) => a.san.length - b.san.length;

function cmpPath(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return a.length - b.length;
}

// a trie of just the given lines: n = how many of THEM pass through each position
const BOOK_WEIGHT = 25;
function groupTrie(lines) {
  const root = { kids: new Map(), n: 0 };
  for (const l of lines) {
    const w = l.src === 'book' ? BOOK_WEIGHT : 1; // hand-written repertoire lines decide which move you play
    let n = root;
    n.n += w;
    for (const m of l.san) {
      if (!n.kids.has(m)) n.kids.set(m, { kids: new Map(), n: 0 });
      n = n.kids.get(m);
      n.n += w;
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
    if (!best || best[1].n < root.n * 0.8) break;
    path.push(best[0]);
    node = best[1];
  }
  return { path, node };
}

const bookN = (ls) => Math.min(ls.filter((l) => l.src === 'book').length, 6); // hand-written lines first

// the ordinary variations of an opening (traps are listed on their own page)
export const coursesOf = (fam) => allCoursesOf(fam).filter((c) => !c.trap);
export const trapsOf = (fam) => allCoursesOf(fam).filter((c) => c.trap);

export function allCoursesOf(fam) {
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
      out.push({ key: keys[0].replace(/[^a-z0-9]+/g, '-'), name, idea, path: t.path, node: t.node, lines: ls, side: ls.every((l) => l.tside && l.tside === ls[0].tside) ? ls[0].tside : undefined });
      keys.forEach((k) => used.add(k));
    };
    for (const [name, keys, idea] of CURATED[fam.name] || []) {
      make(name, keys, idea);
      if (out.length >= 6) break;
    }
    if (out.length < MAX_VARIATIONS) {
      const ranked = [...groups].filter(([k, ls]) => !used.has(k) && !k.startsWith('trap: ') && ls.length >= 4 && !/^\d|^main line|^normal|^with |^\(|^vs /.test(k)).sort((a, b) => bookN(b[1]) - bookN(a[1]) || b[1].length - a[1].length);
      for (const [k, ls] of ranked) {
        if (out.length >= MAX_VARIATIONS) break;
        let display = strip(ls[0].sub).split(/[:,]/)[0].trim();
        if (/^(open|closed|classical|modern|exchange|advance|main|normal|symmetrical|old|quiet|fianchetto)$/i.test(display)) display += ' Variation';
        if (/^(accepted|declined)$/i.test(display)) display = `Gambit ${display}`;
        make(display, [k], `${ls.length} known lines in the ${display}.`);
      }
    }
    // openings whose lines carry move-names ("3...Nf6 4.d4 exd4") or too few named variations: group by the opponent's first choice
    {
      const taken = new Set(out.flatMap((c) => c.lines));
      const rest = fam.lines.filter((l) => !taken.has(l) && !trapName(l.sub));
      if (rest.length >= 6) {
        const base = trunk(rest).path;
        const owner = fam.side === 'white';
        const byMove = new Map();
        for (const l of rest) {
          let i = base.length;
          while (i < l.san.length && (i % 2 === 0) === owner) i++; // skip the owner's own moves
          if (i >= l.san.length) continue;
          const key = l.san.slice(0, i + 1).join(' ');
          if (!byMove.has(key)) byMove.set(key, { i, ls: [] });
          byMove.get(key).ls.push(l);
        }
        const groupsBig = [...byMove].filter(([, g]) => g.ls.length >= 3).sort((a, b) => b[1].ls.length - a[1].ls.length);
        for (const [key, g] of groupsBig) {
          if (out.length >= MAX_VARIATIONS) break;
          const mv = key.split(' ')[g.i];
          const label = `${g.i % 2 === 0 ? `${g.i / 2 + 1}.` : `${(g.i + 1) / 2}...`}${mv}`;
          const t = trunk(g.ls);
          const c = { key: 'vs-' + label.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase(), name: `vs ${label}`, idea: `${g.ls.length} known lines after ${label}.`, path: t.path, node: t.node, lines: g.ls };
          if (tiersOf(fam, c, fam.side).at(-1).count >= 2) out.push(c);
        }
      }
    }
    {
      const taken = new Set(out.flatMap((c) => c.lines));
      const rest = fam.lines.filter((l) => !taken.has(l) && !trapName(l.sub));
      if (rest.length >= 8 && out.length < MAX_VARIATIONS + 1) {
        const t = trunk(rest);
        const c = { key: 'more', name: 'More lines', idea: `${rest.length} more known lines in the ${fam.name}.`, path: t.path, node: t.node, lines: rest };
        if (tiersOf(fam, c, fam.side).at(-1).count >= 2) out.push(c);
      }
    }
    for (const [k, ls] of groups) {
      if (!k.startsWith('trap: ')) continue;
      const t = trunk(ls);
      const name = trapName(ls[0].sub);
      out.push({ key: 'trap-' + k.slice(6).replace(/[^a-z0-9]+/g, '-'), name, idea: `A trap against the ${fam.name}${trapNote(ls[0].sub) ? ': ' + trapNote(ls[0].sub) : ''}. Learn how to set it, and what to do if your opponent sees it coming.`, path: t.path, node: t.node, lines: ls, trap: true, side: ls[0].tside });
    }
    if (!out.some((c) => !c.trap)) {
      const rest = fam.lines.filter((l) => !trapName(l.sub));
      const t = trunk(rest.length ? rest : fam.lines);
      out = [{ key: 'main', name: 'Main ideas', idea: `The main ideas of the ${fam.name}.`, path: t.path, node: t.node, lines: rest.length ? rest : fam.lines }, ...out.filter((c) => c.trap)];
    }
  }
  // a variation with a single lesson is not worth a tab
  if (!fam.mine) {
    const deep = out.filter((c) => c.trap || tiersOf(fam, c, fam.side).at(-1).count >= 2);
    if (deep.length) out = deep;
  }
  fam._courses = out;
  return out;
}

// how many opponent replies to cover at their 1st, 2nd, 3rd... decision; tried from wide to narrow until the lessons fit
const BASE = [
  [4, 3, 2, 1],
  [3, 2, 2, 1],
  [3, 2, 1, 1],
  [2, 2, 1, 1],
  [2, 1, 1, 1],
  [1, 1, 1, 1],
];
const SCHEDULES = {
  essentials: BASE,
  advanced: [[40, 30, 20, 12], [30, 20, 12, 8], [20, 14, 9, 6], [12, 9, 6, 4], [9, 6, 5, 4], [6, 5, 4, 3], [5, 4, 3, 2], [4, 4, 3, 2], [4, 3, 3, 2], ...BASE],
  expert: [[12, 9, 7, 5], [10, 8, 6, 4], [8, 6, 5, 4], [7, 5, 4, 3], [6, 5, 4, 3], [5, 4, 3, 3], [4, 4, 3, 2], ...BASE],
};

const MAX_VARIATIONS = 18;
const cache = new Map();

// "Najdorf Variation, English Attack 6.Be3" -> "Najdorf Variation, English Attack": a name should not carry raw moves
const cleanName = (n) =>
  (n || '')
    .split(/,\s*/)
    .map((seg) => seg.replace(/\s*\b\d{1,2}\.{1,3}\s?[A-Za-z0-9O][^:]*$/, '').trim())
    .filter((seg) => seg && !/^\d|^vs\b|\.\.\.|^Traps?$/i.test(seg))
    .join(', ');

// the real opening name of a line: the deepest named position along it (open-data names first, then hand-written ones)
function labelFor(san, course, side) {
  let named = '';
  for (let i = san.length; i > course.path.length; i--) {
    const ls = nodeAt(san.slice(0, i))?.lines || [];
    const ok = (x) => x.sub && !/Tactics in Junior/i.test(x.name) && cleanName(x.sub);
    const l = ls.find((x) => x.src !== 'book' && ok(x)) || ls.find(ok);
    if (l) {
      named = cleanName(l.sub);
      break;
    }
  }
  named = named.replace(/^(Declined|Accepted)(: |, )(?=.)/, '');
  const rest = named.replace(new RegExp('^' + course.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[,:]|$)[,:]?\\s*', 'i'), '').trim();
  return rest ? `${course.name}: ${rest}` : course.name;
}

// Builds the lessons and the move tree for one variation, from the point of view of `side`.
export function buildCourse(fam, course, side, tier = 'essentials') {
  const T = TIERS[tier] || TIERS.essentials;
  const ck = `${fam.slug}|${course.key}|${side}|${tier}`;
  if (cache.has(ck)) return cache.get(ck);
  let paths = [];
  if (course.custom) {
    paths = course.lines.map((l) => l.san);
  } else if (tier === 'expert') {
    // every named line of the variation (both sides' alternatives), most-played first
    const under = course.lines.filter((l) => l.san.length > course.path.length && course.path.every((m, i) => l.san[i] === m));
    const pop = (l) => (l.src === 'book' ? 1e6 : 0) + (nodeAt(l.san.slice(0, Math.min(l.san.length, course.path.length + 3)))?.n || 0);
    paths = dedupe([...under].sort((a, b) => pop(b) - pop(a) || a.san.length - b.san.length).slice(0, T.max * 2).map((l) => l.san)).slice(0, T.max);
    if (!paths.length) paths = course.path.length ? [course.path] : [];
  } else {
    const start = course.node;
    const mine = (ply) => (ply % 2 === 0) === (side === 'white'); // is the move at index `ply` yours?
    const maxLen = Math.min(44, course.path.length + T.depth);
    for (const sched of SCHEDULES[tier] || BASE) {
      paths = [];
      const walk = (node, path, decisions) => {
        if (!node || !node.kids.size || path.length >= maxLen) return void paths.push(path);
        const kids = [...node.kids].sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1));
        if (mine(path.length)) return walk(kids[0][1], [...path, kids[0][0]], decisions);
        let pick = kids;
        if (tier === 'essentials' && kids.length > 1 && kids[0][1].n >= 2) pick = kids.filter((k) => k[1].n >= 2);
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
      if (paths.length <= T.max) break;
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
  // two lines can carry the same opening name: tell them apart by the first move where they part ways
  const byName = new Map();
  for (const l of leaves) byName.set(l.name, [...(byName.get(l.name) || []), l]);
  const label = (i, m) => `${i % 2 === 0 ? `${i / 2 + 1}.` : `${(i + 1) / 2}...`}${m}`;
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    for (const l of group) {
      let n = tree;
      l.picks = [];
      l.san.forEach((m, i) => {
        if (n.kids.size > 1) l.picks.push(label(i, m));
        n = n.kids.get(m);
      });
    }
    // use as many of the choices as it takes for the names to differ
    for (let k = 1; k <= 6; k++) {
      const seen = new Set(group.map((l) => l.picks.slice(0, k).join(' ')));
      if (seen.size === group.length || k === 6) {
        for (const l of group) if (l.picks.length) l.sub = l.name = `${l.name} (${l.picks.slice(0, k).join(' ')})`;
        break;
      }
    }
  }
  const res = { course, side, tier, leaves, tree };
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

// the depths worth offering for a variation: a deeper level only appears if it adds lines
export function tiersOf(fam, course, side) {
  const out = [];
  let prev = 0;
  for (const key of course.custom ? ['essentials'] : Object.keys(TIERS)) {
    const b = buildCourse(fam, course, side, key);
    if (b.leaves.length > prev || !out.length) out.push({ key, ...TIERS[key], count: b.leaves.length });
    prev = Math.max(prev, b.leaves.length);
  }
  return out;
}

// where to open a variation: Essentials, unless it is tiny, then the first level with a decent number of lines
export function defaultTier(tiers) {
  return tiers.find((t) => t.count >= 4) || tiers.at(-1);
}

// All lessons of an opening for one side (used for progress on the home page).
export function allLessons(fam, side) {
  return coursesOf(fam).flatMap((c) => buildCourse(fam, c, side, defaultTier(tiersOf(fam, c, side)).key).leaves);
}

// how many lines an opening has at the deepest level, summed over its variations
export function deepestCount(fam, side) {
  return coursesOf(fam).reduce((n, c) => n + tiersOf(fam, c, side).at(-1).count, 0);
}

// Traps of one opening, sorted into groups by the variation they spring from (the way a study has chapters):
// [{ name: 'Austrian Attack', chapters: [{ course, title, tag }] }]
export function trapGroups(fam) {
  const short = fam.name.replace(/ (Defen[cs]e|Opening|Game|Attack)$/, '');
  const groups = new Map();
  for (const course of trapsOf(fam)) {
    let base = course.name.replace(/\s*\([^)]*\)\s*$/, '');
    const tag = /\b(Mating|Mate)\b/.test(base) ? 'Mate' : /\bFork\b/.test(base) ? 'Fork' : /queen/i.test(course.idea) ? 'Queen' : /rook/i.test(course.idea) ? 'Rook' : 'Piece';
    const named = / Trap$/.test(base) && (base.startsWith(fam.name) || base.startsWith(short)); // "Pirc Classical Trap" is a variation; "Légal's Mate" has a name of its own
    let name = base;
    if (named) {
      name = base.replace(/ (Fork|Mating) Trap$/, '').replace(/ Trap$/, '');
      if (name !== fam.name && name !== short) for (const pre of [fam.name, short]) if (name.startsWith(pre + ' ')) { name = name.slice(pre.length + 1); break; }
      name = name.replace(/ Variation$/, '');
      if (name === fam.name || name === short || !name) name = 'Main line';
    }
    if (!named) name = 'Famous traps';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push({ course, tag, own: !named });
  }
  return [...groups]
    .map(([name, cs]) => ({ name, chapters: cs.map((c, i) => ({ ...c, title: c.own ? c.course.name : i ? `${name} ${i + 1}` : name })) }))
    .map((g) => {
      // a variation with more known games is more likely to be met; a trap that springs earlier is met more often
      const key = g.name.toLowerCase();
      g.weight = g.name === 'Main line' ? 1e6 : fam.lines.filter((l) => l.src !== 'book' && (l.sub || '').toLowerCase().includes(key)).length;
      g.chapters.sort((x, y) => Math.min(...x.course.lines.map((l) => l.san.length)) - Math.min(...y.course.lines.map((l) => l.san.length)));
      // each chapter is named after the mistake it waits for ("Taimanov: 7...Bd6"), so they can be told apart at a glance
      const seen = new Map();
      g.chapters = g.chapters.map((c) => {
        if (c.own) return { ...c, title: c.course.name };
        const long = [...c.course.lines].sort((x, y) => y.san.length - x.san.length)[0]?.san || [];
        const i = c.course.path.length;
        const mv = long[i];
        let title = mv ? `${g.name}: ${Math.floor(i / 2) + 1}${i % 2 ? '...' : '.'}${mv}` : long.length ? `${g.name}: ${Math.ceil(long.length / 2)} moves` : g.name;
        seen.set(title, (seen.get(title) || 0) + 1);
        if (seen.get(title) > 1) title += ` (${seen.get(title)})`;
        return { ...c, title };
      });
      return g;
    })
    .sort((a, b) => (b.name === 'Famous traps') - (a.name === 'Famous traps') || b.weight - a.weight || b.chapters.length - a.chapters.length);
}

// roughly how often each opening is played (club and online games), most played first; anything else follows by how much theory it has
const MOST_PLAYED = ['Sicilian Defense', 'Italian Game', 'Ruy Lopez', 'French Defense', 'Caro-Kann Defense', "Queen's Gambit", 'London System', "King's Indian Defense", 'Scandinavian Defense', 'English Opening', 'Pirc Defense', 'Scotch Game', "Petrov's Defense", 'Vienna Game', "King's Gambit", 'Nimzo-Indian Defense', 'Slav Defense', 'Dutch Defense', 'Grünfeld Defense', 'Catalan Opening', 'Philidor Defense', 'Alekhine Defense', 'Réti Opening', 'Benoni Defense', 'Smith-Morra Gambit', 'Four Knights Game', "Queen's Indian Defense", "Bishop's Opening", 'Modern Defense', 'Trompowsky Attack', 'Colle System', 'Torre Attack', 'Danish Gambit', 'Blackmar-Diemer Gambit', 'Budapest Gambit', 'Benko Gambit', 'Englund Gambit', 'Elephant Gambit', 'Latvian Gambit', 'Ponziani Opening', 'Center Game', 'Bird Opening'];
export function popularRank(fam) {
  const i = MOST_PLAYED.indexOf(fam.name);
  return i >= 0 ? i : MOST_PLAYED.length + 1 / (1 + fam.lines.length);
}
