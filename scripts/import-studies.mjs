// Turns hand-written PGN studies (with variations) in data/studies/*.pgn into trainable lines.
//
//   node scripts/import-studies.mjs && node scripts/build-openings.mjs
//
// Each game in a study is one chapter: [Event "Italian Game: Giuoco Piano, vs ...Nf6"] and a move tree
// with ( ) variations. Every leaf of the tree becomes a line named after the chapter. Rules for writing studies:
//   - your side plays ONE move per position; branch only on the opponent's moves
//   - name chapters "<Opening>: <Variation>, <note>" so lines group under the right variation
// The import checks every move is legal and reports lines that leave known theory (the open opening
// data) early, which usually means a typo or an unusual move.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from '../site/vendor/chess.js';
import { GameSplitter, parseGame } from '../site/js/pgn.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'data/studies');
const strict = process.argv.includes('--strict');

// every position along every line we already know (by EPD, so transpositions count as known theory)
const epdOf = (c) => c.fen().split(' ').slice(0, 4).join(' ');
const known = new Set();
const eco = new Map();
for (const [e, , san, , src] of JSON.parse(readFileSync(join(root, 'site/data/openings.json'), 'utf8')).lines) {
  if (src === 1 || src === 3) continue; // skip earlier authored and engine lines
  const c = new Chess();
  for (const m of san.split(' ')) {
    c.move(m);
    known.add(epdOf(c));
  }
  eco.set(san, e);
}

const rows = [];
let chapters = 0;
let illegal = 0;
let outOfBook = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith('.pgn')).sort()) {
  const s = new GameSplitter();
  const text = readFileSync(join(dir, file), 'utf8');
  const games = [...s.push('\n' + text + '\n'), ...s.end()];
  for (const g of games) {
    const { headers, lines } = parseGame(g);
    const name = headers.Event;
    if (!name) continue;
    chapters++;
    for (const san of lines) {
      const c = new Chess();
      let ok = true;
      for (const m of san) {
        try {
          c.move(m);
        } catch {
          ok = false;
          console.error(`ILLEGAL ${m} in "${name}": ${san.join(' ')}`);
          break;
        }
      }
      if (!ok) {
        illegal++;
        continue;
      }
      let k = 0;
      const walk = new Chess();
      while (k < san.length && known.has((walk.move(san[k]), epdOf(walk)))) k++;
      // how far the line goes past anything in the open data
      if (k < Math.min(san.length, 6) || (strict && k < san.length - 8)) outOfBook.push(`${name}: leaves known theory at move ${Math.ceil((k + 1) / 2)} (${san.slice(0, k + 1).join(' ')})`);
      let e = '';
      for (let i = san.length; i > 0 && !e; i--) e = eco.get(san.slice(0, i).join(' ')) || '';
      rows.push([e, name, san.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(' ')].join('\t'));
    }
  }
}
writeFileSync(join(root, 'data/lines/studies.tsv'), 'eco\tname\tpgn\n' + rows.join('\n') + '\n');
console.log(`${rows.length} lines from ${chapters} chapters (${illegal} illegal skipped)`);
if (outOfBook.length) console.log(`\n${outOfBook.length} lines leave known theory early (check these):\n` + outOfBook.slice(0, 40).join('\n'));
