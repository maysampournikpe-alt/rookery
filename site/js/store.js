// Progress store: spaced repetition per line, streak, XP, settings. Persisted in localStorage.
const KEY = 'rookery:v1';
const DAY = 86400000;
export const INTERVALS = [0, 1, 3, 7, 16, 35]; // days per box
export const LEARNED_BOX = 1; // one perfect run earns the check mark; practice brings it back on a schedule
export const MASTERED_BOX = 3;

let state = { lines: {}, streak: { count: 0, last: '' }, xp: 0, settings: { theme: 'auto', sound: true, flip: false }, daily: {} };
const listeners = new Set();

try {
  const raw = localStorage.getItem(KEY);
  if (raw) state = { ...state, ...JSON.parse(raw) };
} catch {
  /* storage blocked: progress lives for this session only */
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((f) => f());
}

export const onChange = (f) => (listeners.add(f), () => listeners.delete(f));
export const settings = () => state.settings;
export function setSetting(k, v) {
  state.settings[k] = v;
  save();
}

const today = () => new Date().toISOString().slice(0, 10);

export function lineState(id) {
  return state.lines[id] || { box: 0, due: 0, ok: 0, fail: 0, last: 0 };
}

export function isLearned(id) {
  return lineState(id).box >= LEARNED_BOX;
}

export function isDue(id, now = Date.now()) {
  const s = state.lines[id];
  return !!s && s.box > 0 && s.due <= now;
}

// clean = the whole line was played with no mistakes and no hints
export function recordRun(id, clean) {
  const s = { ...lineState(id) };
  const now = Date.now();
  if (clean) {
    s.box = Math.min(5, s.box + 1);
    s.ok++;
    state.xp += 10 + s.box * 2;
  } else {
    s.box = Math.max(0, s.box - 1);
    s.fail++;
    state.xp += 2;
  }
  s.due = now + INTERVALS[s.box] * DAY;
  s.last = now;
  state.lines[id] = s;
  const t = today();
  state.daily[t] = (state.daily[t] || 0) + 1;
  bumpStreak(t);
  save();
  return s;
}

function bumpStreak(t) {
  const st = state.streak;
  if (st.last === t) return;
  const y = new Date(Date.now() - DAY).toISOString().slice(0, 10);
  st.count = st.last === y ? st.count + 1 : 1;
  st.last = t;
}

export function streak() {
  const st = state.streak;
  const t = today();
  const y = new Date(Date.now() - DAY).toISOString().slice(0, 10);
  return st.last === t || st.last === y ? st.count : 0;
}

export const xp = () => state.xp;
export const stars = () => Object.values(state.lines).reduce((n, l) => n + (l.ok || 0), 0);
export const doneToday = () => state.daily[today()] || 0;

export function counts(ids) {
  let learned = 0;
  let due = 0;
  let started = 0;
  const now = Date.now();
  for (const id of ids) {
    const s = state.lines[id];
    if (!s) continue;
    if (s.box > 0 || s.ok + s.fail > 0) started++;
    if (s.box >= LEARNED_BOX) learned++;
    if (s.box > 0 && s.due <= now) due++;
  }
  return { learned, due, started, total: ids.length };
}

export function resetAll() {
  state = { lines: {}, streak: { count: 0, last: '' }, xp: 0, settings: state.settings, daily: {} };
  save();
}

export function exportProgress() {
  return JSON.stringify(state);
}

export function importProgress(json) {
  const s = JSON.parse(json);
  if (!s.lines) throw new Error('Not a Rookery progress file');
  state = { ...state, ...s };
  save();
}
