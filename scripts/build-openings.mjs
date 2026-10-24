// Builds site/data/openings.json from every TSV in data/sources/** and data/lines/**.
// TSV columns: eco <tab> name <tab> pgn   (same format as lichess-org/chess-openings, CC0)
// Drop any extra TSV into data/lines/ (e.g. produced by scripts/pdf-to-lines.mjs) and re-run.
import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from '../site/vendor/chess.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsv') ? [p] : [];
  });

// lichess first so its names win; then other bundled sources; then user-added lines
const files = [...walk(join(root, 'data/sources')).sort((a, b) => (a.includes('/lichess/') ? -1 : b.includes('/lichess/') ? 1 : a.localeCompare(b))), ...walk(join(root, 'data/lines'))];
const seen = new Map(); // san string -> row
const lichessEpd = new Set(); // positions Lichess already names; other sources only add NEW positions
let bad = 0;

const tokens = (pgn) =>
  pgn
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));

for (const file of files) {
  const rel = relative(root, file);
  const src = rel.includes('/lichess/') ? 'lichess' : rel.includes('sources') ? 'scid' : 'book';
  const rows = readFileSync(file, 'utf8').split('\n').slice(1);
  for (const row of rows) {
    if (!row.trim()) continue;
    const [eco, name, pgn] = row.split('\t');
    if (!pgn) continue;
    const san = tokens(pgn);
    const game = new Chess();
    try {
      for (const m of san) game.move(m);
    } catch {
      bad++;
      continue;
    }
    const key = san.join(' ');
    const epd = game.fen().split(' ').slice(0, 4).join(' ');
    if (seen.has(key)) continue; // earlier (higher priority) source wins
    if (src === 'scid' && lichessEpd.has(epd)) continue; // position already has a Lichess name
    if (src === 'lichess') lichessEpd.add(epd);
    seen.set(key, { eco, name: name.trim(), san: key, epd, src });
  }
}

const lines = [...seen.values()].sort(
  (a, b) => a.eco.localeCompare(b.eco) || a.name.localeCompare(b.name) || a.san.length - b.san.length,
);
mkdirSync(join(root, 'site/data'), { recursive: true });
writeFileSync(
  join(root, 'site/data/openings.json'),
  JSON.stringify({ v: 1, built: new Date().toISOString().slice(0, 10), lines: lines.map((l) => [l.eco, l.name, l.san, l.epd, l.src === 'lichess' ? 0 : l.src === 'scid' ? 2 : 1]) }),
);
console.log(`${lines.length} lines written (${bad} skipped as illegal) from ${files.length} files`);
