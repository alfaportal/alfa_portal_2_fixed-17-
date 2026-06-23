-- Alfa Portal VIP — panel agjentësh / lojtarësh / baste
-- Ekzekutoni në Supabase SQL Editor (projekti rzpiurlabidtvrcumsta ose i ri)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS panel_settings (
  id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  admin_secret    TEXT NOT NULL DEFAULT 'alfa-vip2024',
  admin_password_hash TEXT NOT NULL DEFAULT '',
  base_value      NUMERIC(12, 2) NOT NULL DEFAULT 10,
  main_url        TEXT NOT NULL DEFAULT 'https://alfaportal-vip.com',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS panel_agents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,
  pass        TEXT NOT NULL,
  pct         INTEGER NOT NULL DEFAULT 20,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  level       TEXT NOT NULL CHECK (level IN ('super', 'sub')),
  parent_id   UUID REFERENCES panel_agents(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_panel_agents_parent ON panel_agents(parent_id);
CREATE INDEX IF NOT EXISTS idx_panel_agents_status ON panel_agents(status);

CREATE TABLE IF NOT EXISTS panel_players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT DEFAULT '',
  tel         TEXT DEFAULT '',
  platform    TEXT NOT NULL DEFAULT 'Stake',
  note        TEXT DEFAULT '',
  agent_id    UUID NOT NULL REFERENCES panel_agents(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_panel_players_agent ON panel_players(agent_id);

CREATE TABLE IF NOT EXISTS panel_bets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID REFERENCES panel_players(id) ON DELETE SET NULL,
  player_name   TEXT NOT NULL DEFAULT '',
  agent_id      UUID NOT NULL REFERENCES panel_agents(id) ON DELETE CASCADE,
  agent_name    TEXT NOT NULL DEFAULT '',
  platform      TEXT DEFAULT 'Stake',
  sport         TEXT DEFAULT '',
  event         TEXT DEFAULT '',
  amount        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  coef          NUMERIC(12, 4) NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
  note          TEXT DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_panel_bets_agent ON panel_bets(agent_id);
CREATE INDEX IF NOT EXISTS idx_panel_bets_player ON panel_bets(player_id);
CREATE INDEX IF NOT EXISTS idx_panel_bets_status ON panel_bets(status);

-- RLS off — API server përdor service role key
ALTER TABLE panel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_bets ENABLE ROW LEVEL SECURITY;
