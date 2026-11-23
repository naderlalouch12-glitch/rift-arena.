# Rift Arena — desktop (Steam) and iOS (App Store) app

The game lives in `src/`. Two thin shells wrap it:

| Target | Shell | Folder |
|---|---|---|
| Windows / macOS / Linux (Steam) | Electron | `electron/` |
| iPhone / iPad (App Store) | Capacitor | `ios/` |

Code layout in `src/`: `game.js` (core game), `anime.js` (anime characters, signature moves, deaths),
`app.js` (touch, gamepad, pause), `meta.js` (levels, challenges, boss waves, shop, saves), `store.js` (payments),
`modes.js` (game modes, difficulty, dimensions, chests, power-ups, login rewards, god mode), `flair.js` (anime effects, profiles, bonds),
`world.js` (map scenery and textures), `enemies.js` (enemy designs), `friends.js` (friends list), `ui.js` (lobby layout),
`skins.js` (modern character gear and skin tiers), `itemshop.js` (Item Shop, Origin packs, Rift Pass), `voice.js` (voice lines).

`src/app.js` and `src/app.css` add what a store build needs on top of the original game:
full-window layout, touch controls, gamepad support, a pause menu (Esc / P / Start) with look-speed,
and a Quit button on desktop. Everything runs offline; the 3D engine is bundled in `src/vendor/`.

## First-time setup

```bash
npm install
```

```bash
npm start
```

`npm start` runs the desktop game (add `-- --windowed` for a window). F11 or Alt+Enter toggles fullscreen.

## Before you ship: rename the placeholders

- `package.json`: `author`, `build.appId` (`com.yourstudio.riftarena`)
- `capacitor.config.json`: `appId` — then run `npx cap sync ios`
- In Xcode: the bundle identifier under Signing & Capabilities

## Steam

1. Create a Steamworks account at partner.steamgames.com and pay the US$100 app fee. You get an App ID and a Depot ID.
2. Build the game folders:

   ```bash
   npm run dist:win
   ```

   ```bash
   npm run dist:linux
   ```

   Output: `dist/win-unpacked/` (launch `Rift Arena.exe`) and `dist/linux-unpacked/` (launch `rift-arena`).
   A Mac build (`npm run dist:mac`) must be made on a Mac and signed/notarized with an Apple Developer ID.
3. Upload each folder as a depot with SteamPipe (`steamcmd` + the app/depot build scripts from the Steamworks SDK),
   and set the launch option to the executable above.
4. Fill in the store page (capsule art, screenshots, trailer, description, price), then submit the store page and
   the build for Valve review. Valve requires the store page to be public as "Coming Soon" for 2 weeks before release.

Not included yet: Steam achievements, cloud saves, leaderboards. Those need the Steamworks SDK
(e.g. the `steamworks.js` package) wired in once you have an App ID. Progress is saved locally.

## App Store (needs a Mac)

1. Join the Apple Developer Program (US$99/year).
2. On a Mac with Xcode:

   ```bash
   npm install
   ```

   ```bash
   npx cap sync ios
   ```

   ```bash
   npx cap open ios
   ```

3. In Xcode: pick your Team, set the bundle identifier, run on a real iPhone and play-test the touch controls.
4. Product > Archive > Distribute App > App Store Connect.
5. In App Store Connect: create the app record, add screenshots (6.9" iPhone and 13" iPad), description,
   age rating, privacy answers ("no data collected"), price, then submit for review.

The iOS project is already set to landscape-only, full screen, hidden status bar, with the app icon in place.

## Controls

| | Keyboard / mouse | Touch | Gamepad |
|---|---|---|---|
| Move | WASD | left stick (drag anywhere on the left) | left stick |
| Aim | mouse | drag on the right | right stick |
| Fire | left click / Space | FIRE button (drag it to aim while firing) | RT |
| Zoom (sniper) | right click | ZOOM button | LT |
| Ability | E / Shift | tap the ability slot | LB / B |
| Ultimate | Q | tap the ultimate slot | RB / Y |
| Reload | R | tap the weapon slot | X |
| Pause | Esc / P | pause button | Start |

