// Check a hand-written trap: node extend.cjs "1.d4 d5 ..." -> eval before the last move, after it, and the engine's punishment
//   node extend.cjs "e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 d6 Bc4 Nf6 O-O Bg4"
const { Engine } = require('./eng.cjs');
(async () => {
  const { Chess } = await import(require('url').pathToFileURL(require('path').join(__dirname, '../../site/vendor/chess.js')).href);
  const moves = process.argv[2].split(/\s+/).filter((m) => m && !/^\d+\.+$/.test(m));
  const c = new Chess();
  for (const m of moves.slice(0, -1)) c.move(m);
  const eng = new Engine();
  const before = await eng.analyse(c.fen(), 16);
  const stm = c.turn();
  const w = (r, t) => (r.mate != null ? (r.mate > 0 ? 1 : -1) * 9999 : r.cp) * (t === 'w' ? 1 : -1);
  console.log('before the last move:', (w(before, stm) / 100).toFixed(2), 'best was', before.pv.slice(0, 3).join(' '));
  c.move(moves.at(-1));
  const after = await eng.analyse(c.fen(), 18);
  const t = new Chess(c.fen());
  const sans = [];
  for (const u of after.pv.slice(0, 10)) { try { sans.push(t.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san); } catch { break; } }
  console.log('after', moves.at(-1), ':', (w(after, c.turn()) / 100).toFixed(2), '(white view) punishment:', sans.join(' '));
  eng.quit();
})();
