// Optional FREE cloud backup, so accounts, Developer roles, ranks, cloud saves and tickets survive server restarts.
// (Render's free plan wipes the server's files every time it restarts or goes to sleep.)
//
// Works with a free Upstash Redis database (upstash.com). Set two environment variables on the server:
//   STORE_URL    the "REST URL" of the database, like https://xxxx.upstash.io
//   STORE_TOKEN  the "REST token" of the database (keep it secret, like ADMIN_TOKEN)
// Without them nothing changes: data stays in the data folder only.
'use strict';
const fs = require('fs'), path = require('path');
const URL_ = (process.env.STORE_URL || '').replace(/\/+$/, ''), TOKEN = process.env.STORE_TOKEN || '';
const on = !!(URL_ && TOKEN);
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILES = ['reports.json']; // small whole files (chat history is not backed up: it is not worth the space)
async function cmd(arr) {
  const r = await fetch(URL_, { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(arr) });
  const j = await r.json(); if (j.error) throw new Error(j.error); return j.result;
}
const last = { users: {}, sessions: '' };
// Before the server starts: bring the saved data back into the data folder.
async function pull() {
  if (!on) return false;
  fs.mkdirSync(DATA, { recursive: true });
  const flat = await cmd(['HGETALL', 'rift:users']) || [], sess = await cmd(['GET', 'rift:sessions']);
  const users = {}; for (let i = 0; i + 1 < flat.length; i += 2) { try { users[flat[i]] = JSON.parse(flat[i + 1]); last.users[flat[i]] = flat[i + 1]; } catch (e) { /* skip a broken entry */ } }
  let sessions = {}; try { if (sess) { sessions = JSON.parse(sess); last.sessions = sess; } } catch (e) { /* ignore */ }
  if (Object.keys(users).length) fs.writeFileSync(path.join(DATA, 'accounts.json'), JSON.stringify({ users, sessions }));
  for (const f of FILES) { const v = await cmd(['GET', 'rift:file:' + f]); if (v) fs.writeFileSync(path.join(DATA, f), v); }
  console.log('Cloud backup: restored ' + Object.keys(users).length + ' accounts');
  return true;
}
const fail = e => console.error('Cloud backup failed: ' + (e && e.message));
// After every change: send only the accounts that changed.
function syncAccounts(DB) {
  if (!on) return;
  for (const k in DB.users) { const s = JSON.stringify(DB.users[k]); if (last.users[k] !== s) { last.users[k] = s; cmd(['HSET', 'rift:users', k, s]).catch(fail); } }
  for (const k in last.users) if (!DB.users[k]) { delete last.users[k]; cmd(['HDEL', 'rift:users', k]).catch(fail); }
  const s = JSON.stringify(DB.sessions || {}); if (s !== last.sessions) { last.sessions = s; cmd(['SET', 'rift:sessions', s]).catch(fail); }
}
function pushFile(f, value) { if (!on || !FILES.includes(f)) return; const s = JSON.stringify(value); if (s.length < 900000) cmd(['SET', 'rift:file:' + f, s]).catch(fail); }
module.exports = { on, pull, syncAccounts, pushFile };
