# Rookery

A free, open chess opening trainer that runs entirely in your browser. No account, no paywall, no server.

- **11,700+ named lines across 136 openings** (Sicilian alone has 1,600+), with ECO codes and transposition-aware naming
- **Trainer**: the opponent plays the book, you find your moves. Mistakes and hints are tracked, and every line goes through spaced repetition (1, 3, 7, 16, 35 day intervals)
- **Review queue** of due lines across every opening, a daily streak and XP
- **Position explorer**: play any moves, see what each continuation is called and how many lines follow it
- **Import your own material**: Lichess study PGNs and any repertoire PGN (with variations) become trainable openings; big master-game PGNs become win/draw/loss statistics in the explorer
- Light and dark themes, keyboard friendly, works on phones

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

It is a static site (`site/`), so any static host works. A GitHub Pages workflow is included (`.github/workflows/pages.yml`): push to `main`, enable Pages with the "GitHub Actions" source, done.

## Data sources

| Data | Source | License |
|---|---|---|
| Opening names and lines (about 3,900) | [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) | CC0 |
| Deep lines (about 7,700) | SCID-derived entries from [JeffML/eco.json](https://github.com/JeffML/eco.json), family names mapped to the Lichess names | MIT |
| Book lines | extracted from PDFs you provide (see below) | your books |
| Pieces | cburnett set, from Lichess | GPLv2+ / BSD / GFDL |
| Move generation | [chess.js](https://github.com/jhlywa/chess.js) | BSD-2 |

Lines are deduplicated by position: the Lichess name always wins, and the other sources only add positions Lichess does not name.

## Adding more lines

**In the browser** (Import page): drop in a `.pgn`. As a *repertoire* every line and variation becomes trainable. As a *game database* it builds a move tree with results, filtered by rating, shown in the Explorer. Everything is stored in your browser (IndexedDB).

**Opening book PDFs**: extract the move sequences into the dataset.

```bash
# needs poppler (pdftotext)
npm run import:pdf -- "My Book.pdf" --title "My Book"
npm run build:data
```

Every numbered line starting at move 1 is validated with chess.js, named after the deepest known opening it passes through, tagged with the book and page, and skipped if the dataset already has it. Scanned PDFs need OCR first.

**Huge master databases** (multi-GB): stream them in Node and ship the result with the site.

```bash
npm run build:db -- --name "Masters 2500+" --min-elo 2500 --max-ply 30 --min-games 3 data/pgn/*.pgn
```

This writes `site/data/db/<name>.json` and registers it in `site/data/db/manifest.json`. Raise `--min-games` to keep the file small.

**Your own TSV lines**: put `eco<TAB>name<TAB>pgn` files in `data/lines/` and run `npm run build:data`.

## Layout

```
site/            the static app (index.html, js/, css/, data/, pieces/)
scripts/         build tools (data merge, PDF import, game database builder, dev server)
data/sources/    upstream TSVs (lichess, scid)
data/lines/      extra lines (generated from books, or your own)
data/pgn/        your local PGN databases (git-ignored)
```
