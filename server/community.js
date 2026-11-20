// Rift Arena community site: serves the website, the global chat and the problem-report desk.
//
//   GET  /                     the website (files in ./web)
//   WS   /chat                 live chat (channels, history, who's online)
//   POST /api/reports          file a problem report -> { id, key }
//   GET  /api/reports/:id?key= the reporter checks their ticket
//   GET  /api/status           players online, chat users, open tickets
//   Admin (header  x-admin-token: $ADMIN_TOKEN; disabled when ADMIN_TOKEN is not set):
//   GET  /api/admin/reports    every ticket      PATCH /api/admin/reports/:id {status, note}
//   POST /api/admin/chat       {action:'delete', channel, id} | {action:'mute', user, minutes}
//
// Everything is stored in ./data (reports.json, chat.json, uploads/). Chat is built for players
// of every age: links, phone numbers and e-mail addresses are blocked, bad words are masked,
// and every player is rate limited.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');

const WEB = path.join(__dirname, 'web');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const UP = path.join(DATA, 'uploads');
fs.mkdirSync(UP, { recursive: true });
const ADMIN = process.env.ADMIN_TOKEN || '';
const TRUST_PROXY = !!process.env.TRUST_PROXY; // set when running behind Render/Railway/Fly so the real IP is used

// ---------------------------------------------------------------- storage
function load(f, d) { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch (e) { return d; } }
const pending = new Set();
function save(f, v) {
  if (pending.has(f)) return; pending.add(f);
  setTimeout(() => { pending.delete(f); const tmp = path.join(DATA, f + '.tmp'); fs.writeFileSync(tmp, JSON.stringify(v)); fs.renameSync(tmp, path.join(DATA, f)); }, 400);
}
const reports = load('reports.json', []);
const CHANNELS = [
  { id: 'global', name: 'Global', desc: 'Everyone, everywhere' },
  { id: 'lfg', name: 'Looking for group', desc: 'Find a squad for 3v3, 5v5 and raids' },
  { id: 'help', name: 'Help', desc: 'Questions about the game' },
  { id: 'fanart', name: 'Fan corner', desc: 'Favourite heroes, skins and moments' },
  { id: 'na', name: 'North America', region: 1 }, { id: 'eu', name: 'Europe', region: 1 },
  { id: 'latam', name: 'Latin America', region: 1 }, { id: 'asia', name: 'Asia', region: 1 }, { id: 'oce', name: 'Oceania', region: 1 },
];
const chat = load('chat.json', {}); for (const c of CHANNELS) chat[c.id] = (chat[c.id] || []).slice(-100);
const HIST = 100;

// ---------------------------------------------------------------- safety filters
const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'asshole', 'bastard', 'slut', 'whore', 'nigger', 'nigga', 'faggot', 'retard', 'kys', 'porn', 'sex', 'nazi'];
const leet = s => s.toLowerCase().replace(/[@4]/g, 'a').replace(/[3]/g, 'e').replace(/[1!|]/g, 'i').replace(/[0]/g, 'o').replace(/[$5]/g, 's').replace(/[7]/g, 't');
function mask(text) {
  return text.replace(/[\p{L}\p{N}@$!|]+/gu, w => { const l = leet(w).replace(/[^a-z]/g, ''); return BAD.some(b => l === b || (b.length > 3 && l.includes(b))) ? '★'.repeat(Math.min(6, w.length)) : w; });
}
const LINK = /(https?:\/\/|www\.|discord\.gg|\b[a-z0-9-]+\.(com|net|org|gg|io|xyz|ru|tk|ly|me|tv)\b)/i;
const CONTACT = /([\w.+-]+@[\w-]+\.[\w.]+)|(\+?\d[\d\s().-]{7,}\d)/;
function cleanText(t, max) { return String(t || '').replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
function cleanName(n) { const s = cleanText(n, 16).replace(/[^\p{L}\p{N} _.\-]/gu, ''); return s.length >= 3 && mask(s) === s ? s : ''; }
const HEROES = ['Kaito', 'Yuki', 'Goro', 'Akane', 'Mika'];

// ---------------------------------------------------------------- rate limits
const buckets = new Map();
function allow(key, perWindow, windowMs) {
  const now = Date.now(); let b = buckets.get(key);
  if (!b || now - b.t > windowMs) { b = { t: now, n: 0 }; buckets.set(key, b); }
  return ++b.n <= perWindow;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 3600e3) buckets.delete(k); }, 600e3).unref();
