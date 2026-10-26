// Run after import-studies: cuts every non-trap line back to its last quiet, roughly level position
// (|eval| <= 2.5 pawns, 3.5 for gambits) so no study line ends in the middle of a tactic or in a lost position.
// Lines that would be shorter than 8 plies are dropped. Needs: npm i stockfish (not a project dependency)
//   node trim.cjs [shard shards]   (run shards in parallel into trim-<n>.json, then  node trim.cjs merge)
const fs = require('fs');
const path = require('path');
const { Engine } = require('./eng.cjs');
const tsv = path.join(__dirname, '../../data/lines/studies.tsv');
(async () => {
  const { Chess } = await import(require('url').pathToFileURL(require('path').join(__dirname, '../../site/vendor/chess.js')).href);
  const lines = fs.readFileSync(tsv, 'utf8').split('\n');
  const head = lines.shift();
  const rows = lines.filter(Boolean);
  if (process.argv[2] === 'merge') {
    const cut = Object.assign({}, ...fs.readdirSync('.').filter((f) => /^trim-\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))));
    const out = [];
    for (const r of rows) {
      const [eco, name, pgn] = r.split('\t');
      const c = cut[r];
      if (c === undefined) out.push(r);
      else if (c) out.push([eco, name, c].join('\t'));
    }
    fs.writeFileSync(tsv, head + '\n' + out.join('\n') + '\n');
    console.log(`${rows.length} -> ${out.length} lines`);
    return;
  }
  const shard = +(process.argv[2] || 0), shards = +(process.argv[3] || 1);
  const eng = new Engine();
  const result = {};
  const mine = rows.filter((_, i) => i % shards === shard);
  for (const r of mine) {
    const [, name, pgn] = r.split('\t');
    if (/\[[wb]\]$/.test(name)) continue;
    const c = new Chess();
    c.loadPgn(pgn);
    const sans = c.history();
    const limit = /Gambit/.test(name) ? 350 : 250;
    const ev = async (k) => {
      const t = new Chess();
      for (const m of sans.slice(0, k)) t.move(m);
      const res = await eng.analyse(t.fen(), 11);
      return res.mate != null ? 9999 : Math.abs(res.cp);
    };
    if ((await ev(sans.length)) <= limit && !/[x+]/.test(sans.at(-1))) continue; // fine as it is
    let keep = 0;
    for (let k = sans.length - 1; k >= 8; k--) {
      if (/[x+]/.test(sans[k - 1])) continue;
      if ((await ev(k)) <= limit) { keep = k; break; }
    }
    if (!keep) { result[r] = ''; continue; }
    const t = new Chess();
    for (const m of sans.slice(0, keep)) t.move(m);
    result[r] = sans.slice(0, keep).map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(' ');
  }
  fs.writeFileSync(`trim-${shard}.json`, JSON.stringify(result));
  eng.quit();
})();
