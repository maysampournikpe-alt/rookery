// Extracts playable opening lines from an opening-book PDF into data/lines/<book>.tsv.
// Needs `pdftotext` (poppler-utils: apt install poppler-utils / brew install poppler).
//
//   node scripts/pdf-to-lines.mjs "My Book.pdf" --title "My Book" [--min-ply 8]
//   node scripts/build-openings.mjs      # merge the new lines into the site
//
// Every numbered move sequence starting at move 1 ("1.e4 e5 2.Nf3 ...") is validated move by move
// with chess.js. The legal prefix is kept, named after the deepest known opening it passes through,
// and tagged with the book title and page. Lines the dataset already has are skipped.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from '../site/vendor/chess.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const pdf = args.find((a) => !a.startsWith('--') && /\.pdf$/i.test(a));
const get = (k, d) => (args.includes('--' + k) ? args[args.indexOf('--' + k) + 1] : d);
if (!pdf) {
  console.error('usage: node scripts/pdf-to-lines.mjs book.pdf --title "Book title" [--min-ply 8]');
  process.exit(1);
}
const title = get('title', basename(pdf).replace(/\.pdf$/i, ''));
const minPly = +get('min-ply', 8);

let text;
try {
  text = execFileSync('pdftotext', ['-raw', pdf, '-'], { maxBuffer: 1 << 28 }).toString('utf8');
} catch {
  console.error('pdftotext failed. Install poppler-utils and check the PDF is text-based (scanned PDFs need OCR first).');
  process.exit(1);
}

// known names, keyed by move string, for naming by deepest prefix
const known = new Map();
for (const [, name, san] of JSON.parse(readFileSync(join(root, 'site/data/openings.json'), 'utf8')).lines.map((l) => l)) known.set(san, name);
const eco = new Map(JSON.parse(readFileSync(join(root, 'site/data/openings.json'), 'utf8')).lines.map((l) => [l[2], l[0]]));
const allKeys = [...known.keys()];

const FIGURINE = { '♔': 'K', '♕': 'Q', '♖': 'R', '♗': 'B', '♘': 'N', '♚': 'K', '♛': 'Q', '♜': 'R', '♝': 'B', '♞': 'N' };
const SAN = /^(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?$/;

function parseFrom(tokens) {
  const g = new Chess();
  const out = [];
  for (const raw of tokens) {
    let t = raw.replace(/[!?]+/g, '').replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O').replace(/[♔♕♖♗♘♚♛♜♝♞]/g, (c) => FIGURINE[c]);
    if (/^\d+\.+$/.test(t)) continue; // bare move number
    t = t.replace(/^\d+\.+/, ''); // "12.Nf3" / "12...Nf6"
    if (!t) continue;
    if (!SAN.test(t)) break;
    try {
      out.push(g.move(t).san);
    } catch {
      break;
    }
  }
  return out;
}

const pages = text.split('\f');
const found = new Map(); // key -> {san, page}
pages.forEach((pageText, pi) => {
  const flat = pageText.replace(/\s+/g, ' ');
  for (const m of flat.matchAll(/(?<![\d.])1\.\s?(?=[a-hNBRQKO♘♗♖♕♔])/g)) {
    const tokens = flat
      .slice(m.index)
      .replace(/(\d+)\.\s+(?=[a-hNBRQKO])/g, '$1.') // "12. Nf3" -> "12.Nf3"
      .split(' ')
      .slice(0, 160);
    const san = parseFrom(tokens);
    if (san.length >= minPly) found.set(san.join(' '), { san, page: pi + 1 });
  }
});

function deepest(san) {
  for (let i = san.length; i > 0; i--) {
    const k = san.slice(0, i).join(' ');
    if (known.has(k)) return { name: known.get(k), eco: eco.get(k) || '', exact: i === san.length };
  }
  return { name: 'Unclassified opening', eco: '', exact: false };
}

const rows = [];
let skipped = 0;
for (const [key, { san, page }] of found) {
  if (known.has(key) || allKeys.some((k) => k.startsWith(key + ' '))) {
    skipped++; // already known, or a prefix of a known line
    continue;
  }
  const d = deepest(san);
  rows.push([d.eco, `${d.name}: ${title}, p.${page}`, san.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join(' ')].join('\t'));
}
mkdirSync(join(root, 'data/lines'), { recursive: true });
const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
writeFileSync(join(root, `data/lines/${slug}.tsv`), 'eco\tname\tpgn\n' + rows.join('\n') + '\n');
console.log(`${found.size} sequences found in ${pages.length} pages; ${rows.length} new lines -> data/lines/${slug}.tsv (${skipped} already known)`);
