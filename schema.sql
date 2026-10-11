-- Paper Glider multiplayer — run once in the Neon SQL editor.

create table if not exists players (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique,              -- sha256 of the secret token kept in the player's browser
  nickname      text not null,
  coins         integer not null default 0 check (coins >= 0),
  kills         integer not null default 0,
  deaths        integer not null default 0,
  equipped_skin text not null default 'classic',
  skins         text[] not null default array['classic'],
  upgrades      jsonb not null default '{}'::jsonb, -- { "speed": 2, "damage": 1, ... }
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists coin_events (
  id         bigserial primary key,
  player_id  uuid not null references players(id) on delete cascade,
  amount     integer not null,                      -- positive = earned, negative = spent
  reason     text not null,                         -- 'kill', 'buy:skin', 'buy:upgrade'
  ref        uuid,                                  -- victim id for kills
  by_player  uuid,                                  -- who reported it (the host)
  created_at timestamptz not null default now()
);

create index if not exists coin_events_player_time on coin_events (player_id, created_at desc);
create index if not exists players_kills on players (kills desc);
