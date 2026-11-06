-- =============================================================================
-- 20271227000000_expert_workspace_designs_prefs.sql
--
-- KİŞİSEL DİJİTAL OFİS — P1 güvenli veri altyapısı (Owner talimatı 2026-11-01; yalnız YEREL geçici veritabanında
-- çalıştırıldı — production / staging'e uygulanması AYRI Owner onayı ister).
--
-- İki AYRI tablo (Owner kararı 3: modül tercihleri tasarım taslağından bağımsızdır):
--   * expert_workspace_designs : uygulanan tasarım + taslak + en fazla 10 önceki tasarım (uzman başına TEK satır).
--   * expert_ui_prefs          : gizlenen modüller, sıralı Favorilerim (en fazla 8), kart görünümü, görünüm modu, okuma ayarı.
-- Satır yoksa uzman mevcut ana sayfayı AYNEN görür (Owner kararı 2). Modül YETKİLERİ bu tablolarda tutulmaz ve değişmez.
--
-- GÜVENLİK (mevcut astro_* / ayar tablosu deseni):
--   * RLS açık, politika YOK; PUBLIC / anon / authenticated için hiçbir yetki yok.
--   * service_role: SELECT, INSERT ve yalnız içerik kolonlarında UPDATE. DELETE / TRUNCATE YETKİSİ YOK (silme API'si yok).
--     service_role RLS'yi aşar → sahiplik her sorguda servis katmanında (tenant_id + user_id) ayrıca uygulanır.
--   * Kimlik kolonları (id, tenant_id, user_id, created_at) için UPDATE yetkisi verilmez; tetikleyici rol fark etmeksizin
--     değişmelerini de reddeder.
--   * Eşzamanlı düzenleme: version her UPDATE'te TAM OLARAK 1 artmalıdır (tetikleyici) → servis "WHERE version = beklenen"
--     ile yazar; eşleşme yoksa API 409 döner.
--   * Görsel dosya yolu / URL kolonu YOK. Tasarım JSON'u sunucu şema doğrulamasından geçer (lib/workspace/schema.ts).
--
-- VERİ KORUMA: Mevcut tablo / politika / veri DEĞİŞMEZ. IDEMPOTENT (iki kez çalıştırılabilir). Geri alma = özellik bayrağı
-- (EXPERT_WORKSPACE_DESIGN_ENABLED) kapatma + kod geri alma. DROP / TRUNCATE / veri silen geri alma migration'ı YOKTUR.
-- Hesap kalıcı silmede tablolar tenant_id (uuid) ile admin_purge_archived_expert keşfine girer.
-- =============================================================================

BEGIN;

-- ── 1) Tasarımlar ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expert_workspace_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  applied jsonb NULL,
  draft jsonb NULL,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  schema_version smallint NOT NULL DEFAULT 1,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expert_wd_user_uq UNIQUE (tenant_id, user_id),
  CONSTRAINT expert_wd_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT expert_wd_applied_chk CHECK (applied IS NULL OR (jsonb_typeof(applied) = 'object' AND octet_length(applied::text) <= 32768)),
  CONSTRAINT expert_wd_draft_chk CHECK (draft IS NULL OR (jsonb_typeof(draft) = 'object' AND octet_length(draft::text) <= 32768)),
  CONSTRAINT expert_wd_history_chk CHECK (jsonb_typeof(history) = 'array' AND jsonb_array_length(history) <= 10 AND octet_length(history::text) <= 360000),
  CONSTRAINT expert_wd_schema_chk CHECK (schema_version BETWEEN 1 AND 100),
  CONSTRAINT expert_wd_version_chk CHECK (version >= 1)
);

