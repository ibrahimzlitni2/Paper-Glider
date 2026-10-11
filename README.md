# Paper Glider — Multiplayer

WebRTC dogfights (PeerJS) with a Neon-backed shop. Single-player is unchanged.

## Layout (drop into your repo root)

```
public/index.html      the game (original + multiplayer, one file)
api/[action].js        Vercel serverless API (profiles, shop, tickets, kill rewards, leaderboard)
api/_catalog.js        skins, upgrades and prices (single source of truth, validated server-side)
package.json           depends on @neondatabase/serverless
schema.sql             run once in the Neon SQL editor
```

If your repo currently has the game at the root as `index.html`, move it to `public/index.html`
(replace it with this file) and set the Vercel framework preset to **Other** (no build command).

## Setup

1. **Neon:** open the SQL editor and run `schema.sql`.
2. **Vercel → Project → Settings → Environment Variables:**
   - `DATABASE_URL` — your Neon connection string (the Neon integration adds this for you).
   - `TICKET_SECRET` — optional but recommended: any long random string. If unset, one is derived from `DATABASE_URL`.
3. Push / deploy. Open the site → **Multiplayer**.

Local dev: `npm i && vercel dev` (needs `DATABASE_URL` in `.env.local`).
To host the HTML somewhere other than the API's origin, set `window.PG_API = "https://your-app.vercel.app"` before the game script (CORS is enabled).

## How it works

- **Rooms:** the host creates a room; the code is the PeerJS id `pgl-XXXXX`. Joiners connect through the free PeerJS cloud broker,
  then everything flows peer-to-peer (star topology, up to 8 players, host leaving ends the match). Share `?room=XXXXX` links.
- **Identity:** a random secret token lives in the browser's localStorage (only its SHA-256 is stored in Neon). The API turns it into a
  12-hour signed *ticket*. Joiners hand their ticket to the host; the host asks `/api/lookup` for that player's verified nickname,
  skin and upgrade levels, so nobody can claim upgrades they don't own.
- **Authority:** each client flies its own plane. The host owns HP, hit detection (swept sphere tests on host-simulated bolts),
  fire-rate/heat limits, kills, respawns and spawn protection.
- **Coins:** the host reports kills to `/api/kill` with both players' tickets. The server computes the payout itself
  (20 + streak bonus + victim bounty), ignores repeated killer→victim pairs within 8 s, ignores self-kills, and caps earnings at 300 coins per player per minute.
  Purchases are single atomic SQL updates, so concurrent clicks can't overspend.
- **Arena:** a 390 m disc inside the open Green meadow zone; leaving it steers you back.
  Birds, the eagle and volcano bombs are disabled in multiplayer. Terrain, buildings, water and lava still crash you
  (a crash within 6 s of being shot credits the shooter).

## Balance (all in `api/_catalog.js` + `mults()` in `public/index.html`)

Base: 100 HP, 8 damage per volley. Upgrades (5 levels each): top speed +4%/boost +8%, agility +7%, armor +15 HP,
damage +15%, fire rate −6% interval, cooling −7% heat & +12% cooldown, bolt speed +8%.

## Known limitations

- Movement is trusted from each client (the host only validates combat). A modified client could cheat movement.
- The host doesn't know about buildings, so shots can hit through them (terrain does block).
- A hostile host could inflate coins up to the per-minute caps. Keep rooms among friends, or tighten `LIMITS` in `_catalog.js`.
- The host's tab must stay visible: browsers pause animation frames in background tabs, which freezes the room.
- Players behind strict symmetric NATs rely on PeerJS's public TURN relay.
