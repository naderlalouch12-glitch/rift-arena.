// Rift Arena accounts, cloud saves and ranked.
//
//   Accounts: a player name + password (no e-mail, so it is safe for kids). Passwords are stored only as a salted
//   scrypt hash. Sign-up returns a one-time recovery code that can reset a forgotten password.
//   Cloud save: the game uploads its save while you are logged in, so progress survives reinstalling or a new device.
//   Ranked: rank points (RP) are kept here on the server, so they cannot be edited on a player's computer.
//
//   POST /api/account/register {name, password}        -> {token, name, recovery, rank}
//   POST /api/account/login    {name, password}        -> {token, name, rank}
//   POST /api/account/logout   (auth)
//   POST /api/account/reset    {name, recovery, password} -> {token, name, rank, recovery}  (a new recovery code)
//   GET  /api/account/me       (auth)                   -> {name, rank}
//   GET  /api/account/save     (auth)                   -> {save, at}
//   PUT  /api/account/save     (auth) {save}            -> {at}
//   GET  /api/ranked/top                                 -> {season, players: [...top 50]}
//   Roles: an account can be a Developer (role 'dev'): Developer title, DEV tag, Developer skins. Only the server owner
//   (ADMIN_TOKEN, see community.js /api/admin/role) can give or remove it.
//   auth = header  Authorization: Bearer <token>
//
// Stored in DATA_DIR/accounts.json. On Render's free plan that folder is wiped when the server restarts, so for a
// real launch add a Disk and set DATA_DIR (see README).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });
const FILE = path.join(DATA, 'accounts.json');
const SEASON = process.env.SEASON || '1';

// ---------------------------------------------------------------- ranks
// 7 tiers. Void Emperor is the top. Each tier is 500 RP; the last one has no ceiling.
const TIERS = [
  { n: 'Bronze', rp: 0, c: '#c98a55' }, { n: 'Silver', rp: 500, c: '#c9d3e0' }, { n: 'Gold', rp: 1000, c: '#ffd23f' },
  { n: 'Platinum', rp: 1500, c: '#5ff6d8' }, { n: 'Diamond', rp: 2000, c: '#7db4ff' }, { n: 'Rift Master', rp: 2500, c: '#c77dff' },
  { n: 'Void Emperor', rp: 3000, c: '#ff2bd6' },
];
const tierOf = rp => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (rp >= TIERS[i].rp) t = i; return t; };
const PLACEMENTS = 5;
function rankInfo(u) {
  const t = tierOf(u.rp), T = TIERS[t], next = TIERS[t + 1];
  return { rp: u.rp, tier: T.n, color: T.c, tierIndex: t, next: next ? next.n : null, toNext: next ? next.rp - u.rp : 0,
    wins: u.wins, losses: u.losses, games: u.games, streak: u.streak, shield: u.shield, placementsLeft: Math.max(0, PLACEMENTS - u.games), season: SEASON };
}
// How one ranked match changes a player's RP. Fair rules that keep ranked fun instead of punishing:
//  - win +25, plus up to +10 for a win streak; loss -20
//  - placements: the first 5 matches move 1.6x as much, so new players find their level fast
//  - promotion shield: the 3 matches after reaching a new tier can't drop you back out of it
//  - leaver protection: if a teammate quits, your loss is only -5; the player who quit loses 30
function applyResult(u, win, o = {}) {
  const before = u.rp, t0 = tierOf(before);
  let d;
  if (o.left) d = -30;
  else if (win) d = 25 + Math.min(10, Math.max(0, u.streak) * 2);
  else d = o.teammateLeft ? -5 : -20;
  if (u.games < PLACEMENTS) d = Math.round(d * 1.6);
  let rp = Math.max(0, before + d);
  if (d < 0 && u.shield > 0 && !o.left) { rp = Math.max(rp, TIERS[t0].rp); u.shield--; }
  u.rp = rp; u.games++; if (win) { u.wins++; u.streak = Math.max(1, u.streak + 1); } else { u.losses++; u.streak = Math.min(-1, u.streak - 1); }
  const t1 = tierOf(rp); if (t1 > t0) u.shield = 3;
  u.best = Math.max(u.best || 0, rp);
  return { delta: rp - before, promoted: t1 > t0, demoted: t1 < t0, ...rankInfo(u) };
}

