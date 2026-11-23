// Rift Arena community site. All player text is inserted with textContent, never as HTML.
'use strict';
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const HEROES = [
  { n: 'Kaito', f: 'Vanguard', role: 'All-rounder', c: '#4aa8ff' },
  { n: 'Yuki', f: 'Ghost', role: 'Sniper', c: '#c9b6ff' },
  { n: 'Goro', f: 'Brick', role: 'Tank', c: '#ffb84d' },
  { n: 'Akane', f: 'Blaze', role: 'Demolitionist', c: '#ff5d7a' },
  { n: 'Mika', f: 'Voltage', role: 'Controller', c: '#ffe14d' },
];
const pic = i => `/media/hero-${HEROES[i] ? HEROES[i].f : 'Vanguard'}.webp`;
const store = {
  get(k, d) { try { const v = localStorage.getItem('rift_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('rift_' + k, JSON.stringify(v)); } catch (e) { /* private mode: fine */ } },
};
let toastT = 0;
function toast(t) { const n = $('toast'); n.textContent = t; n.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (n.hidden = true), 3200); }
async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
  let j = {}; try { j = await r.json(); } catch (e) { /* empty */ }
  if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
  return j;
}
const ago = t => { const s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return new Date(t).toLocaleDateString(); };
const clock = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// ============================================================ routing
const VIEWS = ['home', 'chat', 'report', 'track', 'staff'];
function route() {
  const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
  for (const x of VIEWS) $('v-' + x).hidden = x !== v;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === v));
  document.body.classList.toggle('chatmode', v === 'chat');
  if (v === 'chat') Chat.open();
  if (v === 'track') renderMine();
  if (v !== 'home') { const t = $('trailer'); if (t && !t.paused) t.pause(); }
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);

// ============================================================ home
let myHero = store.get('hero', 0);
function renderRoster() {
  const box = $('roster'); box.textContent = '';
  HEROES.forEach((h, i) => {
    const b = el('button', 'hcard' + (i === myHero ? ' on' : '')); b.type = 'button'; b.style.setProperty('--hc', h.c);
    const img = el('img'); img.src = pic(i); img.alt = h.n + ' in an exclusive skin'; img.loading = 'lazy';
    const d = el('div'); d.append(el('b', null, h.n), el('span', null, h.role + (i === myHero ? ' · your main' : '')));
    b.append(img, d); b.onclick = () => { myHero = i; store.set('hero', i); renderRoster(); toast(h.n + ' is now your main.'); Chat.setHero(i); };
    box.append(b);
  });
}
async function refreshStats() {
  try {
    const s = await api('/api/status');
    $('s-play').textContent = s.players; $('s-chat').textContent = s.chat; $('s-open').textContent = s.open; $('s-fixed').textContent = s.fixed;
    $('liveN').textContent = s.players + s.chat;
  } catch (e) { /* offline: keep dashes */ }
}

