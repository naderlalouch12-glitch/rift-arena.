// Tests: accounts, cloud saves, ranked matches decided on the server, leaver handling, leaderboard.
const { spawn } = require('child_process'); const WebSocket = require('ws'); const fs = require('fs'), path = require('path'), os = require('os');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-rank-'));
const PORT = 8798, B = `http://127.0.0.1:${PORT}`;
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(PORT), MATCH_SCALE: '0.34', DATA_DIR: DATA }, cwd: __dirname });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = async (p, o = {}) => { const r = await fetch(B + p, { ...o, headers: { 'content-type': 'application/json', ...(o.token ? { authorization: 'Bearer ' + o.token } : {}) } }); return { code: r.status, j: await r.json() }; };
const client = () => new Promise(res => { const ws = new WebSocket(`ws://127.0.0.1:${PORT}`); const c = { ws, msgs: [] }; ws.on('message', d => c.msgs.push(JSON.parse(d))); ws.on('open', () => res(c)); });
const got = (c, t) => c.msgs.filter(m => m.t === t);
(async () => {
  await sleep(600); let ok = true; const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); ok = ok && cond; };
  // accounts
  const a = await api('/api/account/register', { method: 'POST', body: JSON.stringify({ name: 'KaitoMain', password: 'supersecret1' }) });
  check(a.code === 201 && a.j.token && /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(a.j.recovery) && a.j.rank.tier === 'Bronze', 'sign up gives a token, a recovery code and Bronze rank');
  check((await api('/api/account/register', { method: 'POST', body: JSON.stringify({ name: 'kaitomain', password: 'another123' }) })).code === 409, 'names are unique (any capitals)');
  check((await api('/api/account/register', { method: 'POST', body: JSON.stringify({ name: 'shitlord', password: 'another123' }) })).code === 400, 'bad-word names are refused');
  check((await api('/api/account/register', { method: 'POST', body: JSON.stringify({ name: 'Shorty', password: '123' }) })).code === 400, 'short passwords are refused');
  check((await api('/api/account/login', { method: 'POST', body: JSON.stringify({ name: 'kaitomain', password: 'wrongpass' }) })).code === 401, 'wrong password is refused');
  const b = await api('/api/account/register', { method: 'POST', body: JSON.stringify({ name: 'YukiSnipes', password: 'frostbite99' }) });
  const login = await api('/api/account/login', { method: 'POST', body: JSON.stringify({ name: 'KAITOMAIN', password: 'supersecret1' }) });
  check(login.code === 200 && login.j.name === 'KaitoMain', 'log in works (name is not case sensitive)');
  // cloud save
  const save = JSON.stringify({ d: '{"coins":4321}', s: 'sig' });
  check((await api('/api/account/save', { method: 'PUT', token: a.j.token, body: JSON.stringify({ save }) })).code === 200, 'cloud save uploads');
  const back = await api('/api/account/save', { token: login.j.token });
  check(back.j.save === save, 'cloud save comes back on another login (new device)');
  check((await api('/api/account/save', { token: 'nonsense-token-123456789' })).code === 401, 'cloud save needs a valid login');
  // password reset with the recovery code
  const rs = await api('/api/account/reset', { method: 'POST', body: JSON.stringify({ name: 'YukiSnipes', recovery: b.j.recovery, password: 'newfrost123' }) });
  check(rs.code === 200 && rs.j.recovery && rs.j.recovery !== b.j.recovery, 'recovery code resets the password and gives a new code');
  check((await api('/api/account/me', { token: b.j.token })).code === 401, 'old logins stop working after a reset');
  const bt = rs.j.token;
  // ranked: needs a login
  const g = await client(); g.ws.send(JSON.stringify({ t: 'queue', v: 1, mode: 'ranked', lv: 5, hero: 0 })); await sleep(200);
  check(got(g, 'error').some(m => m.code === 'login'), 'Ranked asks guests to log in');
  // ranked match: 2 players at test scale
  const p1 = await client(), p2 = await client();
  p1.ws.send(JSON.stringify({ t: 'queue', v: 1, mode: 'ranked', lv: 5, hero: 0, token: a.j.token }));
  p2.ws.send(JSON.stringify({ t: 'queue', v: 1, mode: 'ranked', lv: 25, hero: 1, token: bt })); await sleep(300);
  const m1 = got(p1, 'match')[0], m2 = got(p2, 'match')[0];
  check(m1 && m2 && m1.ranked && m1.room === m2.room, 'two logged-in players are matched for Ranked (levels do not matter, rank does)');
  check(m1 && m1.roster.every(r => r.rank === 'Bronze') && m1.roster.some(r => r.name === 'KaitoMain'), 'ranked roster shows account names and ranks');
  // p2 reports 15 knockouts on themselves -> p1's team wins, decided by the server
  for (let i = 0; i < 15; i++) p2.ws.send(JSON.stringify({ t: 'ev', type: 'ko', data: { victim: m2.you, killer: m1.you } }));
  await sleep(400);
  const r1 = got(p1, 'ranked')[0], r2 = got(p2, 'ranked')[0];
  check(r1 && r1.win && r1.delta === 40, 'winner gets +40 RP (placement match: 25 x 1.6)');
  check(r2 && !r2.win && r2.delta === 0 && r2.rp === 0, 'loser cannot go below 0 RP');
  p2.ws.send(JSON.stringify({ t: 'ev', type: 'ko', data: { victim: 'someone-else', killer: m2.you } })); await sleep(150);
  check(got(p1, 'ranked').length === 1, 'a finished match cannot be scored again, and nobody can report knockouts for someone else');
  // leaver: p2 quits mid-match -> p1 wins, p2 loses 30 (or stays at 0)
  p1.ws.send(JSON.stringify({ t: 'queue', v: 1, mode: 'ranked', lv: 5, hero: 0, token: a.j.token }));
  p2.ws.send(JSON.stringify({ t: 'queue', v: 1, mode: 'ranked', lv: 25, hero: 1, token: bt })); await sleep(300);
  p2.ws.send(JSON.stringify({ t: 'leave' })); await sleep(300);
  const r3 = got(p1, 'ranked')[1];
  check(r3 && r3.win && r3.rp > r1.rp, 'if the other team quits, you win');
  // leaderboard
  const top = await api('/api/ranked/top');
  check(top.j.players[0].name === 'KaitoMain' && top.j.players[0].wins === 2 && top.j.tiers.length === 7 && top.j.tiers[6].n === 'Void Emperor', 'leaderboard lists the top player; Void Emperor is the top tier');
  // persistence across a restart
  srv.kill(); await sleep(400);
  const srv2 = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA }, cwd: __dirname }); await sleep(700);
  const again = await api('/api/account/login', { method: 'POST', body: JSON.stringify({ name: 'KaitoMain', password: 'supersecret1' }) });
  check(again.code === 200 && again.j.rank.wins === 2, 'accounts and ranks survive a server restart (when the data folder is kept)');
  srv2.kill(); fs.rmSync(DATA, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
})();
