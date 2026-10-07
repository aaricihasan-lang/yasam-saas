-- =============================================================================
-- 20271101000000_astrology_foundation.sql   [ADDITIVE — 4 NEW TABLES + 2 FUNCTIONS]
--
-- ASTROLOJİ — AŞAMA 1 TEMEL VERİ MODELİ (SATIŞ SONRASI, OWNER-ONLY PİLOT).
--
-- TABLOLAR (katman ayrımı — Aşama 0-B kararı):
--   astro_birth_profiles           → mantıksal doğum profili (danışan bağı opsiyonel, etiket,
--                                    güncel revizyon numarası). Doğum verisi BURADA DEĞİL.
--   astro_birth_profile_revisions  → doğum verisinin DEĞİŞMEZ revizyonları. Düzeltme = yeni satır;
--                                    eski revizyon asla güncellenmez/silinmez (service_role'e
--                                    UPDATE/DELETE yetkisi YOK). Gelecekteki kayıtlı analizler
--                                    (Aşama 2) belirli bir revizyona bağlanır → doğum bilgisi
--                                    düzeltilse de eski analiz bozulmaz.
--   astro_provider_results         → A katmanı: sağlayıcı HAM yanıtı (raw_response, yalnız sunucu)
--                                    + beyaz liste TEKNİK projeksiyon. Deterministik önbellek:
--                                    UNIQUE (tenant_id, input_hash). Yalnız INSERT/SELECT.
--   astro_provider_interpretations → B katmanı: sağlayıcının OTOMATİK YORUM projeksiyonu. Teknikten
--                                    AYRI tablo; ayrı yetkiyle (astrology_provider_interp) servis
--                                    edilir. Yetki kapanırsa satır SİLİNMEZ, yalnız servis edilmez.
--
-- PROVIDER BAĞIMSIZLIĞI: profil ve revizyon tabloları sağlayıcı bilmez. Sağlayıcıya özgü her şey
--   (provider, api/adapter sürümü, endpoint, ham yanıt) yalnız A/B katmanındadır.
--
-- GÜVENLİK MODELİ (born-locked; client_anamnesis / hd_consultation deseni):
--   * RLS AÇIK, policy YOK → anon/authenticated için hiçbir satır görünmez.
--   * REVOKE ALL FROM PUBLIC, anon, authenticated, service_role → service_role'e AÇIK allowlist:
--       profiles: SELECT/INSERT/UPDATE · revisions/results/interpretations: SELECT/INSERT.
--   * tenant_id / *_user_id İSTEMCİDEN GELMEZ: API owner kapısından (requireAstrologyOwner) yazar.
--   * Composite FK'ler çapraz-tenant eşleşmeyi DB seviyesinde reddeder.
--
-- SİLME: clients satırı silinince profil → revizyon → sonuç → yorum zinciri CASCADE silinir
--   (KVKK silme hakkı; ham yanıt doğum verisi içerdiğinden danışanla birlikte gider).
--
-- PRECONDITION: public.clients (tenant_id, id) — clients_tenant_id_id_key prod'da VAR
--   (20260923000000); yoksa aynı adla idempotent eklenir (client_anamnesis deseni).
--
-- VERİ-YIKICI MI: HAYIR (yalnız yeni tablo/fonksiyon; mevcut veri değişmez).
-- İDEMPOTENT: EVET (IF NOT EXISTS / CREATE OR REPLACE / koşullu constraint).
-- ⚠️ PRODUCTION'A UYGULANMADI — Astroloji satış sonrası hattıdır (work/astrology-roxy).
--   Kod tablo yoksa owner'a 503 ASTRO_NOT_READY döner; kill-switch (ASTROLOGY_MODULE_ENABLED)
--   kapalıyken modül herkese 404'tür.
--
-- ROLLBACK (veri kaybı: TÜM astroloji profilleri/sonuçları silinir — yalnız bilinçli karar ile):
--   DROP FUNCTION IF EXISTS public.astro_profile_append_revision(uuid, uuid, uuid, integer, date, time, boolean, text, text, text, double precision, double precision, text, text, integer, timestamptz, text);
--   DROP FUNCTION IF EXISTS public.astro_profile_create(uuid, uuid, uuid, text, date, time, boolean, text, text, text, double precision, double precision, text, text, integer, timestamptz);
--   DROP TABLE IF EXISTS public.astro_provider_interpretations;
--   DROP TABLE IF EXISTS public.astro_provider_results;
--   DROP TABLE IF EXISTS public.astro_birth_profile_revisions;
--   DROP TABLE IF EXISTS public.astro_birth_profiles;
-- =============================================================================

BEGIN;

-- ─── 0) Precondition ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'astro_birth_profiles: public.clients bulunamadı (precondition)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.clients'::regclass
      AND contype IN ('u', 'p')
      AND conname = 'clients_tenant_id_id_key'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_tenant_id_id_key UNIQUE (tenant_id, id);
  END IF;