const ipOf = req => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
const hashIp = ip => crypto.createHash('sha256').update('rift' + ip).digest('hex').slice(0, 16);
const muted = new Map(); // ipHash -> until (ms)

// ---------------------------------------------------------------- chat
const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
const people = new Map(); // ws -> { id, name, hero, ch, ip }
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
function roster(ch) { return [...people.values()].filter(p => p.name && p.ch === ch).map(p => ({ id: p.id, name: p.name, hero: p.hero })); }
function counts() { const c = {}; for (const ch of CHANNELS) c[ch.id] = 0; for (const p of people.values()) if (p.name && c[p.ch] != null) c[p.ch]++; return c; }
function broadcast(o, ch) { const s = JSON.stringify(o); for (const [ws, p] of people) if ((!ch || p.ch === ch) && ws.readyState === 1) ws.send(s); }
let countsT = 0;
function pushCounts() { if (countsT) return; countsT = setTimeout(() => { countsT = 0; broadcast({ t: 'counts', counts: counts(), online: people.size }); }, 300); }
function sendRoster(ch) { broadcast({ t: 'roster', ch, people: roster(ch) }, ch); }

wss.on('connection', (ws, req) => {
  const ip = hashIp(ipOf(req));
  if (!allow('conn:' + ip, 20, 60e3)) { ws.close(1008, 'slow down'); return; }
  const me = { id: crypto.randomBytes(5).toString('hex'), name: '', hero: 0, ch: 'global', ip, warn: 0 };
  people.set(ws, me);
  send(ws, { t: 'hello', you: me.id, channels: CHANNELS, counts: counts(), online: people.size });
  ws.on('message', raw => {
    if (!allow('msg:' + me.id, 25, 10e3)) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; } if (!m || typeof m !== 'object') return;
    if (m.t === 'join') {
      const name = cleanName(m.name);
      if (!name) return send(ws, { t: 'error', code: 'name', msg: 'Pick a name with 3 to 16 letters or numbers (no bad words).' });
      const taken = [...people.values()].some(p => p !== me && p.name && p.name.toLowerCase() === name.toLowerCase());
      if (taken) return send(ws, { t: 'error', code: 'name', msg: 'Someone online is already using that name. Try another one.' });
      me.name = name; me.hero = Math.max(0, Math.min(4, m.hero | 0));
      send(ws, { t: 'joined', name, hero: me.hero });
      switchTo(ws, me, CHANNELS.some(c => c.id === m.ch) ? m.ch : 'global');
    } else if (m.t === 'channel' && me.name && CHANNELS.some(c => c.id === m.ch)) switchTo(ws, me, m.ch);
    else if (m.t === 'say' && me.name) {
      const until = muted.get(me.ip) || 0;
      if (until > Date.now()) return send(ws, { t: 'error', code: 'muted', msg: `You are muted for ${Math.ceil((until - Date.now()) / 60e3)} more minute(s).` });
      if (!allow('say:' + me.id, 5, 8e3)) return send(ws, { t: 'error', code: 'slow', msg: 'You are sending messages too fast. Wait a few seconds.' });
      let text = cleanText(m.text, 300); if (!text) return;
      if (LINK.test(text)) return send(ws, { t: 'error', code: 'link', msg: 'Links are not allowed in chat, to keep everyone safe.' });
      if (CONTACT.test(text)) return send(ws, { t: 'error', code: 'contact', msg: 'For your safety, phone numbers and e-mail addresses are blocked. Never share personal info.' });
      const last = chat[me.ch].filter(x => x.u === me.id).slice(-1)[0];
      if (last && last.text === mask(text) && Date.now() - last.at < 30e3) return send(ws, { t: 'error', code: 'spam', msg: 'You just sent that message.' });
      const msg = { id: crypto.randomBytes(6).toString('hex'), u: me.id, name: me.name, hero: me.hero, text: mask(text), at: Date.now() };
      chat[me.ch].push(msg); if (chat[me.ch].length > HIST) chat[me.ch].shift(); save('chat.json', chat);
      broadcast({ t: 'msg', ch: me.ch, msg }, me.ch);
    } else if (m.t === 'flag' && me.name && typeof m.id === 'string') {
      if (!allow('flag:' + me.ip, 10, 3600e3)) return;
      const msg = (chat[m.ch] || []).find(x => x.id === m.id); if (!msg) return;
      fileReport({ category: 'player', title: 'Chat message flagged by a player', details: `In #${m.ch}, ${msg.name} wrote: "${msg.text}"`, platform: 'Website chat', contact: '', reporter: me.name, auto: { ch: m.ch, msg: msg.id, user: msg.u } }, me.ip);
      send(ws, { t: 'flagged', id: m.id });
    }
  });
  ws.on('close', () => { const ch = me.ch, had = !!me.name; people.delete(ws); if (had) sendRoster(ch); pushCounts(); });
  pushCounts();
});
function switchTo(ws, me, ch) {
  const old = me.ch; me.ch = ch;
  send(ws, { t: 'history', ch, messages: chat[ch] });
  sendRoster(ch); if (old !== ch) sendRoster(old); pushCounts();
}

