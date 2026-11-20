# Rift Arena Server

The online server for **Rift Arena**. One small Node.js program runs three things on one web address:

- **Matchmaking** for the online modes: 3v3, 5v5 and Battle Royale. It only matches players whose fighter levels are within 10 of each other, and it balances teams by level.
- **Live match relay**: passes each player's movement and hits to the others in the match.
- **The community website**: a home page, a global chat with topic and region channels, a "Report a problem" form with ticket tracking, and a team desk for moderators.

## What's in this repository

| Path | What it is |
|---|---|
| `render.yaml` | Settings for one-click hosting on Render (free plan). |
| `server/server.js` | Matchmaking and match relay (WebSocket). |
| `server/community.js` | Website, chat, problem reports and the moderator API. |
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

Open http://localhost:8787. To run the matchmaking tests:

```bash
cd server
node test-server.js
```

## Free plan: good to know

- The server **sleeps after 15 minutes** with nobody on it. The next visitor waits about a minute while it wakes up.
- **Tickets, chat history and screenshots are cleared** when the server restarts or redeploys.
- When real players arrive, switch the service to Render's **Starter** plan (a few dollars a month). It never sleeps. To keep tickets and chat for good, also add a **Disk** (mount path `/var/data`) and set `DATA_DIR` to `/var/data`.

## Website addresses

| Address | What it is |
|---|---|
| `/` | The website |
| `/chat` | Live chat (WebSocket) |
| `/api/status` | Players in matches, people in chat, open and fixed tickets |
| `/api/reports` | Send a problem report (POST) |
| `/api/reports/RA-XXXXXX?key=…` | A player checks their ticket |
| `/api/admin/…` | Moderator tools (need the `x-admin-token` header) |

Matchmaking uses a WebSocket connection to `/`.

## Fonts

The website uses **Exo 2** and **Nunito**, under the SIL Open Font License (see `server/web/fonts/OFL-*.txt`).
