-- Ekzekutoni nëse panel-schema.sql u ekzekutua më parë me RLS ON (pa politika).
-- Shkaku: leximi i panel_settings dështon me anon key ose permission denied.

ALTER TABLE IF EXISTS panel_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS panel_agents DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS panel_players DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS panel_bets DISABLE ROW LEVEL SECURITY;
