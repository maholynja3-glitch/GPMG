-- Migration non destructive pour l'authentification des joueurs par email.
-- Executez ce fichier dans Supabase SQL Editor avant d'utiliser les nouvelles pages.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS full_name TEXT;

ALTER TABLE players
  DROP CONSTRAINT IF EXISTS players_phone_key,
  DROP COLUMN IF EXISTS password_hash;

DROP INDEX IF EXISTS players_auth_user_id_uidx;
CREATE UNIQUE INDEX players_auth_user_id_uidx
  ON players(auth_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS players_email_uidx
  ON players(lower(email))
  WHERE email IS NOT NULL;

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS player_id UUID REFERENCES players(id) ON DELETE SET NULL;

ALTER TABLE players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON players;

DROP POLICY IF EXISTS players_select_own ON players;
CREATE POLICY players_select_own ON players
  FOR SELECT TO authenticated
  USING (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS players_select_admin ON players;

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