END
$$;

-- ─── 1) astro_birth_profiles ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.astro_birth_profiles (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL,
  client_id           uuid,
  label               text        NOT NULL,
  current_revision    integer     NOT NULL DEFAULT 1,
  created_by_user_id  uuid        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT astro_bp_label_chk CHECK (char_length(btrim(label)) BETWEEN 1 AND 120),
  CONSTRAINT astro_bp_current_revision_chk CHECK (current_revision >= 1),
  CONSTRAINT astro_bp_tenant_id_key UNIQUE (tenant_id, id),
  -- client_id NULL → bağımsız profil (FK MATCH SIMPLE: NULL ise kontrol edilmez).
  CONSTRAINT astro_bp_client_fk FOREIGN KEY (tenant_id, client_id)
    REFERENCES public.clients (tenant_id, id) ON DELETE CASCADE
);

COMMENT ON TABLE public.astro_birth_profiles IS
  'Astroloji doğum profili (mantıksal). Doğum verisi astro_birth_profile_revisions''tadır. Yalnız service_role (owner API).';

CREATE INDEX IF NOT EXISTS astro_bp_tenant_client_idx
  ON public.astro_birth_profiles (tenant_id, client_id);
CREATE INDEX IF NOT EXISTS astro_bp_tenant_created_idx
  ON public.astro_birth_profiles (tenant_id, created_at DESC);

-- ─── 2) astro_birth_profile_revisions (DEĞİŞMEZ) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.astro_birth_profile_revisions (
  id                  uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid             NOT NULL,
  profile_id          uuid             NOT NULL,
  revision            integer          NOT NULL,
  birth_date          date             NOT NULL,
  -- Saat bilinmiyorsa NULL (time_known=false). Hesaplamada sağlayıcıya 12:00 gider; görünümde
  -- ev/yükselen/MC gizlenir (saat bağımlı değerler).
  birth_time          time without time zone,
  time_known          boolean          NOT NULL,
  time_accuracy       text             NOT NULL,
  location_id         text,
  location_label      text             NOT NULL,
  latitude            double precision NOT NULL,
  longitude           double precision NOT NULL,
  timezone            text             NOT NULL,
  -- DST belirsizliğinde açık seçim: auto (belirsizse reddet) | earlier | later.
  dst_choice          text             NOT NULL DEFAULT 'auto',
  utc_offset_seconds  integer          NOT NULL,
  birth_utc           timestamptz      NOT NULL,
  change_note         text,
  created_by_user_id  uuid             NOT NULL,
  created_at          timestamptz      NOT NULL DEFAULT now(),

  CONSTRAINT astro_bpr_revision_chk CHECK (revision >= 1),
  CONSTRAINT astro_bpr_time_known_chk CHECK (time_known = (birth_time IS NOT NULL)),
  CONSTRAINT astro_bpr_accuracy_chk CHECK (
    time_accuracy IN ('exact_record', 'family_memory', 'approximate', 'rectified', 'unknown')
  ),
  CONSTRAINT astro_bpr_unknown_accuracy_chk CHECK (time_known OR time_accuracy = 'unknown'),
  CONSTRAINT astro_bpr_dst_choice_chk CHECK (dst_choice IN ('auto', 'earlier', 'later')),
  CONSTRAINT astro_bpr_lat_chk CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT astro_bpr_lon_chk CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT astro_bpr_offset_chk CHECK (utc_offset_seconds BETWEEN -64800 AND 64800),
  CONSTRAINT astro_bpr_label_chk CHECK (char_length(btrim(location_label)) BETWEEN 1 AND 200),
  CONSTRAINT astro_bpr_tz_chk CHECK (char_length(timezone) BETWEEN 1 AND 64),
  CONSTRAINT astro_bpr_location_id_chk CHECK (location_id IS NULL OR char_length(location_id) BETWEEN 1 AND 128),
  CONSTRAINT astro_bpr_note_chk CHECK (change_note IS NULL OR char_length(change_note) <= 500),
  CONSTRAINT astro_bpr_profile_revision_key UNIQUE (tenant_id, profile_id, revision),
  CONSTRAINT astro_bpr_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT astro_bpr_profile_fk FOREIGN KEY (tenant_id, profile_id)
    REFERENCES public.astro_birth_profiles (tenant_id, id) ON DELETE CASCADE
);

COMMENT ON TABLE public.astro_birth_profile_revisions IS
  'Doğum verisi revizyonları — DEĞİŞMEZ (service_role yalnız SELECT/INSERT). Düzeltme yeni revizyondur.';

