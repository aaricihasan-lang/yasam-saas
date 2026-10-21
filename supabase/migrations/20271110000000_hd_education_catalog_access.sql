-- =============================================================================
-- 20271110000000_hd_education_catalog_access.sql
--
-- HUMAN DESIGN — HAZIR EĞİTİM HARİTALARI (FAZ 2-B1) · ADDITIVE · YALNIZ YENİ TABLOLAR
--
-- AMAÇ: Platforma ait, tenant'sız, salt-okunur bir eğitim kataloğu + yalnız PLATFORM OWNER'ın
--   kişi bazında verdiği eğitmen erişimi. Mevcut tablolara (users, human_design_*, admin_audit_log,
--   module_permissions …) DOKUNULMAZ; mevcut auth / tenant / RLS kuralları DEĞİŞMEZ.
--
-- TABLOLAR (7):
--   hd_education_subjects          — kişi + kanıt (sürümlü; varsayılan taslak)
--   hd_education_sources           — kaynaklar (append-only; kanıt revizyonuna bağlı)
--   hd_education_charts            — hesap snapshot'ları (append-only; sürümlü) — B1'de boş
--   hd_education_publications      — yayın durumu (varsayılan draft) + DB yayın kilidi
--   hd_education_audit_events      — append-only denetim (içerik + erişim olayları)
--   hd_education_takedown_requests — kaldırma / düzeltme talepleri
--   hd_education_access_grants     — owner'ın verdiği kişi bazlı eğitmen erişimi
--
-- GÜVENLİK:
--   • Hiçbir tabloda tenant_id kolonu YOK (katalog hiçbir tenant'a ait değil; tenant sahipliği modeli
--     değişmez). RLS AÇIK, policy YOK (varsayılan deny), FORCE yok; PUBLIC/anon/authenticated REVOKE ALL;
--     yalnız service_role (sunucu route'ları) — ve yalnız gereken ayrıcalıklar.
--   • Erişim yetkisi yalnız SECURITY DEFINER RPC'lerle yazılır; RPC'ler işlemi yapanın PLATFORM OWNER
--     olduğunu DB'de yeniden doğrular: users.is_super_admin IS TRUE + role='admin' + active + demo değil
--     (e-posta / admin_level / OWNER_TENANT_ID KULLANILMAZ). EXECUTE yalnız service_role.
--     NOT: actor kimliği sunucuda oturum token'ıyla eşleştirildikten SONRA RPC'ye verilir (route katmanı);
--     DB kontrolü ikinci kilittir.
--   • Yayın (approved/published) DB tetikleyicisiyle kilitli: UTC doğrulanmış + hukuk E değil + engel yok +
--     yaşamayan kişi + owner onayı + hukuk referansı + güncel kanıt revizyonuna ait başarılı snapshot.
--
-- YEDEK: katalog içerik tabloları "global" (tenant yedeklerine girmez); erişim ve denetim tabloları
--   "system" (yedekten GERİ YÜKLENMEZ — iptal edilmiş yetki diriltilmez). Bkz. lib/backup/registry.ts.
-- PURGE: hd_education_access_grants.user_id (tenant_id kolonu yok) → owner purge'ün user_id taramasına
--   girer; ayrıca users FK ON DELETE CASCADE. Denetim satırları silinmez (hedef FK SET NULL).
-- DEPLOY: Bu dosyanın repoda olması HİÇBİR ORTAMA UYGULANDIĞI anlamına GELMEZ (owner onayı gerekir).
-- =============================================================================

BEGIN;

-- ─── 1) Kişiler ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hd_education_subjects (
  id                   uuid        PRIMARY KEY,
  natural_key          text        NOT NULL UNIQUE CHECK (natural_key ~ '^[a-z0-9][a-z0-9-]{1,118}-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  source_ref           text        NOT NULL CHECK (char_length(source_ref) BETWEEN 1 AND 40),
  display_name         text        NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  category             text        NOT NULL CHECK (category IN ('bilim','sanat','muzik','sinema','edebiyat','siyaset','tarih','spor','kesif','medya','kraliyet','diger')),
  is_living            boolean     NOT NULL,
  birth_date           date        NOT NULL,
  calendar_note        text        CHECK (calendar_note IS NULL OR char_length(calendar_note) <= 2000),
  birth_place          text        NOT NULL CHECK (char_length(birth_place) BETWEEN 1 AND 500),
  latitude             numeric(9,6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude            numeric(9,6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  coord_source_url     text,
  documented_local_time text       NOT NULL CHECK (char_length(documented_local_time) BETWEEN 1 AND 500),
  document_quote       text        NOT NULL CHECK (char_length(document_quote) BETWEEN 1 AND 4000),
  time_standard        text,
  utc_offset_seconds   integer     CHECK (utc_offset_seconds IS NULL OR utc_offset_seconds BETWEEN -86400 AND 86400),
  iana_zone            text,
  iana_delta_seconds   integer,
  birth_utc            timestamptz,
  utc_status           text        NOT NULL CHECK (utc_status IN ('VERIFIED','PENDING_VERIFICATION')),
  utc_evidence_url     text,
  data_status          text        NOT NULL DEFAULT 'A' CHECK (data_status = 'A'),
  legal_status         text        NOT NULL CHECK (legal_status IN ('E','LOW_REVIEWED','LOW_UNREVIEWED')),
  legal_note           text,
  blockers             text[]      NOT NULL DEFAULT '{}',
  short_bio_tr         text        CHECK (short_bio_tr IS NULL OR char_length(short_bio_tr) <= 800),
  revision             integer     NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_by           uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hd_edu_subj_verified_utc_chk CHECK (utc_status <> 'VERIFIED' OR birth_utc IS NOT NULL)
);

-- ─── 2) Kaynaklar (append-only) ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hd_education_sources (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id        uuid        NOT NULL REFERENCES public.hd_education_subjects(id) ON DELETE RESTRICT,
  subject_revision  integer     NOT NULL CHECK (subject_revision >= 1),
  role              text        NOT NULL CHECK (role IN ('birth_time','date_place','utc_standard','extra')),
  url               text        NOT NULL CHECK (char_length(url) BETWEEN 8 AND 2000),
  institution       text,
  document_title    text,
  archive_ref       text,
  document_date     text,
  accessed_on       date,
  verifies          text,
  time_explicit     boolean,
  primary_secondary text        CHECK (primary_secondary IS NULL OR primary_secondary IN ('birincil','ikincil')),
  seen_how          text,
  quote             text        CHECK (quote IS NULL OR char_length(quote) <= 4000),
  usage_restriction text,
  license           text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hd_edu_sources_subject_idx ON public.hd_education_sources (subject_id, subject_revision);

-- ─── 3) Hesap snapshot'ları (append-only, sürümlü) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hd_education_charts (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id           uuid        NOT NULL REFERENCES public.hd_education_subjects(id) ON DELETE RESTRICT,
  subject_revision     integer     NOT NULL CHECK (subject_revision >= 1),
  version              integer     NOT NULL CHECK (version >= 1),
  request_body         jsonb       NOT NULL CHECK (jsonb_typeof(request_body) = 'object'),
  request_hash         text        NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  provider             text        NOT NULL,
  endpoint             text        NOT NULL,
  adapter_version      text        NOT NULL,
  engine_version       text,
  contract_version     text,
  computed_result      jsonb       NOT NULL CHECK (jsonb_typeof(computed_result) = 'object'),
  provider_raw         jsonb,
  provider_raw_sha256  text        CHECK (provider_raw_sha256 IS NULL OR provider_raw_sha256 ~ '^[0-9a-f]{64}$'),
  design_instant_utc   timestamptz,
  time_check           jsonb,
  boundary_flags       jsonb,
  system_reading_dto   jsonb,
  variables_result     jsonb,
  calc_status          text        NOT NULL CHECK (calc_status IN ('OK','PROVIDER_ERROR','TIME_MISMATCH','BLOCKED_UTC')),
  computed_at          timestamptz NOT NULL DEFAULT now(),
  created_by           uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT hd_edu_charts_version_uq UNIQUE (subject_id, version),
  CONSTRAINT hd_edu_charts_request_uq UNIQUE (subject_id, request_hash, adapter_version)
);

-- ─── 4) Yayın durumu ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hd_education_publications (
  subject_id           uuid        PRIMARY KEY REFERENCES public.hd_education_subjects(id) ON DELETE RESTRICT,
  chart_id             uuid        REFERENCES public.hd_education_charts(id) ON DELETE RESTRICT,
  status               text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pilot_candidate','approved','published','withdrawn')),
  approved_by          uuid        REFERENCES public.users(id) ON DELETE RESTRICT,
  approved_at          timestamptz,
  decision_note        text        CHECK (decision_note IS NULL OR char_length(decision_note) <= 2000),
  legal_clearance_ref  text        CHECK (legal_clearance_ref IS NULL OR char_length(legal_clearance_ref) <= 500),
  withdrawn_at         timestamptz,
  withdraw_reason      text        CHECK (withdraw_reason IS NULL OR char_length(withdraw_reason) <= 2000),
  updated_by           uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ─── 5) Denetim (append-only) ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hd_education_audit_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  actor_kind      text        NOT NULL CHECK (actor_kind IN ('owner','system','import')),
  actor_user_id   uuid        REFERENCES public.users(id) ON DELETE RESTRICT,
  action          text        NOT NULL CHECK (action IN (
                    'subject_created','subject_revised','source_added','chart_recorded',
                    'publication_changed','takedown_requested','takedown_handled',
                    'access_granted','access_revoked','access_auto_revoked')),
  subject_id      uuid        REFERENCES public.hd_education_subjects(id) ON DELETE RESTRICT,
  target_user_id  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  detail          jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object' AND pg_column_size(detail) <= 65536),
  CONSTRAINT hd_edu_audit_actor_chk CHECK ((actor_kind = 'system') = (actor_user_id IS NULL) OR actor_kind = 'import')
);
CREATE INDEX IF NOT EXISTS hd_edu_audit_target_idx  ON public.hd_education_audit_events (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS hd_edu_audit_subject_idx ON public.hd_education_audit_events (subject_id, created_at DESC);

-- ─── 6) Kaldırma / düzeltme talepleri ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hd_education_takedown_requests (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id         uuid        NOT NULL REFERENCES public.hd_education_subjects(id) ON DELETE RESTRICT,
  requester_user_id  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  requester_kind     text        NOT NULL CHECK (requester_kind IN ('educator','rights_holder','other')),
  reason             text        NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 4000),
  status             text        NOT NULL DEFAULT 'open' CHECK (status IN ('open','handled','rejected')),
  handled_by         uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  handled_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ─── 7) Eğitmen erişim yetkileri ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hd_education_access_grants (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  granted_tenant_id  uuid        NOT NULL,
  granted_by         uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  granted_at         timestamptz NOT NULL DEFAULT now(),
  revoked_by         uuid        REFERENCES public.users(id) ON DELETE RESTRICT,
  revoked_at         timestamptz,
  revoke_reason      text        CHECK (revoke_reason IS NULL OR revoke_reason IN ('owner_revoked','role_changed','tenant_changed','other')),
  note               text        CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT hd_edu_grant_revoke_consistency_chk CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL)),
  CONSTRAINT hd_edu_grant_self_chk CHECK (user_id <> granted_by)
);
-- Aynı kişiye mükerrer ETKİN yetki yok.
CREATE UNIQUE INDEX IF NOT EXISTS hd_edu_grants_one_active_uidx ON public.hd_education_access_grants (user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS hd_edu_grants_user_idx ON public.hd_education_access_grants (user_id, granted_at DESC);

-- ─── Tetikleyiciler ────────────────────────────────────────────────────────────────────────────
-- Kişi kanıtı: kanıt alanı değişen her güncelleme revizyonu TAM 1 artırmalı; eski hâl denetime yazılır
-- (önceki kanıt sessizce üzerine yazılmaz). id / natural_key / created_* değişmez.
CREATE OR REPLACE FUNCTION public.hd_edu_subject_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.natural_key <> OLD.natural_key OR NEW.created_at <> OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by AND NOT (NEW.created_by IS NULL) THEN
    RAISE EXCEPTION 'hd_education_subjects: kimlik alanları değiştirilemez' USING ERRCODE = '23514';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['revision','updated_at','created_by']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['revision','updated_at','created_by']) THEN
    IF NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION 'hd_education_subjects: kanıt değişikliği yeni revizyon ister (revision + 1)' USING ERRCODE = '23514';
    END IF;
    -- Onaylı / yayımlı kişinin kanıtı (UTC, hukuk, engel, yaşam durumu …) yayın açıkken değiştirilemez:
    -- önce gerekçeli yayından kaldırma; aksi hâlde yayın, artık geçerli olmayan kanıtla açık kalırdı.
    IF EXISTS (SELECT 1 FROM public.hd_education_publications p
                WHERE p.subject_id = OLD.id AND p.status IN ('approved','published')) THEN
      RAISE EXCEPTION 'hd_education_subjects: onaylı/yayımlı kişinin kanıtı değiştirilemez (önce yayından kaldırın)' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.hd_education_audit_events (actor_kind, actor_user_id, action, subject_id, detail)
    VALUES ('system', NULL, 'subject_revised', OLD.id, jsonb_build_object('onceki_revizyon', OLD.revision, 'onceki', to_jsonb(OLD)));
  ELSIF NEW.revision <> OLD.revision THEN
    RAISE EXCEPTION 'hd_education_subjects: değişiklik olmadan revizyon artırılamaz' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hd_edu_subject_guard ON public.hd_education_subjects;