// ---------------------------------------------------------------- reports
const CATS = { bug: 'Bug or glitch', crash: 'Crash or freeze', perf: 'Lag or performance', online: 'Matchmaking or online', payment: 'Purchase or payment', account: 'Progress or save data', player: 'Player behaviour', idea: 'Idea or suggestion', other: 'Something else' };
const STATUS = ['open', 'investigating', 'fixed', 'closed'];
const newId = () => { let id; do id = 'RA-' + crypto.randomBytes(3).toString('hex').toUpperCase(); while (reports.some(r => r.id === id)); return id; };
function fileReport(b, ip, shot) {
  const r = {
    id: newId(), key: crypto.randomBytes(6).toString('hex'), at: Date.now(), status: 'open', updated: Date.now(),
    category: CATS[b.category] ? b.category : 'other', title: cleanText(b.title, 90) || 'Untitled report',
    details: String(b.details || '').replace(/\r/g, '').slice(0, 4000), steps: String(b.steps || '').replace(/\r/g, '').slice(0, 2000),
    platform: cleanText(b.platform, 40), version: cleanText(b.version, 20), mode: cleanText(b.mode, 30), hero: cleanText(b.hero, 20),
    contact: cleanText(b.contact, 120), reporter: cleanText(b.reporter, 30), shot: shot || null, ip, notes: [], auto: b.auto || null,
  };
  reports.push(r); save('reports.json', reports); return r;
}
const pub = r => ({ id: r.id, at: r.at, updated: r.updated, status: r.status, category: r.category, categoryName: CATS[r.category], title: r.title, notes: r.notes.filter(n => n.public).map(n => ({ at: n.at, text: n.text })) });

// ---------------------------------------------------------------- http
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.json': 'application/json' };
const SEC = {
  'content-security-policy': "default-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self' ws: wss:; style-src 'self'; script-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
};
function json(res, code, o) { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...SEC }); res.end(JSON.stringify(o)); }
function body(req, max) {
  return new Promise((ok, no) => { let n = 0; const parts = []; req.on('data', c => { n += c.length; if (n > max) { no(new Error('too big')); req.destroy(); } else parts.push(c); }); req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch (e) { no(e); } }); req.on('error', no); });
}
function serveFile(req, res, file) {
  const rel = path.normalize(decodeURIComponent(file)).replace(/^([/\\])+/, '');
  const base = rel.startsWith('uploads' + path.sep) ? DATA : WEB, full = path.join(base, rel);
  if (!full.startsWith(base + path.sep)) return json(res, 404, { error: 'not found' });
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { if (!path.extname(rel)) return serveFile(req, res, 'index.html'); return json(res, 404, { error: 'not found' }); }
    const type = TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    const h = { 'content-type': type, 'cache-control': type.startsWith('text/html') ? 'no-cache' : 'public, max-age=3600', 'accept-ranges': 'bytes', ...SEC };
    if (range && type === 'video/mp4') {
      const a = range[1] ? +range[1] : 0, b = range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
      res.writeHead(206, { ...h, 'content-range': `bytes ${a}-${b}/${st.size}`, 'content-length': b - a + 1 }); fs.createReadStream(full, { start: a, end: b }).pipe(res);
    } else { res.writeHead(200, { ...h, 'content-length': st.size }); fs.createReadStream(full).pipe(res); }
  });
}
const isAdmin = req => ADMIN && req.headers['x-admin-token'] && crypto.timingSafeEqual(crypto.createHash('sha256').update(String(req.headers['x-admin-token'])).digest(), crypto.createHash('sha256').update(ADMIN).digest());

