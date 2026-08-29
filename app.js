/* ─────────────────────────────────────────────
   lofi lifts — client-side workout log
   All data lives in this browser's localStorage.
   ───────────────────────────────────────────── */

const KEY = 'lofi-lifts.v1';
const LB_PER_KG = 2.2046226218;

const EXERCISES = [
  { id: 'squat',    name: 'back squat'      },
  { id: 'bench',    name: 'bench press'     },
  { id: 'deadlift', name: 'deadlift'        },
  { id: 'ohp',      name: 'overhead press'  },
  { id: 'row',      name: 'barbell row'     },
];
const EX = Object.fromEntries(EXERCISES.map(e => [e.id, e]));

/* ── state ───────────────────────────────── */

let state = load();
let ui = {
  view: 'log',
  ex: state.sets.length ? state.sets[state.sets.length - 1].ex : 'squat',
  date: todayISO(),
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && Array.isArray(raw.sets)) {
      return { unit: raw.unit === 'kg' ? 'kg' : 'lb', sets: raw.sets };
    }
  } catch (_) { /* corrupt or blocked — start clean */ }
  return { unit: 'lb', sets: [] };
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (_) { toast('storage unavailable — data won\'t persist'); }
}

/* ── helpers ─────────────────────────────── */

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shiftISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return todayISO(dt);
}
function prettyDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (iso === todayISO()) return 'today';
  if (iso === shiftISO(todayISO(), -1)) return 'yesterday';
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
function daysAgo(iso) {
  const t = todayISO();
  if (iso === t) return 'today';
  const ms = new Date(t) - new Date(iso);
  const n = Math.round(ms / 86400000);
  if (n === 1) return 'yesterday';
  if (n < 7) return `${n}d ago`;
  if (n < 30) return `${Math.floor(n / 7)}w ago`;
  return `${Math.floor(n / 30)}mo ago`;
}

const toLb  = s => s.u === 'kg' ? s.w * LB_PER_KG : s.w;
const e1rm  = s => toLb(s) * (1 + s.r / 30);           // Epley, normalized to lb
const round = n => Math.round(n * 10) / 10;
const fmt   = n => String(round(n)).replace(/\.0$/, '');
const disp  = lb => state.unit === 'kg' ? fmt(lb / LB_PER_KG) : fmt(lb);

/* PRs are derived, never stored: walk each lift chronologically and
   flag any set that beat the running best estimated 1RM. Survives deletes. */
function prFlags() {
  const flags = new Set();
  const best = {};
  [...state.sets].sort((a, b) => a.ts - b.ts).forEach(s => {
    const e = e1rm(s);
    if (!(s.ex in best)) { best[s.ex] = e; return; }   // first set is the baseline, not a record
    if (e > best[s.ex] + 1e-9) { best[s.ex] = e; flags.add(s.id); }
  });
  return flags;
}

function setsFor(iso)      { return state.sets.filter(s => s.date === iso).sort((a, b) => a.ts - b.ts); }
function setsOfEx(exId)    { return state.sets.filter(s => s.ex === exId).sort((a, b) => a.ts - b.ts); }
function volume(list)      { return list.reduce((t, s) => t + toLb(s) * s.r, 0); }

/* ── inputs ──────────────────────────────── */

const weightIn = $('#weightIn'), repsIn = $('#repsIn');

