// Grows a repertoire tree for thin openings: the opening's owner plays one good move per position (book first,
// engine-checked), the opponent branches over every plausible reply (book moves and the engine's top choices).
//   node grow.cjs <shard> <shards> [family names...]   -> grow-<shard>.tsv  (eco \t name \t pgn)
// Needs: npm i stockfish (not a project dependency)
const fs = require('fs');
const path = require('path');
const { Engine } = require('./eng.cjs');
const shard = +process.argv[2], shards = +process.argv[3];
const only = process.env.FAMFILE ? fs.readFileSync(process.env.FAMFILE, 'utf8').split('\n').filter(Boolean) : process.argv.slice(4);
const MAXPLY = +process.env.MAXPLY || 26;
const LEAVES = +process.env.LEAVES || 90;
const DEPTH = +process.env.DEPTH || 9;
const BRANCH = [4, 3, 3, 2, 2, 2, 1];
(async () => {
  const { Chess } = await import(require('url').pathToFileURL(path.join(__dirname, '../../site/vendor/chess.js')).href);
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, '../../site/data/openings.json'), 'utf8'));
  const epd = (c) => c.fen().split(' ').slice(0, 4).join(' ');
  const PROMOTE = new Set(['Torre Attack', 'Colle System', 'London System', 'Barry Attack', 'Levitsky Attack', 'Stonewall Attack', 'Budapest Gambit']);
  const FIX = { 'Ponziani Countergambit': 'Ponziani Opening', Trompowsky: 'Trompowsky Attack', 'Neo-Benoni': 'Benoni Defense' };
  const famOf = (name) => {
    const parts = name.split(': ');
    const f = FIX[parts[0].split(',')[0]] || parts[0].replace(/, with .*$/, '');
    if (/^Evans Gambit/.test(f)) return 'Italian Game';
    if (/Smith-Morra/.test(name)) return 'Smith-Morra Gambit';
    if ((f === "Queen's Pawn Game" || f === 'Indian Defense') && parts[1] && PROMOTE.has(parts[1].split(',')[0])) return parts[1].split(',')[0];
    return f.replace(/^(.*(?:Gambit|Game|Defense|Countergambit)) (?:Accepted|Declined)$/, '$1');
  };
  // book knowledge: how often each move is played from each position, and the name of every known line
  const book = new Map(); // epd -> Map(san -> count)
  const names = new Map(); // san path -> [eco, name]
  const fams = new Map();
  for (const [eco, name, san, , src] of j.lines) {
    if (src === 1) continue;
    const ms = san.split(' ');
    names.set(san, [eco, name]);
    const c = new Chess();
    for (let i = 0; i < Math.min(ms.length, 30); i++) {
      const key = epd(c);
      const m = book.get(key) || book.set(key, new Map()).get(key);
      m.set(ms[i], (m.get(ms[i]) || 0) + 1);
      c.move(ms[i]);
    }
    const f = famOf(name);
    if (!fams.has(f)) fams.set(f, []);
    fams.get(f).push({ name, ms });
  }
  const list = [...fams].filter(([, ls]) => ls.length >= (+process.env.MINLINES || 6)).map(([name, ls]) => {
    const root = ls.find((l) => l.name === name) || [...ls].sort((a, b) => a.ms.length - b.ms.length)[0];
    const side = /Defen[cs]e|Counter/.test(name) && !/Gambit|Opening|Attack/.test(name) ? 'black' : root.ms.length % 2 === 1 ? 'white' : 'black';
    return { name, root: root.ms, side };
  }).filter((f) => !only.length || only.includes(f.name)).sort((a, b) => (a.name < b.name ? -1 : 1));
  const mine = list.filter((_, i) => i % shards === shard);
  const eng = new Engine();
  const cache = new Map();
  const look = async (fen) => {
    if (!cache.has(fen)) cache.set(fen, await eng.analyseMulti(fen, DEPTH, 5));
    return cache.get(fen);
  };
  const toSan = (fen, uci) => { const c = new Chess(fen); return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san; };
  const score = (m) => (m.mate != null ? (m.mate > 0 ? 9000 : -9000) : m.cp); // side to move's view
  const rows = [];
  for (const fam of mine) {
    const gambit = /Gambit|Countergambit/.test(fam.name);
    const floor = gambit ? -320 : -200; // how bad the owner may stand
    const owner = fam.side === 'white' ? 'w' : 'b';
    const leaves = [];
    const nameFor = (ms) => { for (let i = ms.length; i > 0; i--) { const n = names.get(ms.slice(0, i).join(' ')); if (n && famOf(n[1]) === fam.name) return n; } return ['', fam.name]; }; // keep every line inside its own opening
    const expand = async (ms, oppDecisions, budget) => {
      const c = new Chess();
      for (const m of ms) c.move(m);
      if (ms.length >= MAXPLY || c.isGameOver()) return void leaves.push(ms);
      const fen = c.fen();
      const top = await look(fen);
      if (!top.length) return void leaves.push(ms);
      const best = score(top[0]);
      const ownerView = c.turn() === owner ? best : -best;
      if (ownerView < floor || ownerView > 350) return void (ms.length >= 8 && leaves.push(ms));
      const bk = book.get(epd(c));
      if (c.turn() === owner) {
        // the owner plays the most popular book move if the engine does not mind it, else the engine's choice
        let pick = top[0].move;
        if (bk) {
          const pop = [...bk].sort((a, b) => b[1] - a[1])[0][0];
          const hit = top.find((t) => toSan(fen, t.move) === pop);
          if (hit && score(hit) >= best - 45) pick = hit.move;
        }
        return expand([...ms, toSan(fen, pick)], oppDecisions, budget);
      }
      const width = Math.max(1, Math.min(BRANCH[Math.min(oppDecisions, BRANCH.length - 1)], budget));
      const cand = [];
      const seen = new Set();
      if (bk) for (const [san, n] of [...bk].sort((a, b) => b[1] - a[1])) {
        const hit = top.find((t) => toSan(fen, t.move) === san);
        if (hit && score(hit) >= best - 110 && !seen.has(san)) { cand.push(san); seen.add(san); }
      }
      for (const t of top) { const san = toSan(fen, t.move); if (!seen.has(san) && score(t) >= best - 60) { cand.push(san); seen.add(san); } }
      const used = cand.slice(0, width);
      for (const [i, san] of used.entries()) await expand([...ms, san], oppDecisions + 1, Math.max(1, Math.floor(budget / used.length) + (i < budget % used.length ? 1 : 0))); // share the line budget between the replies
    };
    await expand(fam.root, 0, LEAVES);
    const seen = new Set();
    for (const ms of leaves) {
      if (ms.length <= fam.root.length + 2) continue;
      const k = ms.join(' ');
      if (seen.has(k)) continue;
      seen.add(k);
      const [eco, name] = nameFor(ms);
      rows.push([eco, name, ms.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(' ')].join('\t'));
    }
    console.error(`${fam.name} (${fam.side}): ${leaves.length} lines`);
    fs.writeFileSync(`grow-${shard}.tsv`, rows.join('\n') + '\n');
  }
  eng.quit();
})();
