-- =============================================================================
-- 20280125000000_astro_sky_monthly_ephemeris.sql
--
-- GÖKYÜZÜ ATLASI — AYLIK EFEMERİS (Batı tropikal + Vedik sideral): sağlayıcı önbelleği + kayıtlı efemerisler.
-- TASLAK (Owner talimatı 2026-11-24): yalnız YEREL izole sentetik PostgreSQL testinde çalıştırıldı — production / staging'e
-- uygulanması AYRI Owner onayı ister.
--
-- Neden yeni tablo: astro_analyses ve astro_provider_results doğum profili (profile_id / profile_revision NOT NULL + FK) taşır;
-- aylık efemeris kişiye bağlı değildir (yalnız yıl + ay). Horary (20271210000000) ile aynı gerekçe ve desen.
--
-- 1) astro_sky_monthly_cache — TENANT'SIZ deterministik önbellek. İçerik kişisel veri DEĞİLDİR (yalnız gök cisimlerinin konumları).
--    Anahtar = SHA-256(uç + gövde + izdüşüm sürümü + sağlayıcı API sürümü) → aynı ay için sağlayıcıya ikinci kez istek gitmez.
--    raw_response YALNIZ SUNUCU (API yanıtına / loga / istemciye çıkmaz). service_role: SELECT, INSERT (güncelleme/silme YOK).
--    Yedeğe / dışa aktarıma girmez (lib/backup/registry.ts "derived", tenant kapsamı yok).
-- 2) astro_sky_monthly_ephemeris — uzmanın kaydettiği aylık efemeris (DEĞİŞMEZ anlık görüntü; yalnız başlık değişebilir).
--    service_role: SELECT, INSERT, yalnız (title, updated_at) UPDATE. DELETE YETKİSİ YOK (silme API'si yok).
--    service_role RLS'yi aşar → sahiplik her sorguda servis katmanında (tenant_id + owner_user_id) ayrıca uygulanır.
--    Tür ↔ zodyak ↔ ayanamsa tutarlılığı CHECK ile zorlanır (tropikal ve sideral karışamaz). Kayıt tavanı: mevcut atomik
--    public.astro_enforce_record_cap (uzman başına advisory kilit) — 3000. İdempotency: UNIQUE (tenant_id, save_request_id).
--
-- RLS açık, politika YOK; PUBLIC / anon / authenticated için hiçbir yetki yok. Mevcut tablo / politika / veri DEĞİŞMEZ.
-- IDEMPOTENT (iki kez çalıştırılabilir). Geri dönüş: iki tablo başka hiçbir tabloca referans edilmez; veri oluştuktan sonra kaldırma
-- ancak YEDEK + Owner kararıyla yapılır (otomatik DROP yok).
-- =============================================================================

BEGIN;

-- ─── 1) Sağlayıcı önbelleği (tenant'sız) ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.astro_sky_monthly_cache (
  cache_key            text        PRIMARY KEY,
  kind                 text        NOT NULL,
  year                 smallint    NOT NULL,
  month                smallint    NOT NULL,
  provider             text        NOT NULL,
  provider_api_version text        NOT NULL,
  adapter_version      text        NOT NULL,
  endpoint             text        NOT NULL,
  request              jsonb       NOT NULL,
  -- YALNIZ SUNUCU. API yanıtına, loga, istemciye ASLA çıkmaz.
  raw_response         jsonb       NOT NULL,
  technical            jsonb       NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT astro_smc_key_chk CHECK (cache_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT astro_smc_kind_chk CHECK (kind IN ('western', 'vedic')),
  CONSTRAINT astro_smc_period_chk CHECK (year BETWEEN 1600 AND 2600 AND month BETWEEN 1 AND 12),
  CONSTRAINT astro_smc_provider_chk CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  CONSTRAINT astro_smc_versions_chk CHECK (char_length(provider_api_version) BETWEEN 1 AND 64 AND char_length(adapter_version) BETWEEN 1 AND 64),
  CONSTRAINT astro_smc_endpoint_chk CHECK (char_length(endpoint) BETWEEN 1 AND 200),
  CONSTRAINT astro_smc_json_chk CHECK (
    jsonb_typeof(request) = 'object' AND jsonb_typeof(raw_response) = 'object' AND jsonb_typeof(technical) = 'object'
    AND pg_column_size(request) <= 4096 AND pg_column_size(raw_response) <= 2097152 AND pg_column_size(technical) <= 1048576
  )
);
CREATE INDEX IF NOT EXISTS astro_smc_period_idx ON public.astro_sky_monthly_cache (kind, year, month);

ALTER TABLE public.astro_sky_monthly_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.astro_sky_monthly_cache FROM PUBLIC;
REVOKE ALL ON TABLE public.astro_sky_monthly_cache FROM anon;
REVOKE ALL ON TABLE public.astro_sky_monthly_cache FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.astro_sky_monthly_cache FROM service_role;
GRANT SELECT, INSERT ON TABLE public.astro_sky_monthly_cache TO service_role;

-- ─── 2) Kayıtlı aylık efemeris ────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.astro_sky_monthly_ephemeris (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL,
  owner_user_id        uuid        NOT NULL,
  title                text        NOT NULL,
  kind                 text        NOT NULL,
  year                 smallint    NOT NULL,
  month                smallint    NOT NULL,
  zodiac               text        NOT NULL,
  ayanamsa             text        NULL,
  time_reference       text        NOT NULL DEFAULT '12:00 UTC',
  source_endpoint      text        NOT NULL,
  adapter_version      text        NOT NULL,
  provider_api_version text        NOT NULL,
  methodology_version  text        NOT NULL,
  snapshot_schema      smallint    NOT NULL,
  result_snapshot      jsonb       NOT NULL,
  save_request_id      uuid        NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT astro_sme_title_chk CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT astro_sme_kind_chk CHECK (kind IN ('western', 'vedic')),
  CONSTRAINT astro_sme_period_chk CHECK (year BETWEEN 1600 AND 2600 AND month BETWEEN 1 AND 12),
  -- Tropikal ve sideral KARIŞAMAZ: Batı = tropikal + ayanamsa yok; Vedik = sideral + Lahiri.
  CONSTRAINT astro_sme_zodiac_chk CHECK (
    (kind = 'western' AND zodiac = 'tropical' AND ayanamsa IS NULL)
    OR (kind = 'vedic' AND zodiac = 'sidereal' AND ayanamsa = 'lahiri')
  ),
  CONSTRAINT astro_sme_time_chk CHECK (time_reference = '12:00 UTC'),
  CONSTRAINT astro_sme_versions_chk CHECK (
    char_length(source_endpoint) BETWEEN 1 AND 200 AND char_length(adapter_version) BETWEEN 1 AND 64
    AND char_length(provider_api_version) BETWEEN 1 AND 64 AND char_length(methodology_version) BETWEEN 1 AND 120
  ),
  CONSTRAINT astro_sme_schema_chk CHECK (snapshot_schema >= 1),
  CONSTRAINT astro_sme_snapshot_chk CHECK (jsonb_typeof(result_snapshot) = 'object' AND pg_column_size(result_snapshot) <= 1048576),
  CONSTRAINT astro_sme_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT astro_sme_save_request_uq UNIQUE (tenant_id, save_request_id)
);
CREATE INDEX IF NOT EXISTS astro_sme_owner_time_idx ON public.astro_sky_monthly_ephemeris (tenant_id, owner_user_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS astro_sme_owner_period_idx ON public.astro_sky_monthly_ephemeris (tenant_id, owner_user_id, year, month);

-- Değişmezlik: yalnız başlık ve güncelleme zamanı değişebilir.
CREATE OR REPLACE FUNCTION public.astro_sky_monthly_ephemeris_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'title' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'title' - 'updated_at') THEN
    RAISE EXCEPTION 'ASTRO_SKY_EPHEMERIS_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.astro_sky_monthly_ephemeris_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_astro_sky_monthly_ephemeris_guard ON public.astro_sky_monthly_ephemeris;
