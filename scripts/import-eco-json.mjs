// Converts the SCID-derived entries of JeffML/eco.json (MIT) into data/sources/scid/scid.tsv,
// renaming SCID's short family prefixes to the Lichess family names so both sets merge into one tree.
//   git clone https://github.com/JeffML/eco.json /tmp/eco   (or just download ecoA..ecoE.json)
//   node scripts/import-eco-json.mjs /tmp/eco
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2] || '/tmp/eco';

const ALIAS = {
  Sicilian: 'Sicilian Defense',
  "King's Indian": "King's Indian Defense",
  English: 'English Opening',
  QGD: "Queen's Gambit Declined",
  QGA: "Queen's Gambit Accepted",
  'QGD Tarrasch': 'Tarrasch Defense',
  Spanish: 'Ruy Lopez',
  French: 'French Defense',
  'Nimzo-Indian': 'Nimzo-Indian Defense',
  Benoni: 'Benoni Defense',
  Gruenfeld: 'Grünfeld Defense',
  "Queen's Indian": "Queen's Indian Defense",
  Dutch: 'Dutch Defense',
  Slav: 'Slav Defense',
  'Caro-Kann': 'Caro-Kann Defense',
  'Semi-Slav': 'Semi-Slav Defense',
  Catalan: 'Catalan Opening',
  Reti: 'Réti Opening',
  Pirc: 'Pirc Defense',
  "Queen's Pawn": "Queen's Pawn Game",
  Scandinavian: 'Scandinavian Defense',
  'Old Indian': 'Old Indian Defense',
  'Old Benoni': 'Benoni Defense: Old Benoni',
  Alekhine: 'Alekhine Defense',
  'Two Knights': 'Italian Game: Two Knights Defense',
  Trompowsky: 'Trompowsky Attack',
  Modern: 'Modern Defense',
  Vienna: 'Vienna Game',
  Bird: 'Bird Opening',
  'Four Knights': 'Four Knights Game',
  Indian: 'Indian Defense',
  'Bogo-Indian': 'Bogo-Indian Defense',
  Scotch: 'Scotch Game',
  'Neo-Old Indian': 'Old Indian Defense: Neo-Old Indian',
  'Neo-Old Indian / Modern': 'Old Indian Defense: Neo-Old Indian / Modern',
  "Neo-King's Indian": "King's Indian Defense: Neo-King's Indian",
  'Russian Game': "Petrov's Defense",
  Philidor: 'Philidor Defense',
  "Neo-Queen's Indian": "Queen's Indian Defense: Neo-Queen's Indian",
  KGD: "King's Gambit Declined",
  KGA: "King's Gambit Accepted",
  'Nimzowitsch Defence': 'Nimzowitsch Defense',
  Polish: 'Polish Opening',
  Budapest: 'Budapest Gambit',
  Colle: 'Colle System',
  'Richter-Veresov': 'Richter-Veresov Attack',
  'Open Game': "King's Pawn Game",
  'Three Knights': 'Three Knights Opening',
  'Neo-Benoni': 'Benoni Defense: Neo-Benoni',
  'Owen Defence': 'Owen Defense',
  'Giuoco Piano': 'Italian Game: Giuoco Piano',
  'Giuoco Pianissimo': 'Italian Game: Giuoco Pianissimo',
  'Evans Gambit': 'Italian Game: Evans Gambit',
  'Blackmar-Diemer': 'Blackmar-Diemer Gambit',
  'Diemer-Duhm Gambit (DDG)': 'Blackmar-Diemer Gambit: Diemer-Duhm Gambit',
  'Neo-Indian': 'Indian Defense: Neo-Indian',
  Ponziani: 'Ponziani Opening',
  Blumenfeld: 'Blumenfeld Countergambit',
  'Neo-Gruenfeld': 'Neo-Grünfeld Defense',
  'Nimzowitsch-Larsen': 'Nimzo-Larsen Attack',
  'Scotch Gambit': 'Scotch Game: Scotch Gambit',
  Grob: 'Grob Opening',
  'Centre Game': 'Center Game',
  'Benko Opening': 'Benko Opening',
  'Van Geet': 'Van Geet Opening',
  'Hodgson Attack': "Queen's Pawn Game: Hodgson Attack",
  Italian: 'Italian Game',
};

function canon(name) {
  let head;
  let rest = '';
  const i = name.indexOf(': ');
  if (i > 0) [head, rest] = [name.slice(0, i), name.slice(i + 2)];
  else {
    const m = name.match(/^([^,]+), (.*)$/);
    [head, rest] = m ? [m[1], m[2]] : [name, ''];
  }
  const a = ALIAS[head];
  if (!a) return name;
  return rest ? `${a}: ${rest}` : a;
}

const all = {};
for (const f of ['ecoA', 'ecoB', 'ecoC', 'ecoD', 'ecoE']) Object.assign(all, JSON.parse(readFileSync(join(dir, f + '.json'), 'utf8')));

const rows = [];
for (const v of Object.values(all)) {
  if (v.src !== 'scid') continue;
  rows.push([v.eco, canon(v.name.trim()), v.moves].join('\t'));
}
mkdirSync(join(root, 'data/sources/scid'), { recursive: true });
writeFileSync(join(root, 'data/sources/scid/scid.tsv'), 'eco\tname\tpgn\n' + rows.join('\n') + '\n');
console.log(`${rows.length} SCID-derived lines written`);
