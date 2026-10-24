import { Chess } from '../../vendor/chess.js';
import { D, loadData, slug } from '../data.js';
import { kvAll, kvSet, kvDel } from '../db.js';
import { GameSplitter, parseGame, newStatNode, addToStats, pruneStats, acceptGame, dropPrefixes } from '../pgn.js';
import { h, toast, plural, sleep } from '../ui.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function legalPrefix(san) {
  const c = new Chess();
  const out = [];
  for (const m of san) {
    try {
      c.move(m);
      out.push(c.history().at(-1));
    } catch {
      break;
    }
  }
  return out;
}

async function readTexts(files, onChunk) {
  for (const f of files) {
    const reader = f.stream().pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      await onChunk(value, f);
    }
    await onChunk(null, f);
  }
}

async function importRepertoire(files, text, { name, side }, log) {
  const lines = [];
  let games = 0;
  let skipped = 0;
  const handle = (g, fallback) => {
    const p = parseGame(g);
    if (p.headers.FEN && p.headers.FEN.split(' ')[0] !== START.split(' ')[0]) return void skipped++;
    games++;
    const chapter = (p.headers.Opening || p.headers.Event || fallback || '').replace(/^.*?:\s*/, '').trim() || fallback || `Line ${games}`;
    p.lines.forEach((l, i) => {
      const ok = legalPrefix(l);
      if (ok.length < 2) return void skipped++;
      lines.push({ name: p.lines.length > 1 ? `${chapter} #${i + 1}` : chapter, san: ok });
    });
  };
  if (text) {
    const s = new GameSplitter();
    [...s.push('\n' + text + '\n'), ...s.end()].forEach((g) => handle(g, name));
  }
  const splitters = new Map();
  await readTexts(files, async (chunk, f) => {
    if (!splitters.has(f)) splitters.set(f, new GameSplitter());
    const s = splitters.get(f);
    const gs = chunk == null ? s.end() : s.push(chunk);
    for (const g of gs) handle(g, f.name.replace(/\.\w+$/, ''));
    log(`${games} games · ${lines.length} lines`);
    if (chunk != null) await sleep(0);
  });
  if (!lines.length) throw new Error('No playable lines found in that PGN.');
  const id = slug(name) + '-' + Date.now().toString(36);
  await kvSet('rep:' + id, { id, name, side, lines });
  return { games, lines: lines.length, skipped };
}

async function importDatabase(files, text, { name, minElo, maxPly, minGames }, log) {
  const tree = newStatNode();
  let seen = 0;
  let used = 0;
  const handle = (g) => {
    seen++;
    const p = parseGame(g, { variations: false });
    if (!acceptGame(p.headers, { minElo })) return;
    used++;
    addToStats(tree, p.main, p.headers.Result, maxPly);
  };
  if (text) {
    const s = new GameSplitter();
    [...s.push('\n' + text + '\n'), ...s.end()].forEach(handle);
  }
  const splitters = new Map();
  await readTexts(files, async (chunk, f) => {
    if (!splitters.has(f)) splitters.set(f, new GameSplitter());
    const s = splitters.get(f);
    for (const g of chunk == null ? s.end() : s.push(chunk)) {
      handle(g);
      if (seen % 2000 === 0) {
        log(`${seen.toLocaleString()} games read · ${used.toLocaleString()} kept`);
        await sleep(0);
      }
    }
  });
  if (!used) throw new Error('No games matched your filters (check the minimum rating).');
  pruneStats(tree, minGames);
  const id = slug(name) + '-' + Date.now().toString(36);
  await kvSet('db:' + id, { id, name, games: used, minElo, maxPly, tree });
  return { games: used, seen };
}

