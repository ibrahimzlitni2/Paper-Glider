import { neon } from "@neondatabase/serverless";
import crypto from "node:crypto";
import { SKINS, UPGRADES, LIMITS } from "./_catalog.js";

// ---------------------------------------------------------------------------
// Env: DATABASE_URL (required, Neon connection string)
//      TICKET_SECRET (recommended, any long random string; falls back to a hash of DATABASE_URL)
// ---------------------------------------------------------------------------
const sql = neon(process.env.DATABASE_URL);
const SECRET =
  process.env.TICKET_SECRET ||
  crypto.createHash("sha256").update("pg-ticket:" + (process.env.DATABASE_URL || "")).digest("hex");

const TICKET_TTL_MS = 12 * 3600 * 1000;
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const hmac = (s) => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");

function makeTicket(id) {
  const body = Buffer.from(JSON.stringify({ id, exp: Date.now() + TICKET_TTL_MS })).toString("base64url");
  return body + "." + hmac(body);
}
function readTicket(t) {
  if (typeof t !== "string" || t.length > 400) return null;
  const [body, sig] = t.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(hmac(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const o = JSON.parse(Buffer.from(body, "base64url").toString());
    return o.exp > Date.now() && typeof o.id === "string" ? o.id : null;
  } catch {
    return null;
  }
}

const TOKEN_RE = /^[0-9a-f]{32,128}$/;
const NICK_RE = /^[\p{L}\p{N} _.\-]{2,16}$/u;
const cleanNick = (n) => {
  if (typeof n !== "string") return null;
  n = n.normalize("NFKC").replace(/\s+/g, " ").trim();
  return NICK_RE.test(n) ? n : null;
};

const pub = (r) => ({
  id: r.id,
  nickname: r.nickname,
  skin: r.equipped_skin,
  upgrades: r.upgrades || {},
});
const full = (r) => ({
  ...pub(r),
  coins: r.coins,
  skins: r.skins,
  kills: r.kills,
  deaths: r.deaths,
  ticket: makeTicket(r.id),
});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function playerByToken(token) {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) throw new HttpError(400, "Bad token");
  const rows = await sql`select * from players where token_hash = ${sha(token)}`;
  if (!rows.length) throw new HttpError(404, "Unknown player. Choose a nickname first.");
  return rows[0];
}