## Notes

- Online co-op from the web version relied on the hosting page's rooms and is not available in the app;
  the game runs as single-player. Adding real multiplayer means running your own server.
- Coins and skins are earned in-game only. Selling them for real money needs Apple In-App Purchase / Steam microtransactions.
- Three.js is MIT-licensed (`src/vendor/three.LICENSE`); Electron's licenses ship automatically in the builds.

## Progression and extras

- **Character levels 1-30.** XP comes from kills, wave clears, headshots and kill streaks. Each level gives
  coins and +0.8% health and damage (max +23.2%). Levels 10, 20 and 30 unlock the Veteran, Elite and Master skins;
  levels 5/10/15/20/25/30 give titles.
- **Boss waves.** Every 5th wave a Rift Warden joins, with its own health bar.
- **Kill streaks.** Double Kill up to Unstoppable, with bonus XP.
- **Daily challenges.** Three per day, rewards coins and XP; finishing all three gives 20 gems.
- **Results screen** after every match, **Settings** (volume, look speed, graphics quality, screen shake, FPS).

## Real-money shop (gems)

Players buy gems, then spend gems on Mythic (600) and Exclusive (1200) skins. Exclusive skins have a particle
aura and coloured outline. Skins are cosmetic only and there are no random loot boxes, which keeps you clear of
loot-box rules in several countries. Products and prices are in `src/store.js`.

| Product id | Gems | Price |
|---|---|---|
| gems_100 | 100 | $0.99 |
| gems_550 | 550 | $4.99 |
| gems_1200 | 1200 | $9.99 |
| gems_2600 | 2600 | $19.99 |
| starter (one time) | 300 + 1500 coins | $2.99 |
| pack_Vanguard / pack_Ghost / pack_Brick / pack_Blaze / pack_Voltage (one time each) | that fighter's Origin skin + 500 gems + 2,000 coins | $4.99 |
| pack_all (one time) | all 5 Origin skins + 1,500 gems + 8,000 coins | $14.99 |

In App Store Connect the packs are *Non-Consumable* products: `.packkaito`, `.packyuki`, `.packgoro`, `.packakane`,
`.packmika`, `.packlegends` (after your bundle id).

**Test mode.** In the browser preview and in `npm start`, purchases are free and clearly labelled TEST MODE.
Packaged builds never use test mode.

**iPhone / iPad (Apple In-App Purchase).** Wired up through `cordova-plugin-purchase`, but not yet tested on a device.
1. In App Store Connect, under your app > In-App Purchases, create four *Consumable* products
   (`com.yourstudio.riftarena.gems100`, `.gems550`, `.gems1200`, `.gems2600`) and one *Non-Consumable* (`.starter`).
   Change `BUNDLE` in `src/store.js` if your bundle id differs.
2. Sign the Paid Apps agreement and add banking/tax details (purchases fail silently without it).
3. `npx cap sync ios`, open in Xcode, and test with a Sandbox tester account.
Apple takes 15-30%. Apple requires In-App Purchase for digital items, so do not add other payment methods to the iOS app.

**Steam.** Steam microtransactions must be started and finalised by a server you run (it holds your Steam publisher
key, which must never be inside the game). Until then the desktop build shows "Purchases are not set up in this build
yet" and the buy buttons are disabled. To finish it:
1. Steamworks: enable microtransactions for your app and get a publisher Web API key.
2. Run a small server with two endpoints that call `ISteamMicroTxn/InitTxn` and `ISteamMicroTxn/FinalizeTxn`.
3. Add the `steamworks.js` package to the Electron app, expose `steamPurchase(backend, itemId)` from
   `electron/preload.js` (it calls your server, waits for the Steam overlay approval, then finalises), and set
   `STEAM_BACKEND` in `src/store.js`.
Valve takes 30%.

**Legal basics before selling:** a privacy policy URL (both stores require one), age rating questionnaires,
prices shown in local currency (handled by Apple automatically), and refunds handled through each store.