CREATE TRIGGER trg_hd_edu_subject_guard BEFORE UPDATE ON public.hd_education_subjects
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_subject_guard();

-- Append-only tablolar (kaynaklar, snapshot'lar): UPDATE yasak. Tek istisna: kullanıcı silinince FK'nin
-- created_by'ı NULL yapması (yalnız o alan değişiyorsa) — aksi hâlde kullanıcı silme / purge kilitlenirdi.
CREATE OR REPLACE FUNCTION public.hd_edu_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'hd_education_charts' THEN
    IF (to_jsonb(NEW) ->> 'created_by') IS NULL AND (to_jsonb(OLD) ->> 'created_by') IS NOT NULL
       AND (to_jsonb(NEW) - 'created_by') = (to_jsonb(OLD) - 'created_by') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION '%: kayıt değiştirilemez (append-only)', TG_TABLE_NAME USING ERRCODE = '23514';
END $$;
DROP TRIGGER IF EXISTS trg_hd_edu_sources_append_only ON public.hd_education_sources;
CREATE TRIGGER trg_hd_edu_sources_append_only BEFORE UPDATE ON public.hd_education_sources
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_append_only();
DROP TRIGGER IF EXISTS trg_hd_edu_charts_append_only ON public.hd_education_charts;
CREATE TRIGGER trg_hd_edu_charts_append_only BEFORE UPDATE ON public.hd_education_charts
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_append_only();

-- Kaynak / snapshot yalnız kişinin GÜNCEL revizyonuna eklenebilir; snapshot sürümü ardışık.
CREATE OR REPLACE FUNCTION public.hd_edu_revision_link_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_rev integer; v_max integer;
BEGIN
  SELECT revision INTO v_rev FROM public.hd_education_subjects WHERE id = NEW.subject_id FOR SHARE;
  IF v_rev IS NULL THEN RAISE EXCEPTION '%: kişi bulunamadı', TG_TABLE_NAME USING ERRCODE = '23503'; END IF;
  IF NEW.subject_revision <> v_rev THEN
    RAISE EXCEPTION '%: yalnız güncel kanıt revizyonuna (%) eklenebilir', TG_TABLE_NAME, v_rev USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'hd_education_charts' THEN
    SELECT coalesce(max(version), 0) INTO v_max FROM public.hd_education_charts WHERE subject_id = NEW.subject_id;
    IF NEW.version <> v_max + 1 THEN
      RAISE EXCEPTION 'hd_education_charts: sürüm ardışık olmalı (beklenen %)', v_max + 1 USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hd_edu_sources_rev ON public.hd_education_sources;
CREATE TRIGGER trg_hd_edu_sources_rev BEFORE INSERT ON public.hd_education_sources
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_revision_link_guard();
DROP TRIGGER IF EXISTS trg_hd_edu_charts_rev ON public.hd_education_charts;
CREATE TRIGGER trg_hd_edu_charts_rev BEFORE INSERT ON public.hd_education_charts
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_revision_link_guard();

-- Yayın kilidi + yayın değişikliği denetimi.
CREATE OR REPLACE FUNCTION public.hd_edu_publication_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s public.hd_education_subjects%ROWTYPE; c public.hd_education_charts%ROWTYPE; v_owner boolean;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'hd_education_publications: yeni kayıt yalnız draft olabilir' USING ERRCODE = '23514';
  END IF;
  IF NEW.status IN ('approved','published') THEN
    SELECT * INTO s FROM public.hd_education_subjects WHERE id = NEW.subject_id FOR SHARE;
    SELECT * INTO c FROM public.hd_education_charts WHERE id = NEW.chart_id;
    SELECT (u.is_super_admin IS TRUE AND lower(coalesce(u.role,'')) = 'admin' AND u.active IS TRUE AND coalesce(u.is_demo_account,false) IS FALSE)
      INTO v_owner FROM public.users u WHERE u.id = NEW.approved_by;
    IF s.utc_status <> 'VERIFIED' OR s.legal_status = 'E' OR cardinality(s.blockers) > 0 OR s.is_living
       OR NEW.chart_id IS NULL OR c.id IS NULL OR c.subject_id <> NEW.subject_id OR c.calc_status <> 'OK'
       OR c.subject_revision <> s.revision
       OR NEW.approved_by IS NULL OR v_owner IS NOT TRUE OR NEW.approved_at IS NULL
       OR nullif(btrim(coalesce(NEW.legal_clearance_ref,'')),'') IS NULL THEN
      RAISE EXCEPTION 'hd_education_publications: yayın koşulları sağlanmadı (UTC/hukuk/engel/snapshot/owner onayı)' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.status = 'withdrawn' AND (NEW.withdrawn_at IS NULL OR nullif(btrim(coalesce(NEW.withdraw_reason,'')),'') IS NULL) THEN
    RAISE EXCEPTION 'hd_education_publications: yayından kaldırma tarih ve gerekçe ister' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.hd_education_audit_events (actor_kind, actor_user_id, action, subject_id, detail)
    VALUES (CASE WHEN NEW.updated_by IS NULL THEN 'system' ELSE 'owner' END, NEW.updated_by, 'publication_changed', NEW.subject_id,
            jsonb_build_object('onceki', OLD.status, 'yeni', NEW.status, 'gerekce', NEW.withdraw_reason));
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hd_edu_publication_guard ON public.hd_education_publications;
CREATE TRIGGER trg_hd_edu_publication_guard BEFORE INSERT OR UPDATE ON public.hd_education_publications
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_publication_guard();

-- Denetim append-only: yalnız users silinince FK'nin target_user_id'yi NULL yapmasına izin verilir.
CREATE OR REPLACE FUNCTION public.hd_edu_audit_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'hd_education_audit_events: silinemez' USING ERRCODE = '23514';
  END IF;
  IF NEW.target_user_id IS NULL AND OLD.target_user_id IS NOT NULL
     AND (to_jsonb(NEW) - 'target_user_id') = (to_jsonb(OLD) - 'target_user_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'hd_education_audit_events: değiştirilemez (append-only)' USING ERRCODE = '23514';
END $$;
DROP TRIGGER IF EXISTS trg_hd_edu_audit_guard ON public.hd_education_audit_events;
CREATE TRIGGER trg_hd_edu_audit_guard BEFORE UPDATE OR DELETE ON public.hd_education_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_audit_guard();

-- Yetki satırı: yalnız ETKİN → İPTAL geçişi; diğer alanlar değişmez. (DELETE yalnız users CASCADE /
-- owner purge ile; uygulama rolüne DELETE ayrıcalığı verilmez.)
CREATE OR REPLACE FUNCTION public.hd_edu_grant_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'hd_education_access_grants: iptal edilmiş yetki değiştirilemez / yeniden etkinleştirilemez' USING ERRCODE = '23514';
  END IF;
  IF NEW.revoked_at IS NULL
     OR (to_jsonb(NEW) - ARRAY['revoked_at','revoked_by','revoke_reason']) <> (to_jsonb(OLD) - ARRAY['revoked_at','revoked_by','revoke_reason']) THEN
    RAISE EXCEPTION 'hd_education_access_grants: yalnız iptal edilebilir' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hd_edu_grant_guard ON public.hd_education_access_grants;
CREATE TRIGGER trg_hd_edu_grant_guard BEFORE UPDATE ON public.hd_education_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_grant_guard();

-- ─── RPC: owner yetki verir / kaldırır; sistem uygunsuzluk iptali ─────────────────────────────
-- Yardımcı: PLATFORM OWNER mı? (e-posta / admin_level / OWNER_TENANT_ID KULLANILMAZ)
CREATE OR REPLACE FUNCTION public.hd_edu_actor_is_owner(p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce((
    SELECT u.is_super_admin IS TRUE AND lower(coalesce(u.role,'')) = 'admin' AND u.active IS TRUE
           AND coalesce(u.is_demo_account,false) IS FALSE
      FROM public.users u WHERE u.id = p_actor), false)
$$;

CREATE OR REPLACE FUNCTION public.hd_education_grant_access(p_actor uuid, p_target uuid, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE t public.users%ROWTYPE; v_id uuid; v_event uuid;
BEGIN
  IF p_actor IS NULL OR p_target IS NULL THEN RAISE EXCEPTION 'hd_edu_grant: eksik parametre' USING ERRCODE = 'ED001'; END IF;
  IF NOT public.hd_edu_actor_is_owner(p_actor) THEN RAISE EXCEPTION 'hd_edu_grant: yetkisiz aktör' USING ERRCODE = 'ED002'; END IF;
  IF p_actor = p_target THEN RAISE EXCEPTION 'hd_edu_grant: owner kendine yetki veremez' USING ERRCODE = 'ED003'; END IF;
  SELECT * INTO t FROM public.users WHERE id = p_target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'hd_edu_grant: hedef bulunamadı' USING ERRCODE = 'ED004'; END IF;
  IF lower(coalesce(t.role,'')) <> 'expert' OR t.active IS NOT TRUE OR coalesce(t.is_demo_account,false)
     OR t.is_super_admin IS TRUE OR t.tenant_id IS NULL
     OR lower(coalesce(t.approval_status,'')) NOT IN ('approved','')
     OR coalesce(t.module_permissions ->> 'human_design','') <> 'true' THEN
    RAISE EXCEPTION 'hd_edu_grant: hedef uygun değil (aktif, onaylı, demo olmayan, Human Design izinli uzman olmalı)' USING ERRCODE = 'ED005';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hd_education_access_grants WHERE user_id = p_target AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'hd_edu_grant: etkin yetki zaten var' USING ERRCODE = 'ED006';
  END IF;
  INSERT INTO public.hd_education_access_grants (user_id, granted_tenant_id, granted_by, note)
  VALUES (p_target, t.tenant_id, p_actor, nullif(btrim(coalesce(p_note,'')), '')) RETURNING id INTO v_id;
  INSERT INTO public.hd_education_audit_events (actor_kind, actor_user_id, action, target_user_id, detail)
  VALUES ('owner', p_actor, 'access_granted', p_target, jsonb_build_object('grant_id', v_id)) RETURNING id INTO v_event;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.hd_education_revoke_access(p_actor uuid, p_target uuid, p_reason text DEFAULT 'owner_revoked')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_actor IS NULL OR p_target IS NULL THEN RAISE EXCEPTION 'hd_edu_revoke: eksik parametre' USING ERRCODE = 'ED001'; END IF;
  IF NOT public.hd_edu_actor_is_owner(p_actor) THEN RAISE EXCEPTION 'hd_edu_revoke: yetkisiz aktör' USING ERRCODE = 'ED002'; END IF;
  IF coalesce(p_reason,'') NOT IN ('owner_revoked','other') THEN RAISE EXCEPTION 'hd_edu_revoke: geçersiz gerekçe' USING ERRCODE = 'ED007'; END IF;
  SELECT id INTO v_id FROM public.hd_education_access_grants WHERE user_id = p_target AND revoked_at IS NULL FOR UPDATE;
  IF v_id IS NULL THEN RAISE EXCEPTION 'hd_edu_revoke: etkin yetki yok' USING ERRCODE = 'ED008'; END IF;
  UPDATE public.hd_education_access_grants SET revoked_at = now(), revoked_by = p_actor, revoke_reason = p_reason WHERE id = v_id;
  INSERT INTO public.hd_education_audit_events (actor_kind, actor_user_id, action, target_user_id, detail)
  VALUES ('owner', p_actor, 'access_revoked', p_target, jsonb_build_object('grant_id', v_id, 'gerekce', p_reason));
  RETURN v_id;
END $$;

-- Sistem iptali: yalnız DB'de UYGUNSUZLUK doğrulanırsa (rol değişti / tenant değişti) etkin yetkiyi
-- kalıcı kapatır. Erişim AÇAMAZ; yalnız kapatır. Rol tekrar 'expert' yapılsa da yetki geri gelmez.
CREATE OR REPLACE FUNCTION public.hd_education_auto_revoke_ineligible(p_target uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE g public.hd_education_access_grants%ROWTYPE; u public.users%ROWTYPE; v_reason text;
BEGIN
  SELECT * INTO g FROM public.hd_education_access_grants WHERE user_id = p_target AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO u FROM public.users WHERE id = p_target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF lower(coalesce(u.role,'')) <> 'expert' OR u.is_super_admin IS TRUE THEN
    v_reason := 'role_changed';
  ELSIF u.tenant_id IS DISTINCT FROM g.granted_tenant_id THEN
    v_reason := 'tenant_changed';
  ELSIF to_regclass('public.admin_audit_log') IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.admin_audit_log a
       WHERE a.target_user_id = p_target AND a.action = 'role_changed' AND a.created_at >= g.granted_at) THEN
    v_reason := 'role_changed';
  ELSE
    RETURN NULL;
  END IF;
  UPDATE public.hd_education_access_grants SET revoked_at = now(), revoked_by = NULL, revoke_reason = v_reason WHERE id = g.id;
  INSERT INTO public.hd_education_audit_events (actor_kind, actor_user_id, action, target_user_id, detail)
  VALUES ('system', NULL, 'access_auto_revoked', p_target, jsonb_build_object('grant_id', g.id, 'gerekce', v_reason));
  RETURN v_reason;
END $$;

-- ─── Ayrıcalıklar ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hd_education_subjects','hd_education_sources','hd_education_charts','hd_education_publications',
                           'hd_education_audit_events','hd_education_takedown_requests','hd_education_access_grants'] LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON public.%I FROM service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
-- service_role: yalnız gereken ayrıcalıklar (DELETE hiçbir tabloda yok).
GRANT SELECT, INSERT, UPDATE ON public.hd_education_subjects          TO service_role;
GRANT SELECT, INSERT         ON public.hd_education_sources           TO service_role;
GRANT SELECT, INSERT         ON public.hd_education_charts            TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.hd_education_publications      TO service_role;
GRANT SELECT, INSERT         ON public.hd_education_audit_events      TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.hd_education_takedown_requests TO service_role;
GRANT SELECT                 ON public.hd_education_access_grants     TO service_role;  -- yazma yalnız RPC

-- Fonksiyonlar: PUBLIC/anon/authenticated çalıştıramaz; RPC'ler yalnız service_role.
REVOKE ALL ON FUNCTION public.hd_edu_subject_guard()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hd_edu_append_only()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hd_edu_revision_link_guard()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hd_edu_publication_guard()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hd_edu_audit_guard()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hd_edu_grant_guard()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hd_edu_actor_is_owner(uuid)   FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hd_education_grant_access(uuid, uuid, text)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hd_education_revoke_access(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hd_education_auto_revoke_ineligible(uuid)    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hd_education_grant_access(uuid, uuid, text)  TO service_role;
GRANT EXECUTE ON FUNCTION public.hd_education_revoke_access(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hd_education_auto_revoke_ineligible(uuid)    TO service_role;

COMMIT;
