// Engine check of every authored line (data/lines/studies.tsv).
//   node qa.cjs [shard shards | traps]    needs: npm i stockfish (not a project dependency)
// Prints lines whose final position is lopsided (|eval| > 1.8 pawns) so a human can check them, and trap lines that do not favour the trapper.
const fs = require('fs');
const { Engine } = require('./eng.cjs');
const trapsOnly = process.argv[2] === 'traps';
const shard = trapsOnly ? 0 : +(process.argv[2] || 0), shards = trapsOnly ? 1 : +(process.argv[3] || 1);
(async () => {
  const { Chess } = await import(require('url').pathToFileURL(require('path').join(__dirname, '../../site/vendor/chess.js')).href);
  const rows = fs.readFileSync(__dirname + '/../../data/lines/studies.tsv', 'utf8').split('\n').slice(1).filter(Boolean).filter((r) => !trapsOnly || /\[[wb]\]\t/.test(r)).filter((_, i) => i % shards === shard);
  const eng = new Engine();
  const chapters = new Map(); // trap chapters: best result over their lines
  for (const r of rows) {
    const [, name, pgn] = r.split('\t');
    const c = new Chess();
    c.loadPgn(pgn);
    const res = await eng.analyse(c.fen(), 12);
    const white = res.mate != null ? (res.mate > 0 ? 1 : -1) * 9999 * (c.turn() === 'w' ? 1 : -1) : (c.turn() === 'w' ? 1 : -1) * res.cp;
    const tag = /\[([wb])\]$/.exec(name);
    if (tag) {
      const mine = tag[1] === 'w' ? white : -white;
      chapters.set(name, Math.max(chapters.get(name) ?? -1e9, c.isCheckmate() ? 9999 : mine));
    } else if (Math.abs(white) > 180) console.log('LOPSIDED', (white / 100).toFixed(1).padStart(5), name, '|', pgn.split(' ').slice(-6).join(' '));
  }
  for (const [name, v] of chapters) if (v < 150) console.log('WEAK TRAP', (v / 100).toFixed(1).padStart(5), name);
  eng.quit();
})();