function readNum(el, min, fallback) {
  const n = parseFloat(String(el.value).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n >= min ? n : fallback;
}
function bump(target, dir) {
  if (target === 'weight') {
    const step = state.unit === 'kg' ? 2.5 : 5;
    weightIn.value = fmt(Math.max(0, readNum(weightIn, 0, 0) + dir * step));
  } else {
    repsIn.value = String(Math.max(1, Math.round(readNum(repsIn, 1, 1)) + dir));
  }
}

/* press-and-hold to run the stepper — getting 45 → 315 shouldn't take 54 taps */
$$('.step').forEach(btn => {
  let t0, t1, held = false;
  const target = btn.dataset.target, dir = Number(btn.dataset.dir);
  const start = e => {
    e.preventDefault();
    held = false;
    bump(target, dir);
    t0 = setTimeout(() => {
      held = true;
      let speed = 130;
      const tick = () => { bump(target, dir); speed = Math.max(45, speed - 12); t1 = setTimeout(tick, speed); };
      tick();
    }, 420);
  };
  const stop = () => { clearTimeout(t0); clearTimeout(t1); held = false; };
  btn.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
});

[weightIn, repsIn].forEach(el => {
  el.addEventListener('focus', () => el.select());
  el.addEventListener('blur', () => {
    el.value = el === weightIn ? fmt(readNum(el, 0, 0)) : String(Math.max(1, Math.round(readNum(el, 1, 1))));
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter') { el.blur(); logSet(); } });
});

/* ── actions ─────────────────────────────── */

function logSet() {
  const w = readNum(weightIn, 0, 0);
  const r = Math.max(1, Math.round(readNum(repsIn, 1, 1)));
  const set = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: ui.date, ex: ui.ex, w, r, u: state.unit, ts: Date.now(),
  };

  const prev = setsOfEx(ui.ex);
  const prevBest = prev.length ? Math.max(...prev.map(e1rm)) : 0;

  state.sets.push(set);
  save();
  render();

  if (e1rm(set) > prevBest + 1e-9 && prev.length) {
    toast(`★ new PR — ${EX[ui.ex].name}`, true);
    if (navigator.vibrate) navigator.vibrate([18, 60, 18, 60, 40]);
  } else {
    if (navigator.vibrate) navigator.vibrate(14);
  }
  startRest(90);
}

function delSet(id) {
  state.sets = state.sets.filter(s => s.id !== id);
  save(); render();
}

function pickEx(id) {
  ui.ex = id;
  const hist = setsOfEx(id);
  if (hist.length) {                    // prefill with the last thing you did
    const last = hist[hist.length - 1];
    weightIn.value = state.unit === last.u ? fmt(last.w) : disp(toLb(last));
    repsIn.value = String(last.r);
  }
  render();
}

/* ── rest timer ──────────────────────────── */

let restT = null;
function startRest(secs) {
  clearInterval(restT);
  const bar = $('#restBar'), fill = $('#restFill'), label = $('#restTime');
  bar.hidden = false;
  let left = secs;
  const paint = () => {
    label.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    fill.style.width = `${(left / secs) * 100}%`;
  };
  paint();
  restT = setInterval(() => {
    left--;
    if (left <= 0) {
      clearInterval(restT); bar.hidden = true;
      if (navigator.vibrate) navigator.vibrate([90, 70, 90]);
      toast('rest over');
      return;
    }
    paint();
  }, 1000);
}
$('#restDismiss').addEventListener('click', () => { clearInterval(restT); $('#restBar').hidden = true; });

/* ── toast ───────────────────────────────── */

let toastT;
function toast(msg, gold = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast' + (gold ? ' gold' : '');
  el.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.hidden = true; }, gold ? 2600 : 1700);
}

/* ── render ──────────────────────────────── */

function render() {
  const flags = prFlags();
  renderChips();
  renderDate();
  renderLastRef();
  renderSets(flags);
  renderPRs(flags);
  renderHistory(flags);
  $('#unitBtn').textContent = state.unit;
  $('#unitTag').textContent = state.unit;
}

function renderChips() {
  const wrap = $('#exerciseChips');
  wrap.innerHTML = '';
  EXERCISES.forEach(e => {
    const b = document.createElement('button');
    b.className = 'chip' + (e.id === ui.ex ? ' on' : '');
    b.textContent = e.name;
    b.addEventListener('click', () => pickEx(e.id));
    wrap.appendChild(b);
  });
  const on = wrap.querySelector('.chip.on');
  if (on) on.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
}

function renderDate() {
  $('#dateLabel').textContent = prettyDate(ui.date);
  $('#dateSub').textContent = longDate(ui.date);
  $('#dayNext').disabled = ui.date >= todayISO();
}

function renderLastRef() {
  const ref = $('#lastRef');
  const all = setsOfEx(ui.ex);
  /* prefer the most recent *other* day as the number to beat; fall back to
     what's already on today's sheet so the line is never dead weight */
  let hist = all.filter(s => s.date !== ui.date);
  let sameDay = false;
  if (!hist.length) { hist = all; sameDay = true; }
  if (!hist.length) { ref.textContent = `no history for ${EX[ui.ex].name} yet`; return; }

  const lastDate = hist[hist.length - 1].date;
  const lastDay = hist.filter(s => s.date === lastDate);
  const top = lastDay.reduce((a, b) => (toLb(b) > toLb(a) ? b : a));
  const when = sameDay ? 'so far' : `last ${daysAgo(lastDate)}`;
  ref.innerHTML = `${when} · top set <b>${fmt(top.w)}${top.u} × ${top.r}</b> · ${lastDay.length} set${lastDay.length > 1 ? 's' : ''}`;
}

function renderSets(flags) {
  const list = setsFor(ui.date);
  const ul = $('#setList');
  ul.innerHTML = '';
  $('#setsEmpty').hidden = list.length > 0;
  $('#setsTitle').textContent = ui.date === todayISO() ? "today's sets" : 'sets logged';
  $('#volumeTag').textContent = list.length ? `${list.length} sets · ${disp(volume(list))} ${state.unit} volume` : '';

  const perEx = {};
  list.forEach(s => {
    perEx[s.ex] = (perEx[s.ex] || 0) + 1;
    const li = document.createElement('li');
    li.className = 'set-row' + (flags.has(s.id) ? ' is-pr' : '');
    li.innerHTML = `
      <span class="set-idx">${perEx[s.ex]}</span>
      <span class="set-main">
        <div class="set-load">${fmt(s.w)}<small> ${s.u}</small> × ${s.r}</div>
        <div class="set-meta">${EX[s.ex]?.name || s.ex} · e1rm ${disp(e1rm(s))} ${state.unit}</div>
      </span>
      ${flags.has(s.id) ? '<span class="pr-badge">PR</span>' : ''}
      <button class="del" aria-label="Delete set">×</button>`;
    li.querySelector('.del').addEventListener('click', () => delSet(s.id));
    ul.appendChild(li);
  });
}