// DEV_NAMES (optional environment variable): account names that are always Developers, e.g. DEV_NAMES=MyName,MyFriend
// Handy on a free server: the Developer role comes back by itself as soon as that account exists again.
const DEV_NAMES = new Set(String(process.env.DEV_NAMES || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
function autoDev(u) { if (u && DEV_NAMES.has(String(u.name).toLowerCase()) && u.role !== 'dev') { u.role = 'dev'; store(); } return u; }
// ---------------------------------------------------------------- storage
let DB = { users: {}, sessions: {} };
try { DB = JSON.parse(fs.readFileSync(FILE, 'utf8')); DB.users = DB.users || {}; DB.sessions = DB.sessions || {}; } catch (e) { /* first run */ }
let saveT = 0;
const cloud = require('./cloudstore'); // free cloud backup (optional), so accounts survive server restarts
function write() { const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(DB)); fs.renameSync(tmp, FILE); cloud.syncAccounts(DB); }
function store() { if (saveT) return; saveT = setTimeout(() => { saveT = 0; write(); }, 500); }
function flush() { if (saveT) { clearTimeout(saveT); saveT = 0; write(); } }
setInterval(() => { const now = Date.now(); let n = 0; for (const k in DB.sessions) if (DB.sessions[k].exp < now) { delete DB.sessions[k]; n++; } if (n) store(); }, 3600e3).unref();

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const scrypt = (pw, salt) => new Promise((ok, no) => crypto.scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => e ? no(e) : ok(k.toString('hex'))));
const eq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const BAD = /fuck|shit|bitch|cunt|dick|pussy|nigg|fag|retard|nazi|porn|sex|whore|slut/i;
const okName = n => typeof n === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(n) && !BAD.test(n);
const newUser = (name, salt, hash, rec) => ({ name, salt, hash, rec, created: Date.now(), save: null, saveAt: 0, rp: 0, wins: 0, losses: 0, games: 0, streak: 0, shield: 0, best: 0 });
function session(lc) { const token = crypto.randomBytes(32).toString('base64url'); DB.sessions[sha(token)] = { u: lc, exp: Date.now() + 180 * 864e5 }; store(); return token; }
function userFromToken(token) {
  if (typeof token !== 'string' || token.length < 20) return null;
  const s = DB.sessions[sha(token)]; if (!s || s.exp < Date.now()) return null;
  return DB.users[s.u] || null;
}
const recoveryCode = () => crypto.randomBytes(9).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, 'X').slice(0, 12).replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3');

// ---------------------------------------------------------------- http
// The game calls these from its own app (Steam, iPhone, browser), so allow other origins. Logins use a token in the
// Authorization header, never cookies, so this does not expose anything to other websites.
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS', 'access-control-allow-headers': 'content-type, authorization', 'access-control-max-age': '86400' };
function json(res, code, o, sec) { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...sec, ...CORS }); res.end(JSON.stringify(o)); }
function body(req, max) {
  return new Promise((ok, no) => { let n = 0; const parts = []; req.on('data', c => { n += c.length; if (n > max) { no(new Error('too big')); req.destroy(); } else parts.push(c); }); req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch (e) { no(e); } }); req.on('error', no); });
}
const bearer = req => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

