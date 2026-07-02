-- =============================================================================
-- 20260702000000_user_location_prefs.sql
-- FAZ 5 / P4a — Kullanıcı varsayılan konumu (per-user, kilitli RLS)
--
-- Kullanıcı başına TEK varsayılan konum (unique user_id). Yalnız service_role
-- (API route'ları) erişebilir; anon/authenticated doğrudan erişemez. users
-- tablosuna DOKUNULMAZ; ayrı, izole tablodur.
-- =============================================================================

-- Ortak updated_at fonksiyonu: mevcutsa DOKUNMA, yoksa güvenli şekilde ekle.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
  ) THEN
    CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_location_prefs (
  id            uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id     uuid              NOT NULL,
  location_id   text              NOT NULL,
  name          text              NOT NULL,
  country_code  text              NOT NULL,
  lat           double precision  NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon           double precision  NOT NULL CHECK (lon BETWEEN -180 AND 180),
  elev          double precision  DEFAULT 0,
  tz            text              NOT NULL,
  source        text,
  created_at    timestamptz       NOT NULL DEFAULT now(),
  updated_at    timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT user_location_prefs_user_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_location_prefs_user_id
  ON user_location_prefs(user_id);

-- updated_at trigger — ortak public.set_updated_at() kullanılır
DROP TRIGGER IF EXISTS trg_user_location_prefs_updated_at ON user_location_prefs;
CREATE TRIGGER trg_user_location_prefs_updated_at
  BEFORE UPDATE ON user_location_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: yalnızca service_role erişir; anon/authenticated deny-all (support_messages deseni)
ALTER TABLE user_location_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_location_prefs_deny_direct" ON user_location_prefs;
CREATE POLICY "user_location_prefs_deny_direct"
  ON user_location_prefs
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