## Security

There is no network server in this game, so a "firewall" in the usual sense does not apply. What protects it:

- **Content Security Policy** (top of `index.html`): only the game's own files can run, no inline or injected scripts,
  and no connections to any outside server.
- **Desktop app hardening** (`electron/main.js`, `package.json` > `electronFuses`): no Node.js in the page, sandboxed
  renderer, DevTools off in release builds, no debugger attach, ASAR integrity check (Windows/macOS), no navigation,
  pop-ups, web views or permission prompts, and every request outside the game folder is blocked.
- **Signed save file** (`meta.js`): editing the save is detected; the game restores the last good backup or resets.
  Sudden impossible coin jumps are rolled back. This stops casual cheating; a determined player can always cheat
  in their own offline single-player game.
- **Purchases** are only granted after the App Store or Steam confirms payment, and each transaction is granted once.
  For extra safety on iOS, add receipt validation on a server (see `cordova-plugin-purchase` validator docs).

Note: `src/index.html` no longer allows inline `<script>` code. Put any new code in a `.js` file and add a
`<script src>` tag for it, or the browser will block it.

## Game modes

Press PLAY to choose a mode, a difficulty and a dimension.

- **Survival:** endless waves, a Rift Warden boss every 5 waves, a chest every 10 waves.
- **Free for All:** you against 4 AI rival fighters; everyone fights everyone; first to 15 knockouts (or best after 6 minutes) wins.
- **Raid:** you and 2 AI allies against the Rift Colossus: 3 phases, summoned enemies, and telegraphed ground slams (red circles) to dodge. Limited lives.
- **Difficulty:** Easy, Normal, Hard, Nightmare, Impossible. Higher difficulty means stronger enemies and bigger rewards (0.75x to 3.5x).
- **Dimensions:** every 100 Survival waves cleared (counted across all matches) unlocks the next dimension: Sakura Realm, Neon Abyss, Frozen Eclipse, Inferno Rift, Celestial Void. Each has its own look, tougher enemies and higher rewards.

Free for All and Raid are played against AI fighters. Real online multiplayer needs a game server (for example Colyseus,
Photon or Nakama, or Steam networking); the AI fighters use the same targeting hooks a networked player would.

**Also new:** reward chests (Rift and Golden; earned, never sold), power-ups dropped by enemies, a 7-day login reward
calendar, a how-to-play screen, chest-only Rift-Touched skins, and level perks (5: faster reload, 15: shorter ability
cooldown, 25: more critical hits) on top of +1.5% health and damage and +0.5% speed per level.

## God mode (owner only)

In the lobby, press the small lightning button in the bottom-left corner (or tap the RIFT ARENA title 5 times) and
enter your passcode. After that, on the same device, that button is an on/off switch (the gear next to it opens the
options), the pause menu has a God mode switch, and the G key toggles it during a match. It gives: no damage, endless ammo,
ultimate always ready, one-hit knockouts, every dimension, and a starting wave. Matches with god mode on give no
XP, coins or chests, so even if someone got in they could not use it to farm rewards. Wrong passcodes are slowed down.

Change the passcode (only its fingerprint is stored in the game):

```bash
node tools/set-god-passcode.js "your new passcode"
```

Anyone with the game files could in theory remove the check, so treat it as a private tool, not a vault.

## Anime presentation and character extras

- **Ultimate cut-ins:** a full-screen anime banner with a live-rendered close-up of your fighter, the ultimate's name, their line, and speed lines.
- **Impact frames** on ultimates and boss knockouts, **speed lines** when dashing, comic **sound-effect lettering** (BOOM!, ドカーン!, K.O.!!), and a "menacing" ゴゴゴ aura when bosses arrive.
- **Lobby:** each fighter's name in giant katakana behind them and a name splash when you switch.
- **Fan service (all ages):** tap your fighter in the lobby and they react with a pose and a voice line; Profile cards
  with age, birthday, likes, dislikes and a bio; a Bond level per fighter (raised by playing with them and saying hi)
  that unlocks fun facts; win and loss quotes with a portrait on the results screen.