// ============================================================ chat
const Chat = (() => {
  let ws = null, me = null, myName = store.get('nick', ''), channels = [], counts = {}, cur = store.get('channel', 'global'), retry = 0, opened = false, joined = false;
  const msgsBox = $('msgs'), msgEls = new Map();
  const hint = (t, bad) => { const h = $('chatHint'); h.textContent = t; h.classList.toggle('bad', !!bad); };
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/chat`);
    ws.onopen = () => { retry = 0; hint('Connected.'); if (myName || acct()) send(joinMsg(myName)); else askName(); };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } on(m); };
    ws.onclose = () => { joined = false; setInput(false); const wait = Math.min(15000, 1000 * 2 ** retry++); hint(`Chat disconnected. Reconnecting in ${Math.round(wait / 1000)} s…`, true); setTimeout(connect, wait); };
  }
  const send = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
  // optional game-account login: verified name, and Developers get the DEV badge. The Team admin key counts as Developer too.
  const acct = () => store.get('acct', '');
  const joinMsg = name => ({ t: 'join', name, hero: myHero, ch: cur, token: acct() || undefined, admin: (typeof Staff !== 'undefined' && Staff.key) || undefined });
  const devTag = () => { const t = el('span', 'devtag', 'DEV'); t.title = 'Rift Arena developer'; return t; };
  function setInput(on) { $('say').disabled = !on; $('sendBtn').disabled = !on; if (on) $('say').placeholder = `Message #${chanName(cur)}`; }
  const chanName = id => (channels.find(c => c.id === id) || { name: id }).name;
  function on(m) {
    if (m.t === 'hello') { me = m.you; channels = m.channels; counts = m.counts; renderChannels(); }
    else if (m.t === 'joined') { joined = true; myName = m.name; store.set('nick', m.name); $('joinModal').hidden = true; setInput(true); hint(`Chatting as ${m.name}. Be kind, and never share personal info.`); }
    else if (m.t === 'history') { cur = m.ch; store.set('channel', cur); renderChannels(); renderHistory(m.messages); }
    else if (m.t === 'msg' && m.ch === cur) { addMsg(m.msg, true); if (m.msg.u === me) hint(`Chatting as ${myName}. Be kind, and never share personal info.`); }
    else if (m.t === 'deleted' && m.ch === cur) { const n = msgEls.get(m.id); if (n) { const nx = n.nextElementSibling; if (nx && nx.classList.contains('cont') && !(n.previousElementSibling && n.previousElementSibling.dataset.u === nx.dataset.u)) unCont(nx); n.remove(); msgEls.delete(m.id); } }
    else if (m.t === 'roster' && m.ch === cur) renderPeople(m.people);
    else if (m.t === 'counts') { counts = m.counts; renderChannels(); }
    else if (m.t === 'flagged') toast('Thanks. A moderator will look at that message.');
    else if (m.t === 'error') {
      if (m.code === 'name') { askName(); $('joinErr').textContent = m.msg; $('joinErr').hidden = false; }
      else hint(m.msg, true);
    }
  }
  function renderChannels() {
    const top = $('ch-topics'), reg = $('ch-regions'), sel = $('chSelect'); top.textContent = ''; reg.textContent = ''; sel.textContent = '';
    for (const c of channels) {
      const b = el('button', 'ch' + (c.id === cur ? ' on' : '')); b.type = 'button';
      const n = counts[c.id] || 0;
      b.append(el('span', 'hash', '#'), el('span', null, c.name), el('span', 'n' + (n ? '' : ' z'), String(n)));
      b.onclick = () => switchTo(c.id);
      (c.region ? reg : top).append(b);
      const o = el('option', null, `# ${c.name} (${n})`); o.value = c.id; o.selected = c.id === cur; sel.append(o);
    }
    const c = channels.find(x => x.id === cur) || {};
    $('roomName').textContent = '# ' + (c.name || cur); $('roomDesc').textContent = c.desc || (c.region ? 'Players in your region' : '');
    $('roomCount').textContent = (counts[cur] || 0) + ' here';
    if (joined) setInput(true);
  }
  function switchTo(id) { if (id === cur && msgsBox.childElementCount) return; cur = id; send({ t: 'channel', ch: id }); renderChannels(); }
  function renderHistory(list) {
    msgsBox.textContent = ''; msgEls.clear(); lastAuthor = null;
    if (!list.length) msgsBox.append(el('p', 'sys', `No messages in #${chanName(cur)} yet. Say hi!`));
    for (const m of list) addMsg(m, false);
    msgsBox.scrollTop = msgsBox.scrollHeight;
  }
  let lastAuthor = null, lastAt = 0;
  function addMsg(m, live) {
    const empty = msgsBox.querySelector('.sys'); if (empty) empty.remove();
    const nearBottom = msgsBox.scrollHeight - msgsBox.scrollTop - msgsBox.clientHeight < 80;
    const prev = msgsBox.lastElementChild, h = HEROES[m.hero] || HEROES[0], cont = !!prev && prev.dataset.u === m.u && m.at - +prev.dataset.at < 120000;
    const row = el('div', 'msg' + (cont ? ' cont' : '') + (m.u === me ? ' me' : '')); row.style.setProperty('--hc', h.c); row.dataset.u = m.u; row.dataset.at = m.at; row.dataset.name = m.name;
    const av = el('img', 'av'); av.src = pic(m.hero); av.alt = '';
    row.append(av);
    if (!cont) { const who = el('div', 'who'); who.append(el('b', null, m.name)); if (m.role === 'dev') who.append(devTag()); who.append(el('time', null, clock(m.at))); who.title = new Date(m.at).toLocaleString(); row.append(who); }
    row.append(el('p', null, m.text));
    const acts = el('div', 'acts');
    if (m.u !== me) { const f = el('button', null, 'Flag'); f.type = 'button'; f.title = 'Report this message to a moderator'; f.onclick = () => { send({ t: 'flag', ch: cur, id: m.id }); f.disabled = true; f.textContent = 'Flagged'; }; acts.append(f); }
    if (Staff.key) {
      const d = el('button', null, 'Delete'); d.type = 'button'; d.onclick = () => Staff.chat({ action: 'delete', channel: cur, id: m.id });
      const mu = el('button', null, 'Mute 1h'); mu.type = 'button'; mu.onclick = () => Staff.chat({ action: 'mute', user: m.u, minutes: 60 });
      acts.append(d, mu);
    }
    if (acts.childElementCount) row.append(acts);
    msgsBox.append(row); msgEls.set(m.id, row); lastAuthor = m.u; lastAt = m.at;
    if (!live || nearBottom || m.u === me) msgsBox.scrollTop = msgsBox.scrollHeight;
  }
  function unCont(row) { // a follow-up message whose head was deleted becomes a head itself
    row.classList.remove('cont'); const name = row.dataset.name || '';
    const who = el('div', 'who'); who.append(el('b', null, name), el('time', null, clock(+row.dataset.at))); row.insertBefore(who, row.querySelector('p'));
  }
  function renderPeople(list) {
    const box = $('peopleList'); box.textContent = '';
    list.sort((a, b) => (b.id === me) - (a.id === me) || a.name.localeCompare(b.name));
    for (const p of list) {
      const r = el('div', 'person' + (p.id === me ? ' me' : '')); r.style.setProperty('--hc', (HEROES[p.hero] || HEROES[0]).c);
      const av = el('img', 'av'); av.src = pic(p.hero); av.alt = '';
      r.append(av, el('b', null, p.name)); if (p.role === 'dev') r.append(devTag()); box.append(r);
    }
    if (!list.length) box.append(el('p', 'sys', 'Nobody here yet.'));
  }
  let pickHero = myHero;
  function askName() {
    $('joinModal').hidden = false; $('nick').value = myName || ''; pickHero = myHero;
    const box = $('heroPick'); box.textContent = '';
    HEROES.forEach((h, i) => {
      const b = el('button', i === pickHero ? 'on' : ''); b.type = 'button'; b.style.setProperty('--hc', h.c);
      const img = el('img'); img.src = pic(i); img.alt = '';
      b.append(img, document.createTextNode(h.n));
      b.onclick = () => { pickHero = i; box.querySelectorAll('button').forEach((x, j) => x.classList.toggle('on', j === i)); };
      box.append(b);
    });
    setTimeout(() => $('nick').focus(), 50);
    const al = $('acLogin'); if (al) al.onclick = async () => {
      const n = $('acName').value.trim(), pw = $('acPass').value;
      try { const r = await api('/api/account/login', { method: 'POST', body: JSON.stringify({ name: n, password: pw }) }); store.set('acct', r.token); $('acPass').value = ''; myHero = pickHero; store.set('hero', myHero); send(joinMsg(r.name)); }
      catch (x) { $('joinErr').textContent = x.message || 'Wrong name or password.'; $('joinErr').hidden = false; }
    };
  }
  $('joinForm').onsubmit = e => {
    e.preventDefault(); const n = $('nick').value.trim();
    if (n.length < 3) { $('joinErr').textContent = 'Your nickname needs at least 3 letters.'; $('joinErr').hidden = false; return; }
    $('joinErr').hidden = true; myHero = pickHero; store.set('hero', myHero); renderRoster(); send(joinMsg(n));
  };
  $('composer').onsubmit = e => { e.preventDefault(); const t = $('say').value.trim(); if (!t) return; send({ t: 'say', text: t }); $('say').value = ''; };
  $('chSelect').onchange = e => switchTo(e.target.value);
  return {
    open() { if (opened) return; opened = true; connect(); },
    setHero(i) { if (joined) { myHero = i; send(joinMsg(myName)); } },
    rejoin() { if (ws && ws.readyState === 1) send(joinMsg(myName || 'Player')); },
    rerender() { send({ t: 'channel', ch: cur }); },
  };
})();