function renderPRs(flags) {
  const grid = $('#prGrid');
  grid.innerHTML = '';
  let any = false;

  EXERCISES.forEach(e => {
    const sets = setsOfEx(e.id);
    if (!sets.length) return;
    any = true;

    const heaviest = sets.reduce((a, b) => (toLb(b) > toLb(a) ? b : a));
    const best1rm = sets.reduce((a, b) => (e1rm(b) > e1rm(a) ? b : a));
    const last = sets[sets.length - 1];

    const card = document.createElement('div');
    card.className = 'pr-card';
    card.innerHTML = `
      <div class="pr-head">
        <span class="pr-name">${e.name}</span>
        <span class="pr-when">${daysAgo(last.date)}</span>
      </div>
      <div class="pr-stats">
        <div class="pr-stat">
          <div class="pr-val">${fmt(heaviest.w)}<small> ${heaviest.u} × ${heaviest.r}</small></div>
          <div class="pr-key">top set</div>
        </div>
        <div class="pr-stat">
          <div class="pr-val">${disp(e1rm(best1rm))}<small> ${state.unit}</small></div>
          <div class="pr-key">est 1rm</div>
        </div>
        <div class="pr-stat">
          <div class="pr-val">${disp(volume(sets))}<small> ${state.unit}</small></div>
          <div class="pr-key">volume</div>
        </div>
      </div>`;
    grid.appendChild(card);
  });

  $('#prEmpty').hidden = any;
}

function renderHistory(flags) {
  const wrap = $('#historyList');
  wrap.innerHTML = '';
  const days = [...new Set(state.sets.map(s => s.date))].sort().reverse();
  $('#historyEmpty').hidden = days.length > 0;
  $('#historyTag').textContent = days.length ? `${days.length} session${days.length > 1 ? 's' : ''}` : '';

  days.forEach((d, i) => {
    const sets = setsFor(d);
    const byEx = {};
    sets.forEach(s => (byEx[s.ex] = byEx[s.ex] || []).push(s));
    const prCount = sets.filter(s => flags.has(s.id)).length;

    const card = document.createElement('div');
    card.className = 'day-card' + (i === 0 ? ' open' : '');
    card.innerHTML = `
      <div class="day-head">
        <div>
          <div class="day-date">${prettyDate(d)}</div>
          <div class="day-sum">${sets.length} sets · ${Object.keys(byEx).length} lifts · ${disp(volume(sets))} ${state.unit}${prCount ? ` · ${prCount} PR` : ''}</div>
        </div>
        <span class="day-caret">▸</span>
      </div>
      <div class="day-body">
        ${Object.entries(byEx).map(([ex, list]) => `
          <div class="hx-ex">
            <div class="hx-name">${EX[ex]?.name || ex}</div>
            <div class="hx-sets">
              ${list.map(s => `<span class="hx-set${flags.has(s.id) ? ' is-pr' : ''}">${fmt(s.w)}${s.u} × ${s.r}</span>`).join('')}
            </div>
          </div>`).join('')}
      </div>`;
    card.querySelector('.day-head').addEventListener('click', () => card.classList.toggle('open'));
    wrap.appendChild(card);
  });
}

/* ── wiring ──────────────────────────────── */

$('#logBtn').addEventListener('click', logSet);

$('#dayPrev').addEventListener('click', () => { ui.date = shiftISO(ui.date, -1); render(); });
$('#dayNext').addEventListener('click', () => {
  if (ui.date >= todayISO()) return;
  ui.date = shiftISO(ui.date, 1); render();
});

$('#unitBtn').addEventListener('click', () => {
  const from = state.unit;
  state.unit = from === 'lb' ? 'kg' : 'lb';
  const w = readNum(weightIn, 0, 0);
  weightIn.value = fmt(from === 'lb' ? w / LB_PER_KG : w * LB_PER_KG);
  save(); render();
  toast(`logging in ${state.unit}`);
});

$$('.tab').forEach(t => t.addEventListener('click', () => {
  ui.view = t.dataset.view;
  $$('.tab').forEach(x => x.classList.toggle('active', x === t));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${ui.view}`));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}));

$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lofi-lifts-${todayISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

$('#wipeBtn').addEventListener('click', () => {
  if (!confirm('Erase every set and PR on this device? This cannot be undone.')) return;
  state = { unit: state.unit, sets: [] };
  save(); render();
  toast('wiped clean');
});

/* keep "today" honest if the app sits open past midnight */
setInterval(() => { if (ui.date < todayISO() && !document.hidden) renderDate(); }, 60000);

pickEx(ui.ex);
