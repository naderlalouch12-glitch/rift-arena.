// Rift Arena online server: matchmaking + match relay for 3v3, 5v5 and Battle Royale.
//
//   Matchmaking: players queue for a mode with the level of the fighter they picked. A match only forms from
//   players whose levels are all within 10 of each other (max level - min level <= 10). Teams are balanced by level.
//   Relay: inside a match the server forwards each player's state ("presence") and events (hits, knockouts) to the
//   others, and stamps every message with the real sender so nobody can pretend to be someone else.
//
// Run:  cd server && npm install && node server.js          (port 8787, or PORT=...)
// The same port also serves the community website, chat and problem reports (see community.js).
// Test: MATCH_SCALE=0.34 node server.js  makes 3v3 start with 2 players, 5v5 and Battle Royale with 3.
'use strict';
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const http = require('http');
const community = require('./community'); // website, global chat and problem reports
const accounts = require('./accounts');   // logins and ranked points

const PORT = +process.env.PORT || 8787;
const SCALE = Math.min(1, Math.max(0.1, +process.env.MATCH_SCALE || 1));
const LEVEL_RANGE = 10;
const MODES = { tdm3: { size: 6, teams: 2 }, tdm5: { size: 10, teams: 2 }, br: { size: 10, teams: 0 }, ranked: { size: 6, teams: 2, ranked: true } };
const RANKED_GOAL = 15; // knockouts to win a ranked 3v3 (the same goal the game uses)
const need = m => Math.max(2, Math.round(MODES[m].size * SCALE));
const VERSION = 1, MAX_MSG = 16384, MAX_RATE = 60; // 16 KB: team voice chat setup messages are a few KB // messages per second per player

const queues = { tdm3: [], tdm5: [], br: [], ranked: [] };
const rooms = new Map();
const clean = s => String(s || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16) || 'Player';
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };

function tryMatch(mode) {
  const q = queues[mode], n = need(mode);
  // oldest waiting player anchors the search; add others (oldest first) while the level spread stays within 10
  for (let a = 0; a < q.length; a++) {
    // party code: friends who typed the same code always go into the same match (and the same team)
    const mates = x => x.party ? q.filter(o => o !== x && o.party === x.party) : [];
    const group = [q[a]]; for (const o of mates(q[a])) if (group.length < n) group.push(o);
    // ranked matches by rank points: within 300 RP at first, widening by 10 RP for every second the oldest player waits
    const win = 300 + 10 * (Date.now() - q[a].t0) / 1000;
    for (let b = 0; b < q.length && group.length < n; b++) {
      if (b === a || group.includes(q[b])) continue;
      const pm = mates(q[b]).filter(o => !group.includes(o)); if (group.length + 1 + pm.length > n) continue; // a party joins together or not at all
      const key = MODES[mode].ranked ? 'rp' : 'lv', vals = group.map(p => p[key]).concat(q[b][key]);
      if (Math.max(...vals) - Math.min(...vals) <= (MODES[mode].ranked ? win : LEVEL_RANGE)) { group.push(q[b]); for (const o of pm) group.push(o); }
    }
    if (group.length === n) { for (const p of group) q.splice(q.indexOf(p), 1); startMatch(mode, group); return true; }
  }
  return false;
}
function startMatch(mode, players) {
  const id = crypto.randomBytes(6).toString('hex'), seed = crypto.randomInt(1, 2 ** 31), room = { id, mode, players: new Map(), pres: new Map(), seed, started: Date.now(), ranked: !!MODES[mode].ranked, score: { blue: 0, red: 0 }, done: false, members: players.slice(), leavers: new Set() };
  // balance teams: sort by level, deal them out snake-style
  const sorted = players.slice().sort((x, y) => y.lv - x.lv);
  const SNAKE = ['blue', 'red', 'red', 'blue'];
  sorted.forEach((p, i) => { p.team = MODES[mode].teams ? SNAKE[i % 4] : null; });
  if (MODES[mode].teams) { // keep each party on one team: move mates to their leader's team, swapping with a solo player to stay balanced
    const half = Math.ceil(players.length / 2), cnt = t => players.filter(p => p.team === t).length;
    for (const lead of sorted) { if (!lead.party) continue;
      for (const m of sorted) { if (m === lead || m.party !== lead.party || m.team === lead.team) continue;
        const swap = sorted.find(o => o.team === lead.team && o.party !== lead.party);
        if (swap) { swap.team = m.team; m.team = lead.team; } else if (cnt(lead.team) < half) m.team = lead.team; } }
  }
  for (const p of players) { p.room = room; p.queued = null; room.players.set(p.peer, p); }
  rooms.set(id, room);
  const roster = players.map(p => ({ peer: p.peer, name: p.name, lv: p.lv, team: p.team, hero: p.hero, rank: p.user && MODES[mode].ranked ? accounts.rankInfo(p.user).tier : undefined, dev: p.user && p.user.role === 'dev' ? 1 : undefined }));
  for (const p of players) send(p.ws, { t: 'match', room: id, mode, ranked: room.ranked, you: p.peer, seed, start: Date.now() + 1500, roster });
}
// Ranked results are decided here on the server: it counts the knockouts each player reports about themselves,
// and a team that quits completely loses.
function finishRanked(r, winTeam) {
  if (r.done) return; r.done = true;
  const quitTeams = new Set([...r.leavers].map(p => p.team));
  for (const p of r.members) {
    if (!p.user) continue;
    const left = r.leavers.has(p), res = accounts.applyResult(p.user, !left && p.team === winTeam, { left, teammateLeft: !left && quitTeams.has(p.team) });
    if (!left) send(p.ws, { t: 'ranked', win: p.team === winTeam, ...res });
  }
  accounts.saveSoon();
}
function leaveRoom(p) {
  const r = p.room; if (!r) return; p.room = null;
  if (r.ranked && !r.done) {
    r.leavers.add(p);
    const stillIn = t => [...r.players.values()].some(o => o !== p && o.team === t);
    if (!stillIn(p.team)) finishRanked(r, p.team === 'blue' ? 'red' : 'blue');
  }
  r.players.delete(p.peer); r.pres.delete(p.peer);
  for (const o of r.players.values()) send(o.ws, { t: 'left', peer: p.peer });
  if (!r.players.size) rooms.delete(r.id);
}
function leaveQueue(p) { if (!p.queued) return; const q = queues[p.queued], i = q.indexOf(p); if (i >= 0) q.splice(i, 1); p.queued = null; }
function queueStatus() { for (const m in queues) for (const p of queues[m]) send(p.ws, { t: 'queue', mode: m, waiting: queues[m].length, need: need(m), range: LEVEL_RANGE }); }