- **Settings > Flash effects** turns off the impact frames for players sensitive to flashing light (also off when the
  device asks for reduced motion).

## Friends

The lobby's Friends button shows your player name (editable) and your friend code (like `RIFT-AB23-CD45`; codes skip
0, O, 1, I and L so they are easy to read out). Add friends by their code, star favourites, remove them. Up to 100.

The list is saved on the device. Online status and match invites need an online server; until one exists every friend
shows as Offline and the invite button is disabled. `FRIENDS_API` in `src/friends.js` is where a server connection plugs in.
On Steam and iOS you could also use Steam friends or Game Center friends.

## Maps and enemies

Every map is dressed automatically when it is built, so all 330 maps (and each dimension) get themed floor and wall
textures, wall caps, props on top of walls, small ground details, and scenery on the horizon: city skylines, pyramids,
snowy peaks, jungle trees, candy hills, volcanoes, a harbour, floating islands. Decorations never block movement or shots.
Enemies have new designs with three looks per type: Rift Troopers, Shadow Ninjas (including kitsune masks) and Iron Oni.

## Skin tiers and effects

| Tier | Skins | What you get |
|---|---|---|
| 0 | Default, Common (150 coins) | recolour only, no effects |
| 1 | Rare (250), Veteran (LV 10) | new look: extra gear |
| 2 | Epic (450), Elite (LV 20) | new look + glowing trim |
| 3 | Legendary (800), Master (LV 30) | + glowing back blades, particle aura, kill effect |
| 4 | Mythic (600 gems), Rift-Touched (chests) | + halo crown, elemental kill effect |
| 5 | Exclusive (1200 gems), Origin (starter packs) | + energy wings, gold ultimate cut-in and a special ultimate animation |

**Paid skins (Mythic, Exclusive, Origin) each have their own animation**, defined in `SK_FX` in `src/skins.js`:
a reveal in the lobby (banner + the fighter's signature move + the skin's effect, replayed every signature move)
and a custom ultimate effect in matches. Examples: Void Emperor collapses into a black-hole implosion, Storm Sovereign
spirals lightning, Frost Empress spins a snowflake mandala into a blizzard, Titan King cracks the ground with rock
spires, Phoenix Queen spreads wings of fire, Sakura Storm whips up a petal tornado, Neon Overdrive raises an equalizer
wall, Prismatic Idol fires rainbow spotlights.

Every fighter also has modern techwear details (sneakers, collars, harnesses, visors, headsets, halo for Mika).

## More modes

- **3v3 / 5v5:** you plus AI teammates (blue tags) against an AI team (red tags). No friendly fire. First to 15 / 25 knockouts.
- **Battle Royale:** 10 fighters on a large map, loot scattered everywhere, a storm circle that shrinks in phases and
  hurts anyone outside it, no respawns. Last one standing is the Rift Champion.
All of these run against AI fighters until an online server exists.

## Item Shop and Rift Pass

- **Item Shop** (in the Shop): real-money Origin starter packs with their contents listed up front, and four featured
  skins that change every day (one at 30% off).
- **Rift Pass (Season 1):** 30 tiers. Every match gives pass XP. Free track: coins, Rift Chests and gems. Premium track
  (950 gems): more gems, 6 Golden Chests and the "Season 1 Legend" title.

## Voice lines

Each fighter has their own voice lines for being picked, saying hi, match start, ultimate, kill streaks, low health,
going down, winning and losing, with subtitles. Settings > Voices: English, Japanese (with English subtitles),
Anime babble, or Off. Kaito has a lower voice; Goro has the deepest, slowest voice with a gravelly growl layered
under it. Lines carry emotion: ultimates are shouted, low-health lines strain and slow down, wins are excited,
and each phrase in a line gets its own delivery. The spoken voices use the voices built into the player's device, so they sound different on
each device and some devices have none (those use the babble voice). For a commercial release, hire voice actors and
list the recorded files in `VOICE_FILES` at the top of `src/voice.js`; recorded files are always used first.

