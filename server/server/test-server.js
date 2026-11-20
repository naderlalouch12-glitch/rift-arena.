// Server tests: level-range matchmaking, team balance, relay, sender stamping.
const { spawn } = require('child_process'); const WebSocket = require('ws');
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: '8799', MATCH_SCALE: '0.34' }, cwd: __dirname });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const client = () => new Promise(res => { const ws = new WebSocket('ws://127.0.0.1:8799'); const c = { ws, msgs: [] }; ws.on('message', d => c.msgs.push(JSON.parse(d))); ws.on('open', () => res(c)); });
const q = (c, mode, lv) => c.ws.send(JSON.stringify({ t: 'queue', v: 1, mode, lv, name: 'L' + lv, hero: 0 }));
const got = (c, t) => c.msgs.filter(m => m.t === t);
(async () => {
  await sleep(500); let ok = true; const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); ok = ok && cond; };
  // 3v3 at test scale needs 2 players. Level 5 and level 20 must NOT match; level 5 and 14 must.
  const a = await client(), b = await client(), c = await client();
  q(a, 'tdm3', 5); q(b, 'tdm3', 20); await sleep(300);
  check(!got(a, 'match').length && !got(b, 'match').length, 'levels 5 and 20 (15 apart) are not matched');
  q(c, 'tdm3', 14); await sleep(300);
  const ma = got(a, 'match')[0], mc = got(c, 'match')[0];
  check(ma && mc && ma.room === mc.room, 'levels 5 and 14 (9 apart) are matched together');
  check(!got(b, 'match').length, 'level 20 keeps waiting');
  check(ma && new Set(ma.roster.map(r => r.team)).size === 2, 'the two players are on opposite teams');
  // relay: presence and events reach the other player, stamped with the real sender
  a.ws.send(JSON.stringify({ t: 'pres', p: { x: 1, y: 2, pl: 1 } })); a.ws.send(JSON.stringify({ t: 'ev', type: 'ph', data: { to: mc.you, d: 10 }, from: 'spoofed' }));
  await sleep(300);
  const pr = got(c, 'pres')[0], evm = got(c, 'ev')[0];
  check(pr && pr.peer === ma.you && pr.p.x === 1, 'presence relayed with the sender id');
  check(evm && evm.from === ma.you && evm.type === 'ph', 'events relayed and the sender cannot be spoofed');
  // Battle Royale (needs 3 at test scale), no teams; the 4th player waits for the next match
  const br = []; for (let i = 0; i < 4; i++) { br.push(await client()); q(br[i], 'br', 10 + i * 3); } await sleep(400);
  const mb = got(br[0], 'match')[0]; check(mb && mb.roster.length === 3 && mb.roster.every(r => r.team === null) && !got(br[3], 'match').length, 'Battle Royale forms with 3 players and no teams; the 4th waits');
  // garbage and oversized input is ignored
  a.ws.send('not json'); a.ws.send(JSON.stringify({ t: 'queue', v: 1, mode: 'hack', lv: 1 })); await sleep(200);
  check(a.ws.readyState === 1, 'server survives bad input');
  srv.kill(); process.exit(ok ? 0 : 1);
})();