CREATE TRIGGER trg_astro_sky_monthly_ephemeris_guard BEFORE UPDATE ON public.astro_sky_monthly_ephemeris
  FOR EACH ROW EXECUTE FUNCTION public.astro_sky_monthly_ephemeris_guard();

-- Kayıt tavanı (mevcut atomik fonksiyon; uzman başına 3000).
DROP TRIGGER IF EXISTS trg_astro_cap_sky_monthly ON public.astro_sky_monthly_ephemeris;
CREATE TRIGGER trg_astro_cap_sky_monthly BEFORE INSERT ON public.astro_sky_monthly_ephemeris
  FOR EACH ROW EXECUTE FUNCTION public.astro_enforce_record_cap('3000');

ALTER TABLE public.astro_sky_monthly_ephemeris ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.astro_sky_monthly_ephemeris FROM PUBLIC;
REVOKE ALL ON TABLE public.astro_sky_monthly_ephemeris FROM anon;
REVOKE ALL ON TABLE public.astro_sky_monthly_ephemeris FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.astro_sky_monthly_ephemeris FROM service_role;
GRANT SELECT, INSERT ON TABLE public.astro_sky_monthly_ephemeris TO service_role;
GRANT UPDATE (title, updated_at) ON TABLE public.astro_sky_monthly_ephemeris TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