// ---------------------------------------------------------------------------
const actions = {
  // Create the player on first call (nickname required), otherwise refresh. Returns profile + ticket + catalog.
  async me(b) {
    if (typeof b.token !== "string" || !TOKEN_RE.test(b.token)) throw new HttpError(400, "Bad token");
    const h = sha(b.token);
    const nick = cleanNick(b.nickname);
    let rows;
    if (b.nickname != null && !nick)
      throw new HttpError(400, "Nickname must be 2–16 characters: letters, numbers, space, _ . -");
    if (nick) {
      rows = await sql`
        insert into players (token_hash, nickname) values (${h}, ${nick})
        on conflict (token_hash) do update set nickname = excluded.nickname, updated_at = now()
        returning *`;
    } else {
      rows = await sql`select * from players where token_hash = ${h}`;
      if (!rows.length) throw new HttpError(404, "Pick a nickname to get started.");
    }
    return { player: full(rows[0]), catalog: { skins: SKINS, upgrades: UPGRADES, limits: { maxLevel: LIMITS.maxLevel } } };
  },

  async buy(b) {
    const p = await playerByToken(b.token);
    const h = p.token_hash;
    if (b.kind === "skin") {
      const s = SKINS.find((x) => x.id === b.id);
      if (!s) throw new HttpError(400, "Unknown skin");
      if (p.skins.includes(s.id)) throw new HttpError(409, "You already own this skin");
      if (p.coins < s.price) throw new HttpError(402, "Not enough coins");
      const rows = await sql`
        update players set coins = coins - ${s.price}, skins = array_append(skins, ${s.id}), updated_at = now()
        where token_hash = ${h} and coins >= ${s.price} and not (${s.id} = any(skins))
        returning *`;
      if (!rows.length) throw new HttpError(409, "Purchase failed, try again");
      await sql`insert into coin_events (player_id, amount, reason) values (${p.id}, ${-s.price}, ${"buy:skin:" + s.id})`;
      return { player: full(rows[0]) };
    }
    if (b.kind === "upgrade") {
      const u = UPGRADES[b.id];
      if (!u) throw new HttpError(400, "Unknown upgrade");
      const cur = Math.max(0, (p.upgrades && p.upgrades[b.id]) | 0);
      if (cur >= u.costs.length) throw new HttpError(409, "Already maxed");
      const cost = u.costs[cur];
      if (p.coins < cost) throw new HttpError(402, "Not enough coins");
      const rows = await sql`
        update players
        set coins = coins - ${cost},
            upgrades = jsonb_set(upgrades, ARRAY[${b.id}]::text[], to_jsonb(${cur + 1}::int), true),
            updated_at = now()
        where token_hash = ${h} and coins >= ${cost} and coalesce((upgrades ->> ${b.id})::int, 0) = ${cur}
        returning *`;
      if (!rows.length) throw new HttpError(409, "Purchase failed, try again");
      await sql`insert into coin_events (player_id, amount, reason) values (${p.id}, ${-cost}, ${"buy:upgrade:" + b.id})`;
      return { player: full(rows[0]) };
    }
    throw new HttpError(400, "Bad kind");
  },

  async equip(b) {
    const p = await playerByToken(b.token);
    const s = SKINS.find((x) => x.id === b.id);
    if (!s) throw new HttpError(400, "Unknown skin");
    const rows = await sql`
      update players set equipped_skin = ${s.id}, updated_at = now()
      where token_hash = ${p.token_hash} and ${s.id} = any(skins)
      returning *`;
    if (!rows.length) throw new HttpError(403, "You don't own that skin");
    return { player: full(rows[0]) };
  },

  // The host of a room calls this with a joiner's ticket to learn their verified nickname/skin/upgrades.
  async lookup(b) {
    const id = readTicket(b.ticket);
    if (!id) throw new HttpError(401, "Invalid or expired ticket. Reopen Multiplayer to refresh it.");
    const rows = await sql`select id, nickname, equipped_skin, upgrades from players where id = ${id}`;
    if (!rows.length) throw new HttpError(404, "Player not found");
    return { player: pub(rows[0]) };
  },

  // Host reports kills / deaths. Coin amounts are computed here from streaks (never trusted from the client),
  // both players' tickets must be valid, and payouts are rate limited.
  async kill(b) {
    await playerByToken(b.token); // reporter must be a real player
    const list = Array.isArray(b.kills) ? b.kills.slice(0, 10) : [];
    const out = [];
    for (const k of list) {
      const victim = readTicket(k.vt);
      if (!victim) continue;
      const killer = k.kt ? readTicket(k.kt) : null;
      await sql`update players set deaths = deaths + 1, updated_at = now() where id = ${victim}`;
      if (!killer || killer === victim) continue;

      const recent = await sql`
        select
          coalesce(sum(amount) filter (where created_at > now() - interval '1 minute'), 0)::int as minute,
          count(*) filter (where ref = ${victim} and created_at > now() - make_interval(secs => ${LIMITS.pairCooldownSec}))::int as pair
        from coin_events where player_id = ${killer} and reason = 'kill' and created_at > now() - interval '1 minute'`;
      const { minute, pair } = recent[0];
      const ks = Math.min(5, Math.max(0, (k.ks | 0) - 1));
      const vs = Math.min(5, Math.max(0, k.vs | 0));
      let amount = LIMITS.killBase + ks * LIMITS.streakStep + vs * LIMITS.bountyStep;
      amount = Math.max(0, Math.min(amount, LIMITS.perMinute - minute));
      if (pair > 0) amount = 0;

      await sql`update players set kills = kills + 1, coins = coins + ${amount}, updated_at = now() where id = ${killer}`;
      if (amount > 0)
        await sql`insert into coin_events (player_id, amount, reason, ref) values (${killer}, ${amount}, 'kill', ${victim})`;
      out.push({ killer, victim, amount });
    }
    return { ok: true, awarded: out };
  },

  async top() {
    const rows = await sql`select nickname, kills, deaths from players order by kills desc, deaths asc limit 10`;
    return { top: rows };
  },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  const name = req.query.action;
  const fn = Object.prototype.hasOwnProperty.call(actions, name) ? actions[name] : null;
  if (!fn) return res.status(404).json({ error: "Not found" });
  if (name !== "top" && req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    if (!process.env.DATABASE_URL) throw new HttpError(500, "DATABASE_URL is not set on the server");
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const result = await fn(body || {});
    return res.status(200).json(result);
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
}