// One port for everything: the website and its API over HTTP, the chat at /chat, matchmaking at /.
const server = http.createServer((req, res) => community.handle(req, res, () => wss.clients.size));
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG });
// the ranked search window widens while players wait, so check the ranked queue regularly
setInterval(() => { while (tryMatch('ranked')); }, 5000).unref();
server.on('upgrade', (req, sock, head) => {
  const p = (req.url || '/').split('?')[0];
  const target = p === '/chat' ? community.chatWss : wss;
  target.handleUpgrade(req, sock, head, ws => target.emit('connection', ws, req));
});
server.listen(PORT);
// Render stops the server with SIGTERM on every restart or redeploy: write everything to disk first.
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { accounts.flush(); community.flush(); } finally { process.exit(0); } });
wss.on('connection', ws => {
  const p = { ws, peer: crypto.randomBytes(5).toString('hex'), name: 'Player', lv: 1, hero: 0, queued: null, room: null, team: null, rate: 0, rateT: Date.now() };
  ws.on('message', raw => {
    const now = Date.now(); if (now - p.rateT > 1000) { p.rate = 0; p.rateT = now; } if (++p.rate > MAX_RATE) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; } if (!m || typeof m !== 'object') return;
    if (m.t === 'queue') {
      if (!MODES[m.mode] || m.v !== VERSION) return send(ws, { t: 'error', msg: 'Please update the game to play online.' });
      let user = m.token ? accounts.userFromToken(m.token) : null; // logged-in players use their account name (and Developers get the DEV tag)
      if (MODES[m.mode].ranked && !user) return send(ws, { t: 'error', code: 'login', msg: 'Log in to your Rift Arena account to play Ranked.' });
      leaveRoom(p); leaveQueue(p);
      p.name = user ? user.name : clean(m.name); p.lv = Math.max(1, Math.min(999, Math.floor(+m.lv) || 1)); p.hero = Math.max(0, Math.min(9, Math.floor(+m.hero) || 0));
      p.user = user; p.rp = user ? user.rp : 0; p.t0 = Date.now();
      p.party = MODES[m.mode].ranked ? '' : String(m.party || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); // no parties in Ranked
      p.queued = m.mode; queues[m.mode].push(p); while (tryMatch(m.mode)); queueStatus();
    } else if (m.t === 'cancel') { leaveQueue(p); queueStatus(); }
    else if (m.t === 'pres' && p.room && m.p && typeof m.p === 'object') {
      p.room.pres.set(p.peer, m.p);
      for (const o of p.room.players.values()) if (o !== p) send(o.ws, { t: 'pres', peer: p.peer, p: m.p });
    } else if (m.t === 'ev' && p.room && typeof m.type === 'string' && m.type.length < 12) {
      const r = p.room; let won = null;
      if (r.ranked && !r.done && m.type === 'ko' && m.data && m.data.victim === p.peer && p.team) {
        const scorer = p.team === 'blue' ? 'red' : 'blue'; r.score[scorer]++;
        if (r.score[scorer] >= RANKED_GOAL) won = scorer; // decided after the knockout itself is passed on below
      }
      if (won) setImmediate(() => finishRanked(r, won));
      // team voice chat ('rtc'): only to teammates, and only to the one teammate it is addressed to (never to the other team)
      const rtc = m.type === 'rtc', to = m.data && typeof m.data.to === 'string' ? m.data.to : null;
      if (rtc && !p.team) return;
      for (const o of p.room.players.values()) if (o !== p && (!rtc || (o.team === p.team && (!to || o.peer === to)))) send(o.ws, { t: 'ev', from: p.peer, type: m.type, data: m.data });
    } else if (m.t === 'leave') { leaveRoom(p); }
  });
  ws.on('close', () => { leaveQueue(p); leaveRoom(p); queueStatus(); });
  send(ws, { t: 'hello', v: VERSION, peer: p.peer });
});
console.log('Rift Arena server on port ' + PORT + ' (website at http://localhost:' + PORT + '/)' + ' (match sizes: ' + Object.keys(MODES).map(m => m + '=' + need(m)).join(', ') + ', level range ±' + LEVEL_RANGE + ')');