// ============================================================ report
const CATS = [
  ['bug', 'Bug or glitch', 'Something looks or acts wrong'], ['crash', 'Crash or freeze', 'The game closes or stops'], ['perf', 'Lag or slow', 'Low FPS, stutter, long loading'],
  ['online', 'Online play', 'Matchmaking, 3v3, 5v5, Battle Royale'], ['payment', 'Purchase', 'Gems, packs or skins'], ['account', 'Progress', 'Levels, coins or save data'],
  ['player', 'Player behaviour', 'Cheating or being mean'], ['idea', 'Idea', 'Make the game better'], ['other', 'Something else', 'Anything not listed'],
];
function renderCats() {
  const box = $('cats'); box.textContent = '';
  CATS.forEach(([id, name, sub], i) => {
    const w = el('div', 'cat'), inp = el('input'); inp.type = 'radio'; inp.name = 'cat'; inp.id = 'cat-' + id; inp.value = id; if (!i) inp.checked = true;
    const l = el('label'); l.htmlFor = inp.id; l.append(el('b', null, name), el('span', null, sub));
    w.append(inp, l); box.append(w);
  });
}
let shotData = null;
function setShot(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast('Use a PNG, JPG or WEBP image.');
  if (file.size > 1.8e6) return toast('That image is over 1.8 MB. Try a smaller screenshot.');
  const r = new FileReader(); r.onload = () => { shotData = r.result; $('shotPrev').src = shotData; $('shotPrev').hidden = false; $('dropTxt').textContent = file.name + ' · click to change'; }; r.readAsDataURL(file);
}
$('r-shot').onchange = e => setShot(e.target.files[0]);
const drop = $('drop');
drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); setShot(e.dataTransfer.files[0]); };
$('repForm').onsubmit = async e => {
  e.preventDefault(); const err = $('repErr'); err.hidden = true;
  const title = $('r-title').value.trim(), details = $('r-details').value.trim();
  if (title.length < 4) { err.textContent = 'Give your report a short title (at least 4 letters).'; err.hidden = false; $('r-title').focus(); return; }
  if (details.length < 10) { err.textContent = 'Tell us what happened in at least one sentence.'; err.hidden = false; $('r-details').focus(); return; }
  const b = $('repBtn'); b.disabled = true; b.textContent = 'Sending…';
  try {
    const r = await api('/api/reports', { method: 'POST', body: JSON.stringify({
      category: (document.querySelector('input[name=cat]:checked') || {}).value, title, details, steps: $('r-steps').value,
      platform: $('r-platform').value, mode: $('r-mode').value, hero: $('r-hero').value, version: $('r-version').value, contact: $('r-contact').value,
      reporter: store.get('nick', ''), shot: shotData, website: $('r-website').value,
    }) });
    const mine = store.get('tickets', []); mine.unshift({ id: r.id, key: r.key, title, at: Date.now() }); store.set('tickets', mine.slice(0, 30));
    $('tkId').textContent = r.id; $('tkKey').textContent = r.key; $('repForm').hidden = true; $('repDone').hidden = false; window.scrollTo(0, 0);
  } catch (x) { err.textContent = x.message; err.hidden = false; }
  b.disabled = false; b.textContent = 'Send report';
};
$('tkCopy').onclick = async () => {
  const t = `Rift Arena ticket ${$('tkId').textContent} · code ${$('tkKey').textContent}`;
  try { await navigator.clipboard.writeText(t); toast('Copied. Paste it somewhere safe.'); }
  catch (e) { const s = getSelection(), rg = document.createRange(); rg.selectNodeContents(document.querySelector('.ticket')); s.removeAllRanges(); s.addRange(rg); toast('Selected. Press Ctrl+C to copy.'); }
};
$('repAgain').onclick = () => { $('repForm').reset(); shotData = null; $('shotPrev').hidden = true; $('dropTxt').textContent = 'Drop an image here or choose a file (PNG, JPG or WEBP, up to 1.8 MB)'; renderCats(); $('repForm').hidden = false; $('repDone').hidden = true; };