-- ── 2) Arayüz tercihleri ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expert_ui_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  hidden_modules text[] NOT NULL DEFAULT '{}'::text[],
  favorites text[] NOT NULL DEFAULT '{}'::text[],
  card_level text NOT NULL DEFAULT 'center',
  view_mode text NOT NULL DEFAULT 'auto',
  reading jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version smallint NOT NULL DEFAULT 1,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expert_up_user_uq UNIQUE (tenant_id, user_id),
  CONSTRAINT expert_up_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT expert_up_hidden_chk CHECK (cardinality(hidden_modules) <= 64 AND array_position(hidden_modules, NULL) IS NULL),
  CONSTRAINT expert_up_favorites_chk CHECK (cardinality(favorites) <= 8 AND array_position(favorites, NULL) IS NULL),
  CONSTRAINT expert_up_card_level_chk CHECK (card_level IN ('center', 'module')),
  CONSTRAINT expert_up_view_mode_chk CHECK (view_mode IN ('auto', 'day', 'night', 'reading', 'focus')),
  CONSTRAINT expert_up_reading_chk CHECK (jsonb_typeof(reading) = 'object' AND octet_length(reading::text) <= 1024),
  CONSTRAINT expert_up_schema_chk CHECK (schema_version BETWEEN 1 AND 100),
  CONSTRAINT expert_up_version_chk CHECK (version >= 1)
);

-- ── 3) Kimlik değişmezliği + sürüm artışı (rol fark etmeksizin) ───────────────
CREATE OR REPLACE FUNCTION public.expert_workspace_row_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'EXPERT_WORKSPACE_IDENTITY_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'EXPERT_WORKSPACE_VERSION_STEP' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.expert_workspace_row_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expert_workspace_row_guard() FROM anon;
REVOKE ALL ON FUNCTION public.expert_workspace_row_guard() FROM authenticated;

DROP TRIGGER IF EXISTS expert_wd_row_guard ON public.expert_workspace_designs;
CREATE TRIGGER expert_wd_row_guard
  BEFORE UPDATE ON public.expert_workspace_designs
  FOR EACH ROW EXECUTE FUNCTION public.expert_workspace_row_guard();

DROP TRIGGER IF EXISTS expert_up_row_guard ON public.expert_ui_prefs;
CREATE TRIGGER expert_up_row_guard
  BEFORE UPDATE ON public.expert_ui_prefs
  FOR EACH ROW EXECUTE FUNCTION public.expert_workspace_row_guard();

-- ── 4) RLS + yetkiler ────────────────────────────────────────────────────────
ALTER TABLE public.expert_workspace_designs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.expert_workspace_designs FROM PUBLIC;
REVOKE ALL ON TABLE public.expert_workspace_designs FROM anon;
REVOKE ALL ON TABLE public.expert_workspace_designs FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.expert_workspace_designs FROM service_role;
GRANT SELECT, INSERT ON TABLE public.expert_workspace_designs TO service_role;
GRANT UPDATE (applied, draft, history, schema_version, version, updated_at) ON TABLE public.expert_workspace_designs TO service_role;

ALTER TABLE public.expert_ui_prefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.expert_ui_prefs FROM PUBLIC;
REVOKE ALL ON TABLE public.expert_ui_prefs FROM anon;
REVOKE ALL ON TABLE public.expert_ui_prefs FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.expert_ui_prefs FROM service_role;
GRANT SELECT, INSERT ON TABLE public.expert_ui_prefs TO service_role;
GRANT UPDATE (hidden_modules, favorites, card_level, view_mode, reading, schema_version, version, updated_at) ON TABLE public.expert_ui_prefs TO service_role;

COMMENT ON TABLE public.expert_workspace_designs IS 'Kişisel Dijital Ofis: uzmanın uygulanan tasarımı, taslağı ve en fazla 10 önceki tasarımı. Yetki bilgisi içermez.';
COMMENT ON TABLE public.expert_ui_prefs IS 'Kişisel Dijital Ofis: gizlenen modüller, Favorilerim (≤8), kart/görünüm/okuma tercihleri. Modül yetkisini DEĞİŞTİRMEZ.';

COMMIT;

NOTIFY pgrst, 'reload schema';