export async function render(root) {
  const reps = await kvAll('rep:');
  const dbs = await kvAll('db:');
  let mode = 'rep';
  const status = h('div', { 'aria-live': 'polite', style: 'margin-top:12px;color:var(--muted)' });
  const fileInput = h('input', { type: 'file', multiple: true, accept: '.pgn,.txt,text/plain', style: 'display:none' });
  const names = h('div', { style: 'margin-top:8px;font-size:14px' });
  const drop = h('div', { class: 'drop', tabindex: 0, role: 'button', 'aria-label': 'Choose PGN files', onclick: () => fileInput.click(), onkeydown: (e) => e.key === 'Enter' && fileInput.click() }, h('b', {}, 'Drop PGN files here'), h('div', {}, 'or click to choose · .pgn from Lichess studies, ChessBase, books…'), names);
  let files = [];
  const setFiles = (fl) => {
    files = [...fl];
    names.textContent = files.map((f) => `${f.name} (${(f.size / 1048576).toFixed(1)} MB)`).join(' · ');
    const nm = form.querySelector('[name=name]');
    if (files[0] && !nm.value) nm.value = files[0].name.replace(/\.\w+$/, '').replace(/[_-]+/g, ' ');
  };
  fileInput.onchange = () => setFiles(fileInput.files);
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => (e.preventDefault(), drop.classList.add('over'))));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => (e.preventDefault(), drop.classList.remove('over'))));
  drop.addEventListener('drop', (e) => setFiles(e.dataTransfer.files));

  const field = (label, el) => h('div', { class: 'field' }, h('label', {}, label), el);
  const repOpts = h('div', { class: 'row2' }, field('Play as', h('select', { name: 'side' }, h('option', { value: 'white' }, 'White'), h('option', { value: 'black' }, 'Black'))));
  const dbOpts = h(
    'div',
    { class: 'row2', hidden: true },
    field('Minimum rating (both players)', h('input', { name: 'minElo', type: 'number', value: '2300', min: '0', step: '50' })),
    field('Depth (half-moves)', h('input', { name: 'maxPly', type: 'number', value: '30', min: '4', max: '80' })),
    field('Keep moves seen in ≥ N games', h('input', { name: 'minGames', type: 'number', value: '3', min: '1' })),
  );
  const seg = h(
    'div',
    { class: 'seg', role: 'group' },
    h('button', { type: 'button', 'aria-pressed': 'true', onclick: () => setMode('rep') }, 'Repertoire (train)'),
    h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => setMode('db') }, 'Game database (stats)'),
  );
  const modeHelp = h('p', { style: 'color:var(--muted);margin:8px 0 0;font-size:14px' });
  function setMode(m) {
    mode = m;
    [...seg.children].forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0) === (m === 'rep'))));
    repOpts.hidden = m !== 'rep';
    dbOpts.hidden = m !== 'db';
    modeHelp.textContent =
      m === 'rep'
        ? 'Every line and variation becomes a trainable line. Lichess study exports (with variations) work perfectly.'
        : 'Builds a move-frequency tree with win/draw/loss stats that shows up in the Explorer. Filter by rating to keep it master-level.';
  }

  const pasted = h('textarea', { rows: 5, placeholder: 'Or paste PGN text here…', name: 'text' });
  const go = h('button', { class: 'btn primary', type: 'submit' }, 'Import');
  const form = h(
    'form',
    {
      class: 'panel',
      onsubmit: async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const text = (fd.get('text') || '').toString().trim();
        if (!files.length && !text) return toast('Choose a file or paste some PGN first');
        const name = (fd.get('name') || 'My repertoire').toString().trim() || 'My repertoire';
        go.disabled = true;
        try {
          const log = (t) => (status.textContent = t);
          log('Reading…');
          const res =
            mode === 'rep'
              ? await importRepertoire(files, text, { name, side: fd.get('side') }, log)
              : await importDatabase(files, text, { name, minElo: +fd.get('minElo') || 0, maxPly: +fd.get('maxPly') || 30, minGames: +fd.get('minGames') || 1 }, log);
          await loadData();
          toast(mode === 'rep' ? `Added ${res.lines} lines` : `Indexed ${res.games.toLocaleString()} games`);
          location.hash = mode === 'rep' ? `#/opening/${slug(name)}` : '#/explorer';
          if (location.hash.startsWith('#/import')) render(root);
        } catch (err) {
          status.textContent = '';
          toast(err.message || 'Import failed');
          console.error(err);
        } finally {
          go.disabled = false;
        }
      },
    },
    h('div', {}, seg, modeHelp),
    field('Name', h('input', { name: 'name', placeholder: 'e.g. My Najdorf repertoire' })),
    repOpts,
    dbOpts,
    drop,
    fileInput,
    h('div', { class: 'field', style: 'margin-top:12px' }, pasted),
    h('div', { class: 'actions' }, go),
    status,
  );

  const manage = (title, items, prefix, fmt) =>
    h(
      'div',
      { class: 'panel' },
      h('h3', {}, title),
      items.length
        ? h(
            'ul',
            { class: 'list' },
            items.map((it) =>
              h(
                'li',
                {},
                h('span', {}, h('b', {}, it.name), h('div', { class: 'sub', style: 'color:var(--muted);font-size:13px' }, fmt(it))),
                h(
                  'button',
                  {
                    class: 'btn sm ghost',
                    onclick: async () => {
                      await kvDel(prefix + it.id);
                      await loadData();
                      render(root);
                    },
                  },
                  'Delete',
                ),
              ),
            ),
          )
        : h('p', { style: 'color:var(--muted)' }, 'Nothing yet.'),
    );

  root.replaceChildren(
    h(
      'div',
      { style: 'padding-top:28px;max-width:860px' },
      h('p', { class: 'crumb', style: 'margin:0' }, 'Import'),
      h('h1', { class: 'title' }, 'Bring your own books & databases'),
      h('p', { class: 'blurb' }, 'Everything stays in your browser. Import PGN exports from Lichess studies, ChessBase or opening books to train them, or load a master game database to see real win rates for every move. For multi-gigabyte databases, pre-build them with the command line tool in the repository (see README).'),
      form,
      h('div', { class: 'grid2' }, manage('Your repertoires', reps, 'rep:', (r) => `${plural(r.lines.length, 'line')} · as ${r.side}`), manage('Game databases', dbs, 'db:', (d) => `${d.games.toLocaleString()} games · ${d.minElo ? d.minElo + '+ rated' : 'all ratings'}`)),
    ),
  );
  setMode('rep');
}
