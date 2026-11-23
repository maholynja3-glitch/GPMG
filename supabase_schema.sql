-- =============================================================
--  GPMG FREE FIRE - SCHEMA SUPABASE COMPLET
--  Projet : https://cxurjmymrnekfoajbmdu.supabase.co
--  Toutes pages : index, game, inscription, login, suivi,
--                 loot, wach, tarif, acc, thedarkshift (admin)
--  Copiez ce SQL dans : Supabase > SQL Editor > Run
-- =============================================================

-- ───────────────────────────────────────────────
-- 0. EXTENSIONS
-- ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ───────────────────────────────────────────────
-- 1. TABLE : tournaments  (game.html, thedarkshift admin)
-- ───────────────────────────────────────────────
DROP TABLE IF EXISTS tournaments CASCADE;
CREATE TABLE tournaments (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title         TEXT        NOT NULL,
  mode          TEXT        NOT NULL DEFAULT 'SOLO',   -- SOLO / DUO / SQUAD / CUSTOM
  max_slots     INT         NOT NULL DEFAULT 12,
  filled_slots  INT         NOT NULL DEFAULT 0,
  fee           INT         NOT NULL DEFAULT 0,        -- MGA
  entry_fee     INT         NOT NULL DEFAULT 0,        -- MGA
  prize         TEXT        NOT NULL DEFAULT '0 MGA',
  prize_pool    TEXT        NOT NULL DEFAULT '0 MGA',
  datetime      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT        NOT NULL DEFAULT 'OUVERT', -- OUVERT / EN COURS / COMPLET / TERMINE
  rules         TEXT,
  room_id       TEXT,
  room_password TEXT,
  room_published BOOLEAN    NOT NULL DEFAULT false,
  map           TEXT        DEFAULT 'Bermuda',
  type          TEXT        DEFAULT 'classique',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────
-- 2. TABLE : registrations  (inscription.html, suivi.html, admin)
-- ───────────────────────────────────────────────
DROP TABLE IF EXISTS registrations CASCADE;
CREATE TABLE registrations (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tournament_id   TEXT        REFERENCES tournaments(id) ON DELETE CASCADE,
  team_name       TEXT        NOT NULL,
  player_name     TEXT,
  uid_free_fire   TEXT,
  phone           TEXT        NOT NULL,
  operator        TEXT        NOT NULL DEFAULT 'airtel', -- airtel / orange
  sms_ref         TEXT        NOT NULL,
  amount_paid     INT         NOT NULL DEFAULT 0,
  proof_image     TEXT,       -- Capture d'ecran du recu de paiement
  status          TEXT        NOT NULL DEFAULT 'pending', -- pending / validated / rejected
  reject_reason   TEXT,
  squad_members   JSONB       DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────
-- 3. TABLE : match_scores  (suivi.html, admin)
-- ───────────────────────────────────────────────
DROP TABLE IF EXISTS match_scores CASCADE;
CREATE TABLE match_scores (
  id              BIGSERIAL   PRIMARY KEY,
  tournament_id   TEXT        REFERENCES tournaments(id) ON DELETE CASCADE,
  registration_id TEXT        REFERENCES registrations(id) ON DELETE SET NULL,
  match_number    INT         NOT NULL DEFAULT 1,
  team_name       TEXT        NOT NULL,
  rank_position   INT         NOT NULL DEFAULT 1,
  kills           INT         NOT NULL DEFAULT 0,
  place_points    INT         NOT NULL DEFAULT 0,
  kill_points     INT         NOT NULL DEFAULT 0,
  total_points    INT         GENERATED ALWAYS AS (place_points + kill_points) STORED,
  booyah          BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────
-- 4. TABLE : leaderboard_cache  (suivi.html, admin)
-- ───────────────────────────────────────────────
DROP TABLE IF EXISTS leaderboard_cache CASCADE;
CREATE TABLE leaderboard_cache (
  id              BIGSERIAL   PRIMARY KEY,
  tournament_id   TEXT        REFERENCES tournaments(id) ON DELETE CASCADE,
  registration_id TEXT        REFERENCES registrations(id) ON DELETE SET NULL,
  team_name       TEXT        NOT NULL,
  total_points    INT         NOT NULL DEFAULT 0,
  total_kills     INT         NOT NULL DEFAULT 0,
  booyahs         INT         NOT NULL DEFAULT 0,
  matches_played  INT         NOT NULL DEFAULT 0,
  rank_position   INT         NOT NULL DEFAULT 1,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, team_name)
);

-- ───────────────────────────────────────────────
-- 5. TABLE : players  (login.html, inscription.html, acc.html)
-- ───────────────────────────────────────────────
DROP TABLE IF EXISTS players CASCADE;
CREATE TABLE players (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id    UUID        UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT        UNIQUE,
  full_name       TEXT,
  phone           TEXT        NOT NULL,
  squad_name      TEXT,
  uid_free_fire   TEXT,
  payment_mode    TEXT        DEFAULT 'mvola',
  total_wins      INT         NOT NULL DEFAULT 0,
  total_matches   INT         NOT NULL DEFAULT 0,
  is_banned       BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS player_id UUID REFERENCES players(id) ON DELETE SET NULL;

-- ───────────────────────────────────────────────
-- 6. TABLE : banned_uids  (thedarkshift admin)
-- ───────────────────────────────────────────────
DROP TABLE IF EXISTS banned_uids CASCADE;
CREATE TABLE banned_uids (
  uid         TEXT        PRIMARY KEY,
  reason      TEXT,
  banned_by   TEXT        DEFAULT 'admin',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────
-- 7. TABLE : mobile_money_settings  (inscription.html, admin)
-- ───────────────────────────────────────────────
DROP TABLE IF EXISTS mobile_money_settings CASCADE;
CREATE TABLE mobile_money_settings (
  key           TEXT        PRIMARY KEY,
  number        TEXT        NOT NULL,
  holder_name   TEXT        NOT NULL DEFAULT 'GPMG',
  operator      TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────
-- 8. TABLE : announcements  (index.html, thedarkshift admin)
-- ───────────────────────────────────────────────
DROP TABLE IF EXISTS announcements CASCADE;
CREATE TABLE announcements (
  id          BIGSERIAL   PRIMARY KEY,
  title       TEXT        NOT NULL,
  content     TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'info',  -- info / warning / event / promo
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  priority    INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────
-- 9. TABLE : streams  (wach.html, thedarkshift admin)
-- ───────────────────────────────────────────────
DROP TABLE IF EXISTS streams CASCADE;
CREATE TABLE streams (
  id              BIGSERIAL   PRIMARY KEY,
  title           TEXT        NOT NULL,
  description     TEXT,
  youtube_url     TEXT,
  twitch_url      TEXT,
  facebook_url    TEXT,
  thumbnail_url   TEXT,
  is_live         BOOLEAN     NOT NULL DEFAULT false,
  viewer_count    INT         NOT NULL DEFAULT 0,
  tournament_id   TEXT        REFERENCES tournaments(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────
-- 10. TABLE : loot_items  (loot.html, thedarkshift admin)
-- ───────────────────────────────────────────────
DROP TABLE IF EXISTS loot_items CASCADE;
CREATE TABLE loot_items (
  id              BIGSERIAL   PRIMARY KEY,
  name            TEXT        NOT NULL,
  description     TEXT,
  type            TEXT        NOT NULL DEFAULT 'cashprize', -- cashprize / code / pass / drop / skin
  value           TEXT        NOT NULL DEFAULT '0',
  currency        TEXT        NOT NULL DEFAULT 'MGA',
  tournament_id   TEXT        REFERENCES tournaments(id) ON DELETE SET NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  is_claimed      BOOLEAN     NOT NULL DEFAULT false,
  claimed_by      TEXT,
  claim_url       TEXT,
  rank_required   INT         DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────
-- 11. TABLE : tarifs  (tarif for all game.html, thedarkshift admin)
-- ───────────────────────────────────────────────
DROP TABLE IF EXISTS tarifs CASCADE;
CREATE TABLE tarifs (
  id          BIGSERIAL   PRIMARY KEY,
  game_name   TEXT        NOT NULL DEFAULT 'Free Fire',
  mode        TEXT        NOT NULL,              -- SOLO / DUO / SQUAD / CLASH / BR RANKED
  entry_fee   INT         NOT NULL DEFAULT 0,   -- MGA
  prize_pool  TEXT        NOT NULL DEFAULT '0 MGA',
  description TEXT,
  perks       JSONB       DEFAULT '[]',
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────
-- 12. TABLE : support_tickets  (index.html contact / acc.html)
-- ───────────────────────────────────────────────
DROP TABLE IF EXISTS support_tickets CASCADE;
CREATE TABLE support_tickets (
  id          BIGSERIAL   PRIMARY KEY,
  name        TEXT        NOT NULL,
  phone       TEXT        NOT NULL,
  subject     TEXT,
  message     TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'open',  -- open / in_progress / closed
  reply       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────
-- 13. TABLE : site_settings  (thedarkshift admin)
-- ───────────────────────────────────────────────
DROP TABLE IF EXISTS site_settings CASCADE;
CREATE TABLE site_settings (
  key         TEXT        PRIMARY KEY,
  value       TEXT,
  label       TEXT,
  type        TEXT        DEFAULT 'text',  -- text / boolean / number / json
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════
-- FONCTIONS & TRIGGERS : updated_at automatique
-- ═══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers updated_at pour chaque table
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tournaments','registrations','match_scores','leaderboard_cache',
    'players','mobile_money_settings','announcements','streams',
    'loot_items','tarifs','support_tickets','site_settings'
  ]
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I;
      CREATE TRIGGER trg_%s_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    ', t, t, t, t);
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════
-- TRIGGER : filled_slots auto-update
-- ═══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION sync_filled_slots()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'validated' THEN
    UPDATE tournaments SET filled_slots = filled_slots + 1 WHERE id = NEW.tournament_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != 'validated' AND NEW.status = 'validated' THEN
      UPDATE tournaments SET filled_slots = filled_slots + 1 WHERE id = NEW.tournament_id;
    ELSIF OLD.status = 'validated' AND NEW.status != 'validated' THEN
      UPDATE tournaments SET filled_slots = GREATEST(filled_slots - 1, 0) WHERE id = NEW.tournament_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'validated' THEN
    UPDATE tournaments SET filled_slots = GREATEST(filled_slots - 1, 0) WHERE id = OLD.tournament_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_registrations_slots ON registrations;
CREATE TRIGGER trg_registrations_slots
  AFTER INSERT OR UPDATE OR DELETE ON registrations
  FOR EACH ROW EXECUTE FUNCTION sync_filled_slots();

-- ═══════════════════════════════════════════════
-- FONCTION : calculate_leaderboard(tournament_id)
-- Recalcule et met a jour leaderboard_cache
-- ═══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION calculate_leaderboard(p_tournament_id TEXT)
RETURNS void AS $$
BEGIN
  -- Vider le cache du tournoi
  DELETE FROM leaderboard_cache WHERE tournament_id = p_tournament_id;

  -- Recalculer depuis match_scores
  INSERT INTO leaderboard_cache (
    tournament_id, registration_id, team_name,
    total_points, total_kills, booyahs, matches_played, rank_position
  )
  SELECT
    ms.tournament_id,
    ms.registration_id,
    ms.team_name,
    SUM(ms.total_points)                        AS total_points,
    SUM(ms.kills)                               AS total_kills,
    COUNT(*) FILTER (WHERE ms.booyah = true)    AS booyahs,
    COUNT(DISTINCT ms.match_number)             AS matches_played,
    RANK() OVER (ORDER BY SUM(ms.total_points) DESC, SUM(ms.kills) DESC) AS rank_position
  FROM match_scores ms
  WHERE ms.tournament_id = p_tournament_id
  GROUP BY ms.tournament_id, ms.registration_id, ms.team_name;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════
-- INDEXES (performance)
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_registrations_tournament ON registrations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_registrations_status     ON registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_phone      ON registrations(phone);
CREATE INDEX IF NOT EXISTS idx_registrations_created    ON registrations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_scores_tournament  ON match_scores(tournament_id);
CREATE INDEX IF NOT EXISTS idx_match_scores_team        ON match_scores(team_name);

CREATE INDEX IF NOT EXISTS idx_leaderboard_tournament   ON leaderboard_cache(tournament_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_rank         ON leaderboard_cache(tournament_id, rank_position);

CREATE INDEX IF NOT EXISTS idx_tournaments_status       ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_datetime     ON tournaments(datetime DESC);

CREATE INDEX IF NOT EXISTS idx_loot_active              ON loot_items(is_active, is_claimed);
CREATE INDEX IF NOT EXISTS idx_streams_live             ON streams(is_live);
CREATE INDEX IF NOT EXISTS idx_announcements_active     ON announcements(is_active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_tarifs_active            ON tarifs(is_active, sort_order);

-- ═══════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- Donnees publiques pour le site; profils joueurs reserves au proprietaire et aux admins.
-- ═══════════════════════════════════════════════
ALTER TABLE tournaments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_scores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_cache     ENABLE ROW LEVEL SECURITY;
ALTER TABLE players               ENABLE ROW LEVEL SECURITY;
ALTER TABLE banned_uids           ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_money_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE streams               ENABLE ROW LEVEL SECURITY;
ALTER TABLE loot_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarifs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings         ENABLE ROW LEVEL SECURITY;

-- Politique permissive universelle (anon + authenticated)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tournaments','registrations','match_scores','leaderboard_cache',
    'banned_uids','mobile_money_settings','announcements',
    'streams','loot_items','tarifs','support_tickets','site_settings'
  ]
  LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS allow_all ON %I;
      CREATE POLICY allow_all ON %I
        FOR ALL
        TO anon, authenticated
        USING (true)
        WITH CHECK (true);
    ', t, t);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS players_select_own ON players;
CREATE POLICY players_select_own ON players
  FOR SELECT TO authenticated
  USING (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS players_insert_own ON players;
CREATE POLICY players_insert_own ON players
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS players_update_own ON players;
CREATE POLICY players_update_own ON players
  FOR UPDATE TO authenticated
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

GRANT SELECT, INSERT, UPDATE ON players TO authenticated;

-- ═══════════════════════════════════════════════
-- REALTIME : toutes les tables
-- ═══════════════════════════════════════════════
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE
  tournaments,
  registrations,
  match_scores,
  leaderboard_cache,
  players,
  announcements,
  streams,
  loot_items,
  support_tickets;

-- ═══════════════════════════════════════════════
-- DONNEES INITIALES  (seed data)
-- ═══════════════════════════════════════════════

-- Mobile Money (inscription.html)
INSERT INTO mobile_money_settings (key, number, holder_name, operator) VALUES
  ('airtel', '033 38 283 47', 'ANDRE HERINIAINA', 'Airtel Money'),
  ('orange', '032 22 231 28', 'RAHARIVOLOLOMIHANTA FANJA', 'Orange Money')
ON CONFLICT (key) DO UPDATE SET
  number = EXCLUDED.number,
  holder_name = EXCLUDED.holder_name,
  operator = EXCLUDED.operator;

-- Tarifs par defaut (tarif for all game.html)
INSERT INTO tarifs (game_name, mode, entry_fee, prize_pool, description, perks, sort_order) VALUES
  ('Free Fire', 'SOLO',  1000, '10 000 MGA',  'Tournoi Solo classique - 1 joueur',
   '["Top 3 recompenses","Classement en direct","Resultats instantanes"]', 1),
  ('Free Fire', 'DUO',   2000, '20 000 MGA',  'Tournoi Duo - 2 joueurs par equipe',
   '["Top 3 recompenses","Classement en direct","Resultats instantanes"]', 2),
  ('Free Fire', 'SQUAD', 4000, '40 000 MGA',  'Tournoi Squad - 4 joueurs par equipe',
   '["Top 3 recompenses","Classement en direct","Resultats instantanes"]', 3),
  ('Free Fire', 'CLASH SQUAD', 2000, '20 000 MGA', 'Mode 4v4 en arene fermee',
   '["Format elimination","Meilleure equipe gagne","Rapide et intense"]', 4),
  ('Free Fire', 'BR RANKED', 500, '5 000 MGA', 'Partie classee Battle Royale',
   '["Points de rang","Classement global","Recompenses mensuelles"]', 5)
ON CONFLICT DO NOTHING;

-- Annonce de bienvenue (index.html)
INSERT INTO announcements (title, content, type, is_active, priority) VALUES
  ('Bienvenue sur GPMG Free Fire',
   'La plateforme officielle des tournois Free Fire a Madagascar. Inscrivez-vous et participez !',
   'info', true, 10),
  ('Paiement Mobile Money requis',
   'Paiements acceptes : Airtel Money (033 38 283 47 - ANDRE HERINIAINA) et Orange Money (032 22 231 28 - RAHARIVOLOLOMIHANTA FANJA).',
   'info', true, 5)
ON CONFLICT DO NOTHING;

-- Parametres du site (thedarkshift admin)
INSERT INTO site_settings (key, value, label, type) VALUES
  ('site_name',       'GPMG Free Fire',                      'Nom du site',            'text'),
  ('site_subtitle',   'Tournois Free Fire - Madagascar',      'Sous-titre',             'text'),
  ('maintenance',     'false',                                'Mode maintenance',        'boolean'),
  ('max_slots_default','12',                                  'Slots par defaut',        'number'),
  ('kill_point_value','1',                                    'Points par kill',         'number'),
  ('booyah_points',  '10',                                   'Points Booyah',           'number'),
  ('contact_whatsapp','033 38 283 47',                       'WhatsApp contact',        'text'),
  ('facebook_url',   'https://facebook.com/GPMG.mg',         'Page Facebook',           'text'),
  ('discord_url',    '',                                      'Serveur Discord',         'text'),
  ('registration_open','true',                               'Inscriptions ouvertes',   'boolean')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value;

-- ═══════════════════════════════════════════════
-- VERIFICATION FINALE
-- ═══════════════════════════════════════════════
SELECT
  schemaname,
  tablename,
  tableowner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