// ============================================================ tickets
const FLOW = ['open', 'investigating', 'fixed'];
const LABEL = { open: 'Received', investigating: 'Being looked at', fixed: 'Fixed', closed: 'Closed' };
function ticketCard(t) {
  const c = el('div', 'tk'), h = el('div', 'tk-h');
  h.append(el('span', 'tk-id', t.id), el('h3', null, t.title), el('span', 'pill ' + t.status, LABEL[t.status]));
  c.append(h);
  const meta = el('p', 'muted', `${t.categoryName} · sent ${ago(t.at)} · updated ${ago(t.updated)}`); meta.style.margin = '6px 0 0'; c.append(meta);
  const st = el('div', 'steps'), idx = t.status === 'closed' ? 2 : FLOW.indexOf(t.status);
  ['Received', 'Being looked at', t.status === 'closed' ? 'Closed' : 'Fixed'].forEach((s, i) => st.append(el('div', i <= idx ? 'reached' : '', s)));
  c.append(st);
  for (const n of t.notes) { const d = el('div', 'note'); d.append(el('time', null, 'Team reply · ' + ago(n.at)), el('p', null, n.text)); c.append(d); }
  return c;
}
async function lookup(id, key) {
  $('lookErr').hidden = true; $('lookOut').textContent = '';
  try { const t = await api(`/api/reports/${encodeURIComponent(id)}?key=${encodeURIComponent(key)}`); $('lookOut').append(ticketCard(t)); }
  catch (x) { $('lookErr').textContent = x.message; $('lookErr').hidden = false; }
}
$('lookForm').onsubmit = e => { e.preventDefault(); lookup($('l-id').value.trim().toUpperCase(), $('l-key').value.trim().toLowerCase()); };
function renderMine() {
  const box = $('mine'), list = store.get('tickets', []); box.textContent = '';
  if (!list.length) { box.append(el('p', 'muted', 'No tickets saved in this browser yet. Tickets you send from here show up automatically.')); return; }
  for (const t of list) {
    const r = el('div', 'mine-row'); const b = el('button', 'btn ghost sm', 'Check'); b.type = 'button';
    b.onclick = () => { $('l-id').value = t.id; $('l-key').value = t.key; lookup(t.id, t.key); };
    r.append(el('span', 'tk-id', t.id), el('span', null, t.title), el('span', 'muted', ago(t.at)), b); box.append(r);
  }
}