async function handle(req, res, stats) {
  const u = new URL(req.url, 'http://x'), p = u.pathname, ip = hashIp(ipOf(req));
  try {
    if (p === '/api/status' && req.method === 'GET')
      return json(res, 200, { chat: people.size, players: stats ? stats() : 0, open: reports.filter(r => r.status === 'open' || r.status === 'investigating').length, fixed: reports.filter(r => r.status === 'fixed').length, channels: counts(), trailer: fs.existsSync(path.join(WEB, 'media', 'trailer.mp4')) });
    if (p === '/api/reports' && req.method === 'POST') {
      if (!allow('rep:' + ip, 6, 3600e3)) return json(res, 429, { error: 'You have sent a lot of reports in the last hour. Please wait a bit before sending another.' });
      const b = await body(req, 2.5e6);
      if (cleanText(b.title, 90).length < 4 || String(b.details || '').trim().length < 10) return json(res, 400, { error: 'Add a short title and describe the problem in at least one sentence.' });
      if (b.website) return json(res, 200, { id: 'RA-000000', key: 'x' }); // honeypot field: bots fill it, people never see it
      let shot = null;
      if (b.shot) {
        const mm = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.shot));
        if (!mm) return json(res, 400, { error: 'The screenshot must be a PNG, JPG or WEBP image.' });
        const buf = Buffer.from(mm[2], 'base64'); if (buf.length > 1.8e6) return json(res, 400, { error: 'The screenshot is too large. Keep it under 1.8 MB.' });
        const sig = buf.slice(0, 4).toString('hex'); if (!/^(89504e47|ffd8ff|52494646)/.test(sig)) return json(res, 400, { error: 'That file does not look like an image.' });
        shot = crypto.randomBytes(8).toString('hex') + '.' + (mm[1] === 'jpeg' ? 'jpg' : mm[1]); fs.writeFileSync(path.join(UP, shot), buf);
      }
      const r = fileReport(b, ip, shot); return json(res, 201, { id: r.id, key: r.key });
    }
    let mm = /^\/api\/reports\/(RA-[0-9A-F]{6})$/.exec(p);
    if (mm && req.method === 'GET') {
      if (!allow('look:' + ip, 60, 3600e3)) return json(res, 429, { error: 'Too many lookups. Try again later.' });
      const r = reports.find(x => x.id === mm[1]);
      if (!r || !u.searchParams.get('key') || u.searchParams.get('key') !== r.key) return json(res, 404, { error: 'No ticket matches that number and code. Check both and try again.' });
      return json(res, 200, pub(r));
    }
    if (p.startsWith('/api/admin/')) {
      if (!isAdmin(req)) { allow('adm:' + ip, 1, 1); return json(res, 401, { error: ADMIN ? 'Wrong admin key.' : 'Admin is turned off. Set ADMIN_TOKEN on the server to turn it on.' }); }
      if (p === '/api/admin/reports' && req.method === 'GET') return json(res, 200, { reports: reports.slice().reverse().map(r => ({ ...r, key: undefined, ip: undefined, categoryName: CATS[r.category] })) });
      mm = /^\/api\/admin\/reports\/(RA-[0-9A-F]{6})$/.exec(p);
      if (mm && req.method === 'PATCH') {
        const r = reports.find(x => x.id === mm[1]); if (!r) return json(res, 404, { error: 'No such ticket.' });
        const b = await body(req, 1e4);
        if (STATUS.includes(b.status)) r.status = b.status;
        if (b.note) r.notes.push({ at: Date.now(), text: String(b.note).slice(0, 1000), public: b.public !== false });
        r.updated = Date.now(); save('reports.json', reports); return json(res, 200, { ok: true });
      }
      if (p === '/api/admin/chat' && req.method === 'POST') {
        const b = await body(req, 1e4);
        if (b.action === 'delete' && chat[b.channel]) { chat[b.channel] = chat[b.channel].filter(x => x.id !== b.id); save('chat.json', chat); broadcast({ t: 'deleted', ch: b.channel, id: b.id }); return json(res, 200, { ok: true }); }
        if (b.action === 'mute') { let n = 0; for (const pp of people.values()) if (pp.id === b.user) { muted.set(pp.ip, Date.now() + Math.min(10080, Math.max(1, b.minutes | 0 || 60)) * 60e3); n++; } return json(res, 200, { ok: true, muted: n }); }
        return json(res, 400, { error: 'Unknown action.' });
      }
      return json(res, 404, { error: 'not found' });
    }
    if (p.startsWith('/api/')) return json(res, 404, { error: 'not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method not allowed' });
    return serveFile(req, res, p === '/' ? 'index.html' : p);
  } catch (e) { return json(res, 400, { error: 'That request could not be read. Please try again.' }); }
}

module.exports = { handle, chatWss: wss, CATS };
