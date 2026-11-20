# Rift Arena Server

The online server for **Rift Arena**. One small Node.js program runs three things on one web address:

- **Matchmaking** for the online modes: 3v3, 5v5 and Battle Royale. It only matches players whose fighter levels are within 10 of each other, and it balances teams by level.
- **Live match relay**: passes each player's movement and hits to the others in the match.
- **Player accounts and cloud saves**: players log in with a name and password (no e-mail, safe for kids) and their progress follows them to any device. Sign-up gives a one-time recovery code for forgotten passwords.
- **Ranked 3v3**: rank points are kept on the server, so nobody can fake a rank. Tiers: Bronze, Silver, Gold, Platinum, Diamond, Rift Master and **Void Emperor**. The server counts the knockouts and decides who won.
- **The community website**: a home page with the Ranked leaderboard, a global chat with topic and region channels, a "Report a problem" form with ticket tracking, and a team desk for moderators.

## What's in this repository

| Path | What it is |
|---|---|
| `render.yaml` | Settings for one-click hosting on Render (free plan). |
| `server/server.js` | Matchmaking and match relay (WebSocket). |
| `server/community.js` | Website, chat, problem reports and the moderator API. |
| `server/accounts.js` | Player accounts, cloud saves, Ranked points and the leaderboard. |
| `server/test-ranked.js` | Automatic tests for accounts, cloud saves and Ranked. |
| `server/web/` | The website's pages, styles, images and fonts. |
| `server/test-server.js` | Automatic tests for matchmaking. |

## Put it online (Render, free)

1. Sign in at [render.com](https://render.com) with your GitHub account.
2. Click **New + → Blueprint**, pick this repository and click **Connect**.
3. Click **Deploy Blueprint** (on some screens: **Apply**).
4. Wait 2–5 minutes until the service says **Live**.
5. Open the service. Your address is at the top and ends in `.onrender.com`. Opening it shows the community website.
6. Put that address into the game (`src/net.js` → `SERVER_URL`, using `wss://` instead of `https://`) and rebuild. Claude can do this step for you.

## Settings (Render → your service → Environment)

| Key | Value | What it does |
|---|---|---|
| `ADMIN_TOKEN` | Created for you by Render | Your moderator key. Paste it into **Team login** at the bottom of the website. Keep it secret. If it is not set, the team desk is switched off. |
| `TRUST_PROXY` | `1` | Use the player's real address for spam limits when running behind Render. |
| `MATCH_SCALE` | `0.34` for testing; delete it (or `1`) for launch | Shrinks how many players a match needs. At `0.34`, 3v3 starts with 2 players, and 5v5 and Battle Royale with 3. At `1`: 6, 10 and 10. |
| `DATA_DIR` | e.g. `/var/data` (optional) | Folder for tickets, chat history and screenshots. Point it at a Render **Disk** to keep them when the server restarts. |
| `PORT` | Set by Render automatically | The port the server listens on (8787 when you run it yourself). |

## Moderating

1. Open your website and click **Team login** at the bottom.
2. Paste your `ADMIN_TOKEN` and click **Open desk**.
3. In the desk you can:
   - see every problem report, including flagged chat messages;
   - set a ticket to **Received**, **Being looked at**, **Fixed** or **Closed**;
   - write a reply that the player sees when they check their ticket.
4. While you are logged in, every chat message shows **Delete** and **Mute 1h** buttons.

**Chat safety (always on):** bad words are masked; links, e-mail addresses and phone numbers are blocked; every player is rate limited; and any player can flag a message, which opens a ticket for the team.

## Run it on your own computer

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
cd server
npm install
ADMIN_TOKEN=pick-a-long-secret node server.js
```

Open http://localhost:8787. To run the tests:

```bash
cd server
node test-server.js
node test-ranked.js
```

## Ranked rules

| Result | Rank points |
|---|---|
| Win | +25, plus up to +10 on a win streak |
| Loss | -20 (never below 0) |
| A teammate quits | Your loss is only -5 |
| You quit | -30 |
| First 5 matches (placements) | Everything x1.6, so new players find their level fast |
| Just promoted | A rank shield: the next 3 losses can't drop you out of your new tier |

Tiers are 500 RP apart: Bronze 0, Silver 500, Gold 1000, Platinum 1500, Diamond 2000, Rift Master 2500, Void Emperor 3000+.

## Free plan: good to know

- The server **sleeps after 15 minutes** with nobody on it. The next visitor waits about a minute while it wakes up.
- **Accounts, ranks, tickets and chat history are cleared** when the server restarts or redeploys. That's fine for testing, but **before real players make accounts, add a Disk** (below), or their accounts will disappear.
- **Before launch:** switch the service to Render's **Starter** plan (a few dollars a month; it never sleeps), add a **Disk** (Render → your service → Disks, mount path `/var/data`, 1 GB is plenty) and set `DATA_DIR` to `/var/data` under Environment. Now accounts, ranks, tickets and chat are kept for good.

## Website addresses

| Address | What it is |
|---|---|
| `/` | The website |
| `/chat` | Live chat (WebSocket) |
| `/api/status` | Players in matches, people in chat, open and fixed tickets |
| `/api/reports` | Send a problem report (POST) |
| `/api/reports/RA-XXXXXX?key=…` | A player checks their ticket |
| `/api/admin/…` | Moderator tools (need the `x-admin-token` header) |
| `/api/account/…` | Sign up, log in, recovery, cloud save (used by the game) |
| `/api/ranked/top` | The Ranked leaderboard (top 50) |

Matchmaking uses a WebSocket connection to `/`.

## Fonts

The website uses **Exo 2** and **Nunito**, under the SIL Open Font License (see `server/web/fonts/OFL-*.txt`).