// ============================================================ staff desk
const Staff = (() => {
  let key = '', all = [], filter = 'active';
  const F = { active: 'Needs work', open: 'New', investigating: 'Investigating', fixed: 'Fixed', closed: 'Closed', all: 'All' };
  async function load() {
    const btn = document.querySelector('#admForm button'), ok = $('admOk');
    if (btn) { btn.disabled = true; btn.textContent = 'Opening... (can take up to a minute)'; } if (ok) ok.hidden = true; $('admErr').hidden = true;
    try { all = (await api('/api/admin/reports', { headers: { 'x-admin-token': key } })).reports; $('admErr').hidden = true; $('desk').hidden = false; render(); devs(); if (typeof Chat !== 'undefined' && Chat.rejoin) Chat.rejoin();
      if (ok) { ok.textContent = '\u2713 You are logged in as the owner. ' + all.length + (all.length === 1 ? ' ticket' : ' tickets') + ' so far. The Developers box is right below.'; ok.hidden = false; } }
    catch (x) { $('admErr').textContent = (x && x.message) || 'Could not reach the server. Wait a minute and try again.'; $('admErr').hidden = false; $('desk').hidden = true; if ($('devBox')) $('devBox').hidden = true; key = ''; S.key = ''; }
    if (btn) { btn.disabled = false; btn.textContent = 'Open desk'; }
  }
  function render() {
    const fb = $('filters'); fb.textContent = '';
    for (const k in F) { const n = all.filter(r => k === 'all' || (k === 'active' ? r.status === 'open' || r.status === 'investigating' : r.status === k)).length; const b = el('button', k === filter ? 'on' : '', `${F[k]} (${n})`); b.type = 'button'; b.onclick = () => { filter = k; render(); }; fb.append(b); }
    const box = $('deskList'); box.textContent = '';
    const list = all.filter(r => filter === 'all' || (filter === 'active' ? r.status === 'open' || r.status === 'investigating' : r.status === filter));
    if (!list.length) box.append(el('p', 'muted', 'Nothing here. Nice.'));
    for (const r of list) {
      const c = ticketCard({ ...r, notes: r.notes }); c.classList.add('dk');
      const dl = el('dl');
      const row = (k, v) => { if (v) dl.append(el('dt', null, k), el('dd', null, v)); };
      row('What happened', r.details); row('Steps', r.steps); row('Device', r.platform); row('Mode', r.mode); row('Hero', r.hero); row('Version', r.version); row('Reporter', r.reporter); row('Contact', r.contact);
      c.append(dl);
      if (r.shot) { const a = el('a'); a.href = '/uploads/' + r.shot; a.target = '_blank'; a.rel = 'noopener'; const im = el('img'); im.src = a.href; im.alt = 'Screenshot from the player'; a.append(im); c.append(a); }
      const act = el('div', 'dk-act'), sel = el('select'); sel.setAttribute('aria-label', 'Status');
      for (const s of ['open', 'investigating', 'fixed', 'closed']) { const o = el('option', null, LABEL[s]); o.value = s; o.selected = s === r.status; sel.append(o); }
      const note = el('input'); note.placeholder = 'Reply the player will see (optional)'; note.setAttribute('aria-label', 'Reply');
      const save = el('button', 'btn primary sm', 'Save'); save.type = 'button';
      save.onclick = async () => { try { await api('/api/admin/reports/' + r.id, { method: 'PATCH', headers: { 'x-admin-token': key }, body: JSON.stringify({ status: sel.value, note: note.value.trim() || undefined }) }); toast(r.id + ' updated.'); load(); } catch (x) { toast(x.message); } };
      act.append(sel, note, save); c.append(act); box.append(c);
    }
  }
  // Developers: give or remove the Developer role (Developer title, DEV tag and Developer skins in the game)
  async function devs() {
    const box = $('devBox'); if (!box) return; box.hidden = false;
    try { const r = await api('/api/admin/devs', { headers: { 'x-admin-token': key } }); $('devList').textContent = r.devs.length ? 'Developers: ' + r.devs.join(', ') : 'No developer accounts yet.'; } catch (x) { $('devList').textContent = x.message; }
  }
  const setRole = async role => { const n = $('devName').value.trim(); if (!n) return; try { const r = await api('/api/admin/role', { method: 'POST', headers: { 'x-admin-token': key }, body: JSON.stringify({ name: n, role }) }); toast(r.name + (r.role ? ' is now a Developer' : ' is no longer a Developer')); $('devName').value = ''; devs(); } catch (x) { toast(x.message || 'Could not change that account.'); } };
  if ($('devGive')) { $('devGive').onclick = () => setRole('dev'); $('devTake').onclick = () => setRole(''); }
  $('admForm').onsubmit = e => { e.preventDefault(); key = $('admKey').value.trim(); S.key = key; try { sessionStorage.setItem('rift_admin', key); } catch (x) { /* ok */ } load(); };
  const S = {
    key: '',
    async chat(body) { try { const r = await api('/api/admin/chat', { method: 'POST', headers: { 'x-admin-token': S.key }, body: JSON.stringify(body) }); toast(body.action === 'mute' ? `Muted (${r.muted} connection${r.muted === 1 ? '' : 's'}).` : 'Message deleted.'); } catch (x) { toast(x.message); } },
    init() { try { const k = sessionStorage.getItem('rift_admin'); if (k) { key = k; S.key = k; load(); } } catch (x) { /* ok */ } },
  };
  return S;
})();

