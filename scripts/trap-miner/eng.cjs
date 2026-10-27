// Tiny Stockfish UCI wrapper: analyse(fen, depth) -> { cp (from side-to-move), mate, pv:[uci...] }
const path = require('path');
const { spawn } = require('child_process');
class Engine {
  constructor() {
    this.p = spawn(process.execPath, [require('stockfish').findEngine('lite-single')], { stdio: 'pipe' });
    this.buf = '';
    this.wait = null;
    this.p.stdout.on('data', (d) => {
      this.buf += d.toString();
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        this.onLine(line);
      }
    });
    this.send('uci');
    this.send('setoption name Hash value 64');
  }
  send(s) { this.p.stdin.write(s + '\n'); }
  onLine(line) {
    if (this.multi && line.startsWith('info') && / multipv /.test(line) && / pv /.test(line)) {
      const k = /multipv (\d+)/.exec(line)[1], cp = /score cp (-?\d+)/.exec(line), mt = /score mate (-?\d+)/.exec(line), pv = / pv (.+)$/.exec(line);
      this.multi[k] = { move: pv[1].split(' ')[0], cp: cp ? +cp[1] : null, mate: mt ? +mt[1] : null };
    }
    if (this.cur && line.startsWith('info') && / pv /.test(line) && / depth /.test(line)) {
      const cp = /score cp (-?\d+)/.exec(line), mt = /score mate (-?\d+)/.exec(line), pv = / pv (.+)$/.exec(line);
      this.cur.cp = cp ? +cp[1] : null;
      this.cur.mate = mt ? +mt[1] : null;
      this.cur.pv = pv[1].split(' ');
    }
    if (line.startsWith('bestmove') && this.wait) {
      const w = this.wait; this.wait = null;
      w({ ...this.cur, best: line.split(' ')[1] });
    }
  }
  analyse(fen, depth = 12) {
    return new Promise((res) => {
      this.cur = {};
      this.multi = null;
      this.wait = res;
      this.send('setoption name MultiPV value 1');
      this.send('ucinewgame');
      this.send('position fen ' + fen);
      this.send('go depth ' + depth);
    });
  }
  // top-n moves: [{move (uci), cp (side to move), mate}]
  analyseMulti(fen, depth = 11, n = 4) {
    return new Promise((res) => {
      this.multi = {};
      this.cur = {};
      this.wait = () => res(Object.keys(this.multi).sort((a, b) => a - b).map((k) => this.multi[k]));
      this.send('setoption name MultiPV value ' + n);
      this.send('ucinewgame');
      this.send('position fen ' + fen);
      this.send('go depth ' + depth);
    });
  }
  quit() { this.send('quit'); this.p.kill(); }
}
module.exports = { Engine };
