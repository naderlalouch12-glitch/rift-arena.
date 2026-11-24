// Rift Arena server: start here (node server.js).
// 1. If a free cloud backup is set up (see cloudstore.js), bring accounts and tickets back first.
// 2. Then start the real server (main.js): matchmaking, website, accounts, chat.
'use strict';
const cloud = require('./cloudstore');
cloud.pull().catch(e => console.error('Cloud backup could not be read: ' + (e && e.message))).then(() => require('./main'));