// returns true when it handled the request
async function handle(req, res, p, ip, allow, sec) {
  if (!p.startsWith('/api/account/') && !p.startsWith('/api/ranked/')) return false;
  const J = (c, o) => json(res, c, o, sec);
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return true; }
  try {
    if (p === '/api/ranked/top' && req.method === 'GET') {
      const players = Object.values(DB.users).filter(u => u.games > 0).sort((a, b) => b.rp - a.rp || b.wins - a.wins).slice(0, 50)
        .map((u, i) => ({ pos: i + 1, name: u.name, rp: u.rp, tier: TIERS[tierOf(u.rp)].n, color: TIERS[tierOf(u.rp)].c, wins: u.wins, losses: u.losses }));
      return J(200, { season: SEASON, tiers: TIERS, players }), true;
    }
    if (p === '/api/account/register' && req.method === 'POST') {
      if (!allow('reg:' + ip, 5, 3600e3)) return J(429, { error: 'Too many new accounts from here. Try again in an hour.' }), true;
      const b = await body(req, 4096), name = String(b.name || '').trim(), pw = String(b.password || '');
      if (!okName(name)) return J(400, { error: 'Pick a name with 3 to 16 letters, numbers or _ (no spaces, no bad words).' }), true;
      if (pw.length < 8 || pw.length > 100) return J(400, { error: 'Your password needs at least 8 characters.' }), true;
      const lc = name.toLowerCase(); if (DB.users[lc]) return J(409, { error: 'That name is taken. Try another one.' }), true;
      const salt = crypto.randomBytes(16).toString('hex'), rec = recoveryCode();
      const u = newUser(name, salt, await scrypt(pw, salt), await scrypt(rec, salt)); DB.users[lc] = u; autoDev(u);
      return J(201, { token: session(lc), name, recovery: rec, rank: rankInfo(u), role: u.role || '' }), true;
    }
    if (p === '/api/account/login' && req.method === 'POST') {
      if (!allow('login:' + ip, 20, 900e3)) return J(429, { error: 'Too many tries. Wait 15 minutes and try again.' }), true;
      const b = await body(req, 4096), lc = String(b.name || '').trim().toLowerCase(), u = DB.users[lc];
      const h = u ? await scrypt(String(b.password || ''), u.salt) : await scrypt('x', 'pad'); // same work either way
      if (!u || !eq(h, u.hash)) return J(401, { error: 'Wrong name or password.' }), true;
      autoDev(u);
      return J(200, { token: session(lc), name: u.name, rank: rankInfo(u), role: u.role || '' }), true;
    }
    if (p === '/api/account/reset' && req.method === 'POST') {
      if (!allow('reset:' + ip, 10, 3600e3)) return J(429, { error: 'Too many tries. Try again in an hour.' }), true;
      const b = await body(req, 4096), lc = String(b.name || '').trim().toLowerCase(), u = DB.users[lc], pw = String(b.password || '');
      const code = String(b.recovery || '').trim().toUpperCase();
      const h = u ? await scrypt(code, u.salt) : await scrypt('x', 'pad');
      if (!u || !eq(h, u.rec)) return J(401, { error: 'That name and recovery code do not match.' }), true;
      if (pw.length < 8 || pw.length > 100) return J(400, { error: 'Your new password needs at least 8 characters.' }), true;
      u.salt = crypto.randomBytes(16).toString('hex'); u.hash = await scrypt(pw, u.salt);
      const rec = recoveryCode(); u.rec = await scrypt(rec, u.salt);
      for (const k in DB.sessions) if (DB.sessions[k].u === lc) delete DB.sessions[k]; // log out everywhere
      return J(200, { token: session(lc), name: u.name, rank: rankInfo(u), recovery: rec }), true;
    }
    const u = userFromToken(bearer(req));
    if (!u) return J(401, { error: 'Please log in again.' }), true;
    if (p === '/api/account/logout' && req.method === 'POST') { delete DB.sessions[sha(bearer(req))]; store(); return J(200, { ok: true }), true; }
    if (p === '/api/account/me' && req.method === 'GET') return J(200, { name: u.name, rank: rankInfo(u), role: u.role || '' }), true;
    if (p === '/api/account/save' && req.method === 'GET') return J(200, { save: u.save, at: u.saveAt }), true;
    if (p === '/api/account/save' && req.method === 'PUT') {
      if (!allow('save:' + u.name, 30, 600e3)) return J(429, { error: 'Saving too often.' }), true;
      const b = await body(req, 120000);
      if (typeof b.save !== 'string' || b.save.length > 100000) return J(400, { error: 'That save is not valid.' }), true;
      u.save = b.save; u.saveAt = Date.now(); store();
      return J(200, { at: u.saveAt }), true;
    }
    return J(404, { error: 'not found' }), true;
  } catch (e) { return J(400, { error: 'That request could not be read. Please try again.' }), true; }
}

const ROLES = ['dev'];
function setRole(name, role) { const u = DB.users[String(name || '').trim().toLowerCase()]; if (!u) return null; if (ROLES.includes(role)) u.role = role; else delete u.role; store(); return { name: u.name, role: u.role || '' }; }
const devList = () => Object.values(DB.users).filter(u => u.role === 'dev').map(u => u.name);
const isDevName = name => { const u = DB.users[String(name || '').toLowerCase()]; return !!(u && u.role === 'dev'); };
module.exports = { setRole, devList, isDevName, handle, userFromToken, applyResult, rankInfo, tierOf, TIERS, saveSoon: store, flush };