## Cutscene ultimates (Exclusive and Origin skins only)

The ten top-tier skins replace their fighter's normal ultimate with their own ability and a ~3 second cutscene:
letterbox bars, a title card with the skin, ability and damage, a face close-up, a shot of the summoned weapon or
creature, the strike, and a wide shot of the impact. Enemies and timers pause during the cutscene. Code: `src/cine.js`.

| Fighter | Exclusive | Origin |
|---|---|---|
| Kaito | Void Emperor: Abyss Blade (a giant blade flies up and slams down, black shockwave) | Storm Sovereign: Thunder Dragon (a lightning serpent dives in) |
| Yuki | Abyssal Frost: Glacier Lance (freezes enemies 3s) | Frost Empress: Snowfall Crown (freezes enemies 2s) |
| Goro | Golden Colossus: Heaven's Fist (knockback) | Titan King: Tectonic Meteor (knockback) |
| Akane | Sakura Storm: Petal Cyclone | Phoenix Rebel: Phoenix Dive |
| Mika | Prismatic Idol: Prism Finale | Starlight Diva: Shooting Star |

**Each cutscene is directed differently:** its own camera path (Void Emperor: dutch angles and a top-down impact;
Storm Sovereign: a 360-degree orbit as the dragon coils; Abyssal Frost: a worm's-eye view of the lance falling;
Frost Empress: a crane shot down from the sky; Golden Colossus: over Goro's shoulder up into the sky; Titan King:
handheld; Sakura Storm: tracking alongside the tornado; Phoenix Rebel: chasing the phoenix; Prismatic Idol: a
concert-style dolly; Starlight Diva: a tilt up to the falling star), its own sky mood and colour grade, lighting,
a spinning magic circle, a brush-stroke kanji title (虚空斬, 雷龍, 氷槍, 雪華冠, 天拳, 地王隕, 桜嵐, 鳳凰, 虹舞台, 流星), ambient
particles, slow motion at the impact, a manga-style impact frame and a glowing crater. The camera lifts over walls
automatically so nothing blocks the shot.

**Damage:** 300 at level 1. Each level up adds 5% of the base (+15). The per-level gain drops by 0.1 percentage
points every 50 levels (levels 51-100 add 4.9% each, 101-150 add 4.8%, and so on). With the current level cap of 30
the maximum is 735; the 50-level slowdown starts mattering if the cap is raised. Change the numbers at the top of
`src/cine.js` (`CINE_BASE_DMG`, `CINE_GAIN`, `CINE_DROP`, `CINE_EVERY`). The shop and lobby show each skin's
ability and current damage, and "Watch ultimate" plays the cutscene as a preview.

## UI polish

Exo 2 and Nunito fonts (SIL Open Font License, bundled in `src/fonts`), a splash screen, fade transitions between the
lobby and matches, a staggered lobby entrance, smooth modal open and close, press feedback and keyboard focus rings
on every button, smoothly animated HUD bars and a refined crosshair. Everything respects the device's reduced-motion
setting. Styles: `src/polish.css`.

## Recorded voices

All 122 English lines are real recordings generated with the **Kokoro** neural text-to-speech model
(Apache 2.0 licence, fine for commercial use), saved as small MP3s in `src/voice/` (1.3 MB total) and listed in
`src/voicepack.js`. Each fighter has a tuned voice: Kaito a slightly deepened young male voice, Goro a deep, slow,
gravelly voice (pitched down with saturation), Yuki soft and quiet, Akane energetic, Mika a bright idol voice.
Lines are paced by emotion (ultimates faster and louder, low health slower and strained). Measured median pitch:
Goro 86 Hz, Kaito 121 Hz, Yuki 167 Hz, Akane 211 Hz, Mika 229 Hz.

Settings > Voices: English (recorded voices) is the default. Japanese still uses the device's built-in voices.
To change or add lines, edit them in `src/voice.js` / `src/flair.js` / `src/cine.js`, then regenerate:

