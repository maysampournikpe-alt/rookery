// node mine.cjs <shard> <shards> -> appends JSON lines to out-<shard>.jsonl
const fs = require('fs');
const { Engine } = require('./eng.cjs');
const shard = +process.argv[2], shards = +process.argv[3];
(async () => {
  const { Chess } = await import(require('url').pathToFileURL(require('path').join(__dirname, '../../site/vendor/chess.js')).href);
  const j = JSON.parse(fs.readFileSync(require('path').join(__dirname, '../../site/data/openings.json'), 'utf8'));
  // optional: only mine lines of these openings (file with one name per line)
  const only = process.env.FAMFILE ? new Set(fs.readFileSync(process.env.FAMFILE, 'utf8').split('\n').filter(Boolean)) : null;
  const PROMOTE = new Set(['Torre Attack', 'Colle System', 'London System', 'Barry Attack', 'Levitsky Attack', 'Stonewall Attack', 'Budapest Gambit']);
  const FIXF = { 'Ponziani Countergambit': 'Ponziani Opening', Trompowsky: 'Trompowsky Attack', 'Neo-Benoni': 'Benoni Defense' };
  const famOf = (name) => {
    const parts = name.split(': ');
    const f = FIXF[parts[0].split(',')[0]] || parts[0].replace(/, with .*$/, '');
    if (/^Evans Gambit/.test(f)) return 'Italian Game';
    if (/Smith-Morra/.test(name)) return 'Smith-Morra Gambit';
    if ((f === "Queen's Pawn Game" || f === 'Indian Defense') && parts[1] && PROMOTE.has(parts[1].split(',')[0])) return parts[1].split(',')[0];
    return f.replace(/^(.*(?:Gambit|Game|Defense|Countergambit)) (?:Accepted|Declined)$/, '$1');
  };
  const nodes = new Map(); // epd -> {san:[...], name, book:Set(sans)}
  const epd = (c) => c.fen().split(' ').slice(0, 4).join(' ');
  const BOOK = process.env.SRC === 'book'; // mine the hand-written study lines instead of the open data
  const MAXPLY = +process.env.MAXPLY || (BOOK ? 20 : 12);
  const MINPLY = +process.env.MINPLY || 2; // only positions at least this deep (to extend an earlier run)
  for (const [, name, san, , src] of j.lines) {
    if ((src === 1) !== BOOK) continue;
    if (only && !only.has(famOf(name))) continue;
    const ms = san.split(' ');
    const c = new Chess();
    for (let i = 0; i < Math.min(ms.length, MAXPLY); i++) {
      const before = epd(c);
      c.move(ms[i]);
      if (i >= MINPLY) {
        const n = nodes.get(before) || nodes.set(before, { path: ms.slice(0, i), name, book: new Set(), fen: null }).get(before);
        n.book.add(ms[i]);
        if (!n.fen) { const t = new Chess(); for (const m of ms.slice(0, i)) t.move(m); n.fen = t.fen(); }
      }
    }
  }
  const list = [...nodes.values()].sort((a, b) => a.path.length - b.path.length || (a.fen < b.fen ? -1 : 1)); // shallow, mainstream positions first
  console.error('nodes', list.length);
  const mine = list.filter((_, i) => i % shards === shard);
  const eng = new Engine();
  const out = fs.createWriteStream(`out-${process.env.TAG || (BOOK ? 'b' : '')}${shard}.jsonl`, { flags: 'a' });
  const natural = (m) => !(m.piece === 'k' && !m.flags.includes('k') && !m.flags.includes('q')) && !(m.piece === 'p' && 'abgh'.includes(m.from[0]) && !m.captured) ;
  let k = 0;
  for (const n of mine) {
    k++;
    if (k % 50 === 0) console.error(shard, k, '/', mine.length);
    const c = new Chess(n.fen);
    const victim = c.turn();
    const base = await eng.analyse(n.fen, 10);
    if (base.cp == null || Math.abs(base.cp) > 150) continue; // only balanced positions
    for (const m of c.moves({ verbose: true })) {
      if (!natural(m)) continue;
      c.move(m);
      const f2 = c.fen();
      const shallow = await eng.analyse(f2, 3);
      c.undo();
      const sv = shallow.cp == null ? (shallow.mate > 0 ? -9999 : 9999) : -shallow.cp; // victim's view
      if (sv < base.cp - 120) continue; // obviously bad already
      const deep = await eng.analyse(f2, 10);
      const dv = deep.cp == null ? (deep.mate > 0 ? -9999 : 9999) : -deep.cp;
      if (dv > base.cp - 250) continue;
      const conf = await eng.analyse(f2, 15);
      const cv = conf.cp == null ? (conf.mate > 0 ? -9999 : 9999) : -conf.cp;
      if (cv > base.cp - 250) continue;
      out.write(JSON.stringify({ path: n.path, name: n.name, victim, blunder: m.san, inBook: n.book.has(m.san), base: base.cp, shallow: sv, deep: dv, conf: cv, pv: conf.pv, alt: base.pv && base.pv[0], altBook: [...n.book] }) + '\n');
    }
  }
  out.end(); eng.quit();
})();
