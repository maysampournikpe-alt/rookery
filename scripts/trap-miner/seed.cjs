// Hand-picked traps with their historical names: the engine fills in the punishment and the sound alternative.
//   node seed.cjs <dir>   writes <dir>/out-seed.jsonl
const fs = require('fs');
const { Engine } = require('./eng.cjs');
const SEEDS = [
  { fam: "Queen's Gambit Declined", title: 'Lasker Trap', moves: 'd4 d5 c4 e5 dxe5 d4 e3 Bb4+ Bd2 dxe3 Bxb4' },
  { fam: "Petrov's Defense", title: 'Stafford Gambit Queen Trap', moves: 'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5 Be2 h5 O-O Ng4 Bxg4 hxg4 Qxg4' },
  { fam: 'Smith-Morra Gambit', title: 'Bishop Pin Trap', moves: 'e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 d6 Bc4 Nf6 O-O Bg4' },
];
(async () => {
  const { Chess } = await import(require('url').pathToFileURL(require('path').join(__dirname, '../../site/vendor/chess.js')).href);
  const eng = new Engine();
  const out = [];
  for (const sd of SEEDS) {
    const ms = sd.moves.split(' ');
    const c = new Chess();
    for (const m of ms.slice(0, -1)) c.move(m);
    const victim = c.turn();
    const base = await eng.analyse(c.fen(), 14);
    c.move(ms.at(-1));
    const conf = await eng.analyse(c.fen(), 16);
    out.push({ seed: true, fam: sd.fam, title: sd.title, name: sd.fam, path: ms.slice(0, -1), victim, blunder: ms.at(-1), inBook: true, base: base.cp ?? 0, shallow: 0, deep: 0, conf: -(conf.cp ?? 0), pv: conf.pv, alt: base.pv[0], altBook: [] });
  }
  fs.writeFileSync(process.argv[2] + '/out-seed.jsonl', out.map((o) => JSON.stringify(o)).join('\n') + '\n');
  eng.quit();
})();