// ============================================================ boot
// The trailer video is optional (it is large): put trailer.mp4 in web/media to show it; otherwise the still is shown.
api('/api/status').then(s => {
  const v = $('trailer');
  if (s.trailer) { v.src = '/media/trailer.mp4'; return; }
  const img = el('img'); img.src = '/media/poster.webp'; img.alt = 'Rift Arena: Void Emperor Kaito unleashes the Abyss Blade';
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block'; v.replaceWith(img); $('trailerTag').textContent = 'Void Emperor Kaito · Abyss Blade';
}).catch(() => {});
// Ranked leaderboard: the top 10 players this season.
async function refreshBoard() {
  try {
    const t = await api('/api/ranked/top'), box = $('lb'); if (!t.players.length) return;
    box.textContent = '';
    for (const p of t.players.slice(0, 10)) {
      const r = el('div', 'lb-row'); r.style.setProperty('--c', p.color);
      r.append(el('span', 'lb-pos', '#' + p.pos), el('b', null, p.name), el('span', 'lb-tier', p.tier), el('span', 'lb-rp', p.rp + ' RP'), el('span', 'muted', p.wins + 'W ' + p.losses + 'L'));
      box.append(r);
    }
  } catch (e) { /* server not reachable: keep the placeholder */ }
}
refreshBoard(); setInterval(refreshBoard, 60000);
renderRoster(); renderCats(); Staff.init(); route(); refreshStats(); setInterval(refreshStats, 15000);