-- ─── 3) astro_provider_results (A katmanı: ham + teknik) ─────────────────────
CREATE TABLE IF NOT EXISTS public.astro_provider_results (
  id                    uuid        PRIMARY KEY,
  tenant_id             uuid        NOT NULL,
  -- Sonucu İLK üreten profil revizyonu (provenance + KVKK cascade). Aynı girdiye sahip başka bir
  -- profil de bu satırı yeniden kullanabilir (önbellek anahtarı profil değil, normalize girdidir).
  profile_id            uuid        NOT NULL,
  profile_revision      integer     NOT NULL,
  technique             text        NOT NULL,
  provider              text        NOT NULL,
  provider_api_version  text        NOT NULL,
  adapter_version       text        NOT NULL,
  endpoint              text        NOT NULL,
  input                 jsonb       NOT NULL,
  input_hash            text        NOT NULL,
  -- YALNIZ SUNUCU. API yanıtına, loga, istemciye ASLA çıkmaz.
  raw_response          jsonb       NOT NULL,
  technical             jsonb       NOT NULL,
  technical_schema      text        NOT NULL,
  projection_version    text        NOT NULL,
  unmapped_fields       text[]      NOT NULL DEFAULT '{}'::text[],
  created_by_user_id    uuid        NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT astro_pr_provider_chk CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  CONSTRAINT astro_pr_technique_chk CHECK (technique ~ '^[a-z][a-z0-9_.]{2,63}$'),
  CONSTRAINT astro_pr_endpoint_chk CHECK (char_length(endpoint) BETWEEN 1 AND 200),
  CONSTRAINT astro_pr_hash_chk CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT astro_pr_json_shape_chk CHECK (
    jsonb_typeof(input) = 'object'
    AND jsonb_typeof(raw_response) = 'object'
    AND jsonb_typeof(technical) = 'object'
  ),
  CONSTRAINT astro_pr_json_size_chk CHECK (
    pg_column_size(raw_response) <= 2097152
    AND pg_column_size(technical) <= 1048576
    AND pg_column_size(input) <= 16384
  ),
  CONSTRAINT astro_pr_unmapped_chk CHECK (cardinality(unmapped_fields) <= 200),
  CONSTRAINT astro_pr_tenant_hash_key UNIQUE (tenant_id, input_hash),
  CONSTRAINT astro_pr_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT astro_pr_revision_fk FOREIGN KEY (tenant_id, profile_id, profile_revision)
    REFERENCES public.astro_birth_profile_revisions (tenant_id, profile_id, revision) ON DELETE CASCADE
);

COMMENT ON TABLE public.astro_provider_results IS
  'Sağlayıcı hesap sonucu: raw_response (yalnız sunucu) + beyaz liste teknik projeksiyon. Deterministik önbellek (tenant_id, input_hash).';

CREATE INDEX IF NOT EXISTS astro_pr_tenant_profile_idx
  ON public.astro_provider_results (tenant_id, profile_id, created_at DESC);

-- ─── 4) astro_provider_interpretations (B katmanı: otomatik yorum) ───────────
CREATE TABLE IF NOT EXISTS public.astro_provider_interpretations (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL,
  result_id           uuid        NOT NULL,
  provider            text        NOT NULL,
  lang                text        NOT NULL,
  content_schema      text        NOT NULL,
  projection_version  text        NOT NULL,
  content             jsonb       NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT astro_pi_provider_chk CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  CONSTRAINT astro_pi_lang_chk CHECK (lang ~ '^[a-z]{2}(-[A-Za-z]{2,4})?$'),
  CONSTRAINT astro_pi_content_chk CHECK (jsonb_typeof(content) = 'object' AND pg_column_size(content) <= 1048576),
  CONSTRAINT astro_pi_result_version_key UNIQUE (tenant_id, result_id, projection_version),
  CONSTRAINT astro_pi_result_fk FOREIGN KEY (tenant_id, result_id)
    REFERENCES public.astro_provider_results (tenant_id, id) ON DELETE CASCADE
);

COMMENT ON TABLE public.astro_provider_interpretations IS
  'Sağlayıcı OTOMATİK YORUMU — teknikten ayrı katman; yalnız astrology_provider_interp yetkisiyle servis edilir.';

-- ─── 5) updated_at (yalnız profiles) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.astro_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_astro_bp_updated_at ON public.astro_birth_profiles;
CREATE TRIGGER trg_astro_bp_updated_at BEFORE UPDATE ON public.astro_birth_profiles
  FOR EACH ROW EXECUTE FUNCTION public.astro_touch_updated_at();