```bash
cd tools/voices && python3 -m venv venv && ./venv/bin/pip install kokoro-onnx soundfile
```

Download `kokoro-v1.0.onnx` and `voices-v1.0.bin` from the kokoro-onnx GitHub releases into `tools/voices/model/`, then:

```bash
node tools/voices/lines.js tools/voices/lines.json && tools/voices/venv/bin/python tools/voices/gen.py
```

Professional voice actors are still the gold standard for a commercial launch; their recordings can replace these
files one for one (same file names), or be listed in `VOICE_FILES` in `src/voice.js`.

## Online play (3v3, 5v5, Battle Royale)

These three modes are for **real players**. There is no difficulty setting: everyone plays on equal terms.
Players are only matched with others whose fighter level is within **10 levels** (the highest and lowest level in a
match are at most 10 apart). "Practice vs bots" is still available but gives **no rewards** (no XP, coins, chests,
Rift Pass progress or challenge progress). Survival, Free for All and Raid are unchanged.

**The server** is in `server/` (Node.js, WebSocket). It does matchmaking, balances teams by level, and relays match
traffic, stamping every message with its real sender. Tested: level 5 and level 20 are never matched; 5 and 14 are.

```bash
cd server && npm install && node server.js
```

Put it behind TLS (wss://) on a host of your choice (any Node host: Fly.io, Render, a VPS), then in the game:
1. `src/net.js`: set `SERVER_URL` to `wss://your.host`.
2. `src/index.html`: add `wss://your.host` to `connect-src` in the Content Security Policy.
3. `electron/main.js`: set `ALLOWED_NET` to `wss://your.host/`.

Until `SERVER_URL` is set the game tells players online play isn't live yet and offers practice vs bots.

**Limits to know before launch:** levels are reported by the game itself, so a modified client could lie about its
level; making that cheat-proof needs player accounts and server-side saves. Hit detection is done by the shooter's
game (client-side), which is normal for small indie shooters but can be abused by cheaters; a server-authoritative
model is the next step if the game grows. One server process handles all matches; for many players, run several.

## Community website (chat + problem reports)

The same server also runs the Rift Arena community website, on the same address as matchmaking.

- **Home**: the trailer, live numbers (players in matches, people in chat, open and fixed tickets) and the hero roster.
- **Chat**: live global chat with topic channels (Global, Looking for group, Help, Fan corner) and region channels
  (North America, Europe, Latin America, Asia, Oceania), an online list and hero badges. Built for every age group:
  bad words are masked, links, e-mail addresses and phone numbers are blocked, every player is rate limited, and any
  message can be flagged, which opens a ticket for the team.
- **Report a problem**: category, title, what happened, steps, device, mode, hero, version, optional contact and a
  screenshot (PNG/JPG/WEBP up to 1.8 MB). The player gets a ticket number and a private code.
- **My tickets**: players check status (Received → Being looked at → Fixed) and read the team's replies.
- **Team login** (link in the footer): the ticket desk. Filter tickets, change status, reply to players, and
  delete chat messages or mute a player for an hour (the buttons show up in the chat while logged in).

Files: `server/community.js` (chat, reports, admin API, safety filters), `server/web/` (the site).
Tickets, chat history (last 100 messages per channel) and screenshots are saved in `server/data/`
(or `DATA_DIR`). Admin is turned off until you set `ADMIN_TOKEN`.

Run it locally:

```bash
cd server && npm install && ADMIN_TOKEN=pick-a-long-secret node server.js
```

Then open http://localhost:8787. **Put it online** with Render: push the project to GitHub, then on render.com choose
**New → Blueprint** and pick the repository; `render.yaml` sets everything up. Render shows your `ADMIN_TOKEN`
under **Environment**. Use the address Render gives you (`wss://…onrender.com`) as `SERVER_URL` in the game (see
Online play above).

Moderation tips: check the desk daily, reply to every ticket, and keep the admin key private. For a big community,
add more moderators by sharing the key only with people you trust, and consider a hosted moderation service.

## First-person weapons and balance (update)

- **First-person weapons** (`src/viewmodel.js`): every hero holds a detailed, cel-shaded weapon with ink outlines
  and gloved hands in their outfit colours (Rift Rifle with holo sight, Longshot with a glowing scope, armoured
  double-barrel Scatter Cannon, Hellbore launcher with vent rings, Arc Blaster with spinning coils). The equipped skin
  repaints it and the skin tier adds effects: tier 0-1 plain paint, tier 2 glowing trim, tier 3 pulsing energy and
  orbiting motes, tier 4-5 also a rune ring at the muzzle. Reloads tilt the weapon. The lobby and third-person
  weapons are unchanged.
- **Gentler start in Survival**: wave 1 has 3 enemies and wave 2 has 5 (was 5 and 7). Enemy damage ramps up over the
  first waves: Easy 35% → 100% over 8 waves, Normal 45% → 100% over 6, Hard 70% → 100% over 4. Nightmare and
  Impossible are unchanged.
- **Defeat screen polish**: the death camera starts outside the hero, and voice subtitles move to the top of the
  screen while a window (results, shop, chests) is open so they never cover its buttons.

## Fixes from the latest playtest

- **Mouse aiming (desktop/Steam)**: the desktop app now allows mouse lock (and fullscreen), so the camera follows the
  mouse without holding a button. Clicking anywhere on the game grabs the mouse; a "Click to aim" hint shows during a
  match while the mouse is not locked, and explains what to do if a browser blocks the lock.
- **Graphics safety net** (`electron/main.js`, `src/boot-check.js`): older graphics cards are used even when Chromium
  distrusts their driver; if 3D still cannot start, the game restarts once in software rendering and remembers it; as
  a last resort a clear "needs 3D graphics" message explains how to fix it.
- **Windows keep their buttons in view**: START/OK/Back rows stick to the bottom of every window, so "Choose your
  battle" never hides START on smaller screens.
- **Hit feedback sounds** (`src/sfx.js`): a crisp tick when your shot lands, a "ding" on headshots and a chime on
  kills, instead of the old buzzer. They follow the volume setting.
- **Fixed**: the controls reminder at the bottom of the match screen (Q Ultimate, emotes 1-5) was being erased; the
  wave counter now reads "Wave 1 · 3 left"; the lobby's showcase weapon no longer cuts through the hero.

## Accounts, Ranked and the coin store

- **Accounts** (`src/account.js`, `server/accounts.js`): log in with a name and password (no e-mail). Sign-up shows a
  one-time recovery code. While logged in, the save uploads to the server every 30 seconds when it changes, so
  reinstalling or a new device keeps everything. The lobby's top bar shows your name and rank.
- **Ranked 3v3** (new mode in "Choose your battle"): needs an account; rank points live on the server, which counts
  knockouts and decides the result. Tiers: Bronze → Silver → Gold → Platinum → Diamond → Rift Master → **Void Emperor**.
  Fair rules: placements, win-streak bonus, rank shield after a promotion, leaver protection. The community website
  shows the leaderboard.
- **Connect the game to your server**: `node tools/set-server.js https://your-server.onrender.com`, then rebuild.
- **Coins for real money**: Bag (1,000 coins, $0.99), Sack (3,500, $2.99), Treasure (7,500, $4.99). Gems stay for the
  rarest skins: Mythic 450 gems (~$4), Exclusive 800 gems (~$7), Rift Pass premium 600 gems. Product ids are in
  `src/store.js`; create the same ids in Steamworks / App Store Connect.
- **Rare-skin voice lines** (`src/skinvoice.js`): Mythic and top coin skins say their own line at match start and on
  kills. New lines are recorded with `tools/voices/gen-extra.py`.
- **Promotion**: three vertical Shorts (`release/Short-*.mp4`) and a guide video (`release/How-to-get-players-for-Rift-Arena.mp4`).
