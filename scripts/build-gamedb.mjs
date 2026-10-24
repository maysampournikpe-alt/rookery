// Builds a master-game statistics tree for the Explorer from big PGN files (streams, so multi-GB files are fine).
//
//   node scripts/build-gamedb.mjs --name "Masters 2500+" --min-elo 2500 --max-ply 30 --min-games 3 games1.pgn games2.pgn
//   unzip -p elite.zip | node scripts/build-gamedb.mjs --name "Elite" -      ("-" reads PGN from stdin)
//
// Writes site/data/db/<slug>.json and registers it in site/data/db/manifest.json.
// Tip: drop .pgn files in data/pgn/ and run `npm run build:db -- --name "My DB" data/pgn/*.pgn`.
import { createReadStream, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameSplitter, parseGame, newStatNode, addToStats, pruneStats, acceptGame } from '../site/js/pgn.js';
import { slug } from '../site/js/data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = { name: 'Games', 'min-elo': 0, 'max-ply': 30, 'min-games': 3 };
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) opt[args[i].slice(2)] = isNaN(+args[i + 1]) ? args[++i] : +args[++i];
  else files.push(args[i]);
}
if (!files.length) {
  console.error('usage: node scripts/build-gamedb.mjs --name "My DB" [--min-elo 2300] [--max-ply 30] [--min-games 3] file.pgn ...');
  process.exit(1);
}

const tree = newStatNode();
let seen = 0;
let used = 0;
const handle = (g) => {
  seen++;
  const p = parseGame(g, { variations: false });
  if (!acceptGame(p.headers, { minElo: +opt['min-elo'] })) return;
  used++;
  addToStats(tree, p.main, p.headers.Result, +opt['max-ply']);
};

for (const f of files) {
  const s = new GameSplitter();
  const stream = f === '-' ? process.stdin.setEncoding('utf8') : createReadStream(f, { encoding: 'utf8', highWaterMark: 1 << 22 });
  for await (const chunk of stream) {
    for (const g of s.push(chunk)) handle(g);
    if (seen % 50000 < 500 && seen) process.stderr.write(`\r${seen.toLocaleString()} games read, ${used.toLocaleString()} kept`);
  }
  for (const g of s.end()) handle(g);
}
process.stderr.write('\n');
if (!used) {
  console.error('No games matched. Check --min-elo, or that the PGN files have [Event ...] tags.');
  process.exit(1);
}
pruneStats(tree, +opt['min-games']);
const id = slug(String(opt.name));
const dir = join(root, 'site/data/db');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, id + '.json'), JSON.stringify({ id, name: String(opt.name), games: used, minElo: +opt['min-elo'], maxPly: +opt['max-ply'], tree }));
const mf = join(dir, 'manifest.json');
const manifest = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : { files: [] };
if (!manifest.files.includes(id + '.json')) manifest.files.push(id + '.json');
writeFileSync(mf, JSON.stringify(manifest));
console.log(`${used.toLocaleString()} of ${seen.toLocaleString()} games indexed -> site/data/db/${id}.json`);