-- ─── 6) Atomik profil oluşturma + revizyon ekleme (SECURITY INVOKER) ─────────
-- service_role çağırır (tablo yetkileri yukarıdaki allowlist'tir). Profil + revizyon TEK
-- işlemde yazılır (yarım profil oluşmaz); revizyon ekleme iyimser kilitle (expected) yarışa
-- dayanıklıdır.
CREATE OR REPLACE FUNCTION public.astro_profile_create(
  p_tenant_id uuid,
  p_user_id uuid,
  p_client_id uuid,
  p_label text,
  p_birth_date date,
  p_birth_time time,
  p_time_known boolean,
  p_time_accuracy text,
  p_location_id text,
  p_location_label text,
  p_latitude double precision,
  p_longitude double precision,
  p_timezone text,
  p_dst_choice text,
  p_utc_offset_seconds integer,
  p_birth_utc timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'ASTRO_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.astro_birth_profiles (tenant_id, client_id, label, current_revision, created_by_user_id)
  VALUES (p_tenant_id, p_client_id, btrim(p_label), 1, p_user_id)
  RETURNING id INTO v_profile_id;

  INSERT INTO public.astro_birth_profile_revisions (
    tenant_id, profile_id, revision, birth_date, birth_time, time_known, time_accuracy,
    location_id, location_label, latitude, longitude, timezone, dst_choice,
    utc_offset_seconds, birth_utc, created_by_user_id
  ) VALUES (
    p_tenant_id, v_profile_id, 1, p_birth_date, p_birth_time, p_time_known, p_time_accuracy,
    p_location_id, p_location_label, p_latitude, p_longitude, p_timezone, p_dst_choice,
    p_utc_offset_seconds, p_birth_utc, p_user_id
  );

  RETURN jsonb_build_object('profile_id', v_profile_id, 'revision', 1);
END
$fn$;

CREATE OR REPLACE FUNCTION public.astro_profile_append_revision(
  p_tenant_id uuid,
  p_user_id uuid,
  p_profile_id uuid,
  p_expected_revision integer,
  p_birth_date date,
  p_birth_time time,
  p_time_known boolean,
  p_time_accuracy text,
  p_location_id text,
  p_location_label text,
  p_latitude double precision,
  p_longitude double precision,
  p_timezone text,
  p_dst_choice text,
  p_utc_offset_seconds integer,
  p_birth_utc timestamptz,
  p_change_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_current integer;
  v_next integer;
BEGIN
  SELECT current_revision INTO v_current
  FROM public.astro_birth_profiles
  WHERE tenant_id = p_tenant_id AND id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASTRO_PROFILE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_current THEN
    RAISE EXCEPTION 'ASTRO_REVISION_CONFLICT' USING ERRCODE = '40001';
  END IF;

  v_next := v_current + 1;

  INSERT INTO public.astro_birth_profile_revisions (
    tenant_id, profile_id, revision, birth_date, birth_time, time_known, time_accuracy,
    location_id, location_label, latitude, longitude, timezone, dst_choice,
    utc_offset_seconds, birth_utc, change_note, created_by_user_id
  ) VALUES (
    p_tenant_id, p_profile_id, v_next, p_birth_date, p_birth_time, p_time_known, p_time_accuracy,
    p_location_id, p_location_label, p_latitude, p_longitude, p_timezone, p_dst_choice,
    p_utc_offset_seconds, p_birth_utc, NULLIF(btrim(COALESCE(p_change_note, '')), ''), p_user_id
  );

  UPDATE public.astro_birth_profiles
  SET current_revision = v_next
  WHERE tenant_id = p_tenant_id AND id = p_profile_id;

  RETURN jsonb_build_object('profile_id', p_profile_id, 'revision', v_next);
END
$fn$;

-- ─── 7) BORN-LOCKED: RLS + açık allowlist GRANT ──────────────────────────────
DO $lock$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'astro_birth_profiles', 'astro_birth_profile_revisions',
    'astro_provider_results', 'astro_provider_interpretations'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC;', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon;', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated;', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM service_role;', t);
  END LOOP;
END
$lock$;

GRANT SELECT, INSERT, UPDATE ON TABLE public.astro_birth_profiles TO service_role;
GRANT SELECT, INSERT ON TABLE public.astro_birth_profile_revisions TO service_role;
GRANT SELECT, INSERT ON TABLE public.astro_provider_results TO service_role;
GRANT SELECT, INSERT ON TABLE public.astro_provider_interpretations TO service_role;

REVOKE ALL ON FUNCTION public.astro_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.astro_profile_create(uuid, uuid, uuid, text, date, time, boolean, text, text, text, double precision, double precision, text, text, integer, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.astro_profile_append_revision(uuid, uuid, uuid, integer, date, time, boolean, text, text, text, double precision, double precision, text, text, integer, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.astro_profile_create(uuid, uuid, uuid, text, date, time, boolean, text, text, text, double precision, double precision, text, text, integer, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.astro_profile_append_revision(uuid, uuid, uuid, integer, date, time, boolean, text, text, text, double precision, double precision, text, text, integer, timestamptz, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
