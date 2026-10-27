// Turns the miner's out-*.jsonl into a study file of trap chapters.
//   node gen.cjs <dir with out-*.jsonl> [max traps] > ../../data/studies/12-traps-mined.pgn
const fs = require('fs');
const dir = process.argv[2] || '.';
const MAX_TOTAL = +process.argv[3] || 160;
const MAX_PER_FAM = 14;
(async () => {
  const { Chess } = await import(require('url').pathToFileURL(require('path').join(__dirname, '../../site/vendor/chess.js')).href);
  const rows = fs.readdirSync(dir).filter((f) => /^out-\w+\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(`${dir}/${f}`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  const V = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const mat = (c) => { let m = 0; for (const r of c.board()) for (const q of r) if (q) m += (q.color === 'w' ? 1 : -1) * V[q.type]; return m; };
  // capture-only search: does the side to move win material right away? (white's point of view)
  const qs = (c, alpha, beta, d) => {
    const sgn = c.turn() === 'w' ? 1 : -1;
    let stand = sgn * mat(c);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (d > 6) return alpha;
    for (const m of c.moves({ verbose: true })) {
      if (!m.captured) continue;
      c.move(m);
      const s = -qs(c, -beta, -alpha, d + 1);
      c.undo();
      if (s >= beta) return beta;
      if (s > alpha) alpha = s;
    }
    return alpha;
  };
  const staticWhite = (c) => (c.turn() === 'w' ? 1 : -1) * qs(c, -1e6, 1e6, 0);
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
  const mv = (c, u) => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  const num = (ply, first) => (ply % 2 === 0 ? `${ply / 2 + 1}. ` : first ? `${(ply + 1) / 2}... ` : '');
  const seen = new Set();
  const cand = [];
  for (const r of rows) {
    const key = r.path.join(' ') + '|' + r.blunder;
    if (seen.has(key)) continue;
    seen.add(key);
    if (/Traps,/.test(r.name)) continue;
    if (!r.seed && /^[RK]/.test(r.blunder) || (/^Q/.test(r.blunder) && !/x/.test(r.blunder))) continue; // rook, king and quiet queen moves are rarely natural mistakes
    const c = new Chess();
    for (const m of r.path) c.move(m);
    const trapper = r.victim === 'w' ? 'b' : 'w';
    const sign = trapper === 'w' ? 1 : -1;
    const start = mat(c);
    const bl = c.move(r.blunder);
    // a blunder that just hangs a piece is not a trap: the capture must not win material by itself
    const hang = sign * (staticWhite(c) - start);
    if (hang >= 150 && !r.seed) continue;
    const sans = [bl.san];
    const t = new Chess(c.fen());
    const gains = [];
    let mated = false, fork = false;
    for (let i = 0; i < Math.min(r.pv.length, 14); i++) {
      let m; try { m = mv(t, r.pv[i]); } catch { break; }
      sans.push(m.san);
      if (i % 2 === 0 && i < 6 && m.piece !== 'p') { // does the trapper's move attack two things at once?
        const f = t.fen().split(' ');
        const inCheck = t.inCheck();
        f[1] = f[1] === 'w' ? 'b' : 'w';
        f[3] = '-';
        try {
          const x = new Chess(f.join(' '));
          const hits = x.moves({ square: m.to, verbose: true }).filter((q) => q.captured && V[q.captured] >= 300 && q.captured !== 'k').length;
          if (hits + (inCheck ? 1 : 0) >= 2) fork = true;
        } catch { /* odd position */ }
      }
      gains.push(sign * (mat(t) - start));
      if (t.isCheckmate()) { mated = true; break; }
    }
    // cut where the trapper has netted material and the victim has had a chance to recapture
    let cut = 0, best = 0;
    if (mated) { cut = sans.length; best = 9999; } else {
      let bi = -1;
      for (let i = 1; i < gains.length; i += 2) if (bi < 0 || gains[i] > gains[bi] + 30) bi = i; // the settled material peak, earliest one
      if (bi >= 0 && gains[bi] >= (r.seed ? 150 : 250)) { cut = Math.min(bi + 2, sans.length); best = gains[bi]; }
    }
    if (!cut) continue;
    const line = sans.slice(0, Math.min(cut, sans.length));
    if (r.path.length + line.length > 26) continue;
    const n = r.path.length;
    const label = `${Math.floor(n / 2) + 1}${n % 2 === 0 ? '.' : '...'}${bl.san}`;
    const motif = mated ? 'Mating Trap' : best >= 800 ? 'Queen Trap' : best >= 450 ? 'Rook Trap' : 'Piece Trap';
    cand.push({ r, fam: r.fam || famOf(r.name), trapper, label, motif, fork, line, score: (r.seed ? 1000 : 0) + (r.inBook ? 300 : 0) + (/^[NBQ]/.test(r.blunder) || /x/.test(r.blunder) ? 60 : 0) + Math.min(r.base - r.conf, 600) / 10 - r.path.length + (mated ? 40 : 0) });
  }
  cand.sort((a, b) => b.score - a.score);
  const per = new Map(), names = new Map();
  let total = 0;
  for (const o of cand) {
    if (total >= MAX_TOTAL || (per.get(o.fam) || 0) >= MAX_PER_FAM) continue;
    const { r } = o;
    const g = new Chess();
    let text = '';
    for (const m of r.path) { text += num(g.history().length, false) + g.move(m).san + ' '; }
    const p0 = g.history().length;
    // the sound alternative goes in a variation right after the blunder
    let alt = '';
    if (r.alt) { try { const a = new Chess(g.fen()); alt = num(p0, true) + a.move({ from: r.alt.slice(0, 2), to: r.alt.slice(2, 4), promotion: r.alt[4] }).san; } catch { /* none */ } }
    text += num(p0, false) + g.move(o.line[0]).san + ' ';
    if (alt) text += `(${alt}) `;
    for (let i = 1; i < o.line.length; i++) text += num(g.history().length, i === 1 && !!alt) + g.move(o.line[i]).san + ' ';
    // a trap is named after the line it springs from ("Hunt Variation Trap"); two in the same line are told apart by the move
    const segs = r.name.split(': ').slice(1).join(': ').split(',').map((x) => x.replace(/[:]/g, '').trim()).filter((x) => x && !/\d|Tactics in Junior|^Traps?$/i.test(x));
    let variation = segs[0] || '';
    if (/^(Accepted|Declined|Main Line|Normal Variation|Normal)$/i.test(variation)) variation = `${o.fam} ${variation}`;
    const famShort = o.fam.replace(/ (Defen[cs]e|Opening|Game|Attack)$/, '');
    if (variation && !variation.toLowerCase().includes(famShort.toLowerCase().split(' ')[0])) variation = `${famShort} ${variation}`;
    const kind = o.motif === 'Mating Trap' ? 'Mating' : o.fork ? 'Fork' : '';
    const base = variation ? (/Trap$/i.test(variation) ? variation : `${variation}${kind ? ' ' + kind : ''} Trap`) : `${o.fam}${kind ? ' ' + kind : ''} Trap`;
    let title = r.title || base;
    const k = `${o.fam}|${title}`;
    names.set(k, (names.get(k) || 0) + 1);
    if (!r.title && names.get(k) > 1) title += ` (${o.label})`;
    const note = o.motif === 'Mating Trap' ? 'leads to checkmate' : o.motif === 'Queen Trap' ? 'wins the queen' : o.motif === 'Rook Trap' ? 'wins a rook or more' : 'wins a piece';
    per.set(o.fam, (per.get(o.fam) || 0) + 1);
    total++;
    console.log(`[Event "${o.fam}: Traps, ${title}${r.title ? '' : ', ' + note} [${o.trapper}]"]\n\n${text.trim()} *\n`);
  }
  console.error(`${total} traps from ${rows.length} candidates (${cand.length} passed the filters)`);
})();
