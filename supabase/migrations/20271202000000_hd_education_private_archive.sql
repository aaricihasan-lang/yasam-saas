-- =============================================================================
-- 20271125000000_hd_education_private_archive.sql
--
-- HUMAN DESIGN — EĞİTMENE ÖZEL EĞİTİM HARİTALARI (FAZ 6) · ADDITIVE · YALNIZ YENİ NESNELER
--
-- AMAÇ: Eğitmen, KENDİ danışanının KAYITLI (hesaplanmış) HD haritasını, danışanın belgeli açık izniyle,
--   kendi özel eğitim arşivine ekler. Kayıt yalnız o eğitmene (tenant) ve PLATFORM OWNER'a görünür;
--   başka eğitmen varlığını dahi öğrenemez. İçerik tabloları merkezî "Hazır Eğitim Haritaları"ndan AYRIDIR.
--   FAZ 8 (owner kararı) TEK YETKİ: "Human Design Eğitim Haritaları" yetkisinin tek kaynağı merkezî
--   hd_education_access_grants'tir (20271110) → bu migration 20271110'dan SONRA uygulanmalıdır.
--
-- TASARIM İLKELERİ:
--   • KOPYA YOK: Hesap verisi kopyalanmaz; kayıt kaynak harita satırına (human_design_charts.id) bağlıdır.
--     Kaynak hesap alanlarının parmak izi kayıt anında saklanır; her okumada DB içinde yeniden hesaplanır.
--     Uyuşmazsa (doğum verisi / hesap / danışan bağı değişti) kayıt "source_changed" olur ve harita
--     GÖSTERİLMEZ — eski hesap yeni doğum verisiymiş gibi sunulamaz. Kaynak harita / danışan silinirse
--     FK CASCADE eğitim kaydını da siler (yetkisiz "yaşayan kopya" imkânsız).
--   • İZİN: danışan (veya yasal temsilcisi) adına kayıt + izin metni SÜRÜMÜ ve SHA-256'sı (owner'ın kullanıma
--     onayladığı metin) + izin tarihi + yöntem + KANIT DOSYASI (PDF/PNG/JPEG, ≤2 MB, DB'de; SHA-256 her ayrıntı
--     okumasında doğrulanır). Varsayılan sunum TAKMA AD; açık isim ayrı kapsam + ayrı teyit + imzalı yöntem ister.
--     İzin geri çekilince (yalnız bir kez, geri alınamaz) bağlı kayıtlara erişim ANINDA kapanır (her okuma kontrol eder).
--   • YETKİ: eğitmen = role 'expert' + aktif + onaylı + demo değil + Human Design izni + owner'ın verdiği ETKİN TEK
--     eğitim yetkisi (hd_education_access_grants; granted_tenant_id = users.tenant_id) + owner'ın arşiv anahtarı AÇIK.
--     Rol / tenant değişirse yetki kalıcı iptal (merkezî RPC; yeniden uzman yapılsa da dönmez). Yetki kapatma veri SİLMEZ. OWNER = users.is_super_admin + role 'admin' + aktif + demo değil
--     (e-posta / admin_level / OWNER_TENANT_ID KULLANILMAZ). role='admin' OWNER DEĞİLDİR.
--   • ERİŞİM KİLİDİ: 6 tablonun HİÇBİRİNDE PUBLIC/anon/authenticated/service_role tablo ayrıcalığı YOK; RLS açık,
--     policy yok. Tüm okuma/yazma yalnız aşağıdaki SECURITY DEFINER RPC'lerle; her RPC aktörü (sunucunun oturum
--     token'ıyla eşleştirdiği kullanıcı) DB'de yeniden doğrular. Sunucu kodundaki bir filtre hatası bile başka
--     tenant'ın satırını okuyamaz.
--   • DENETİM: asgari işlem izi (eylem + kimlikler + alan ADLARI); başlık / not / isim / doğum verisi YAZILMAZ.
--     Owner purge (admin_purge_archived_expert) uzman tenant'ını silerken denetim satırları da silinebilir.
--
-- MEVCUT TABLOLARA DOKUNULMAZ: users, human_design_clients, human_design_charts, clients, client_consents,
--   hd_education_* … (yalnız yeni tablolardan bunlara FK). Mevcut auth / tenant / RLS kuralları DEĞİŞMEZ.
-- YEDEK: 6 tablo kullanıcı yedeği / dışa aktarımı dışındadır (lib/backup/ownerPilotTables.ts). Platform felaket yedeği
--   (Altın Yedek, tam pg_dump) bunları KAPSAR. BİLİNEN RİSK (owner kararıyla kabul, FAZ 8): eski bir yedekten geri
--   yüklemede, yedekten SONRA geri çekilen izin / silinen kayıt eski hâline dönebilir; ayrı iptal günlüğü YOKTUR.
-- FAZ 14 (owner kararı 24.10.2026 — izin sadeleştirme; dosya henüz HİÇBİR ortama uygulanmadığı için yerinde güncellendi):
--   • İKİ KAYIT TÜRÜ: 'gercek' (danışanın kayıtlı haritası; izin şart) ve 'kurgusal' (tamamen kurgusal doğum bilgisiyle
--     eğitim haritası; danışan / izin / kaynak harita YOK; hesap sonucu kaydın KENDİSİNDE saklanır, Danışan Yolculuğu'na ve
--     normal HD arşivine HİÇ yazılmaz; eğitmen "gerçek kişiye ait bilgi kullanmadım" beyanını sürümüyle verir). Tür ve
--     kurgusal veri sonradan DEĞİŞTİRİLEMEZ (gerçek harita etiketle kurgusala çevrilemez; kurgusal kayıt izin kontrolünü atlatamaz).
--   • GERÇEK DANIŞAN İÇİN SADE YOL: 'egitmen_beyani' yöntemi — ıslak imza / tarama / dosya ZORUNLU DEĞİL; eğitmen aktif
--     onayla "gerekli izne veya hukuki dayanağa sahibim" beyanını verir (beyan metni sürümü + SHA-256 + tarih + kapsam
--     kaydedilir). Beyan metni de izin metni gibi owner + HUKUK ONAYI olmadan kullanılamaz (approved_for_use=false) →
--     hukukçu değerlendirene kadar gerçek danışan beyan yolu kapalı kalır. Belgeli yöntemler (ıslak imza / e-imza / kayıtlı
--     e-posta) geriye dönük uyumluluk için aynen geçerli. Varsayılan sunum takma ad; açık isim ve doğum bilgisi AYRI teyit.
-- DEPLOY: Bu dosyanın repoda olması HİÇBİR ORTAMA UYGULANDIĞI anlamına GELMEZ (owner onayı gerekir).
--   Uygulansa bile: arşiv anahtarı KAPALI, izin metni ONAYSIZ → özellik kapalı kalır.
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
  IF to_regclass('public.users') IS NULL OR to_regclass('public.human_design_clients') IS NULL
     OR to_regclass('public.human_design_charts') IS NULL THEN
    RAISE EXCEPTION 'hd_edu_private: users / human_design_clients / human_design_charts bulunamadı (precondition)';
  END IF;
  -- FAZ 8 TEK YETKİ: "Human Design Eğitim Haritaları" yetkisinin TEK kaynağı merkezî hd_education_access_grants (20271110).
  IF to_regclass('public.hd_education_access_grants') IS NULL
     OR to_regprocedure('public.hd_education_auto_revoke_ineligible(uuid)') IS NULL THEN
    RAISE EXCEPTION 'hd_edu_private: hd_education_access_grants / hd_education_auto_revoke_ineligible yok — önce 20271110 uygulanmalı (precondition)';
  END IF;
END $pre$;

-- ─── 1) Owner arşiv anahtarı (tek satır; varsayılan KAPALI) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hd_edu_private_control (
  id            smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  archive_open  boolean     NOT NULL DEFAULT false,
  changed_by    uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at    timestamptz NOT NULL DEFAULT now(),
  reason        text        CHECK (reason IS NULL OR char_length(reason) <= 500)
);
INSERT INTO public.hd_edu_private_control (id, archive_open) VALUES (1, false) ON CONFLICT (id) DO NOTHING;

-- ─── 3) İzin metni sürümleri (owner kullanıma onaylamadan izin KAYDEDİLEMEZ) ──────────────────────
CREATE TABLE IF NOT EXISTS public.hd_edu_private_consent_texts (
  version            text        PRIMARY KEY CHECK (version ~ '^hd-egitim-(izin|beyan)-v[0-9]{1,3}$'),
  title              text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body               text        NOT NULL CHECK (char_length(body) BETWEEN 50 AND 20000),
  body_sha256        text        NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  approved_for_use   boolean     NOT NULL DEFAULT false,
  approved_by        uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at        timestamptz,
  legal_ref          text        CHECK (legal_ref IS NULL OR char_length(legal_ref) <= 500),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hd_edu_priv_text_sha_chk CHECK (body_sha256 = encode(sha256(convert_to(body, 'UTF8')), 'hex')),
  CONSTRAINT hd_edu_priv_text_approval_chk CHECK (approved_for_use = false OR (approved_at IS NOT NULL AND nullif(btrim(coalesce(legal_ref,'')),'') IS NOT NULL))
);

-- ─── 4) Danışan izin kayıtları ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hd_edu_private_consents (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL,
  hd_client_id        uuid        NOT NULL REFERENCES public.human_design_clients(id) ON DELETE CASCADE,
  consenter_name      text        NOT NULL CHECK (char_length(btrim(consenter_name)) BETWEEN 2 AND 200),
  consenter_relation  text        NOT NULL CHECK (consenter_relation IN ('danisan','yasal_temsilci')),
  purpose             text        NOT NULL DEFAULT 'hd_egitim_ornegi' CHECK (purpose = 'hd_egitim_ornegi'),
  audience            text        NOT NULL DEFAULT 'egitmenin_kendi_egitimleri' CHECK (audience = 'egitmenin_kendi_egitimleri'),
  display_scope       text        NOT NULL CHECK (display_scope IN ('anonim','acik_isim')),
  include_birth_data  boolean     NOT NULL DEFAULT false,
  named_confirmed     boolean     NOT NULL DEFAULT false,
  text_version        text        NOT NULL REFERENCES public.hd_edu_private_consent_texts(version) ON DELETE RESTRICT,
  text_sha256         text        NOT NULL CHECK (text_sha256 ~ '^[0-9a-f]{64}$'),
  given_on            date        NOT NULL CHECK (given_on >= DATE '2000-01-01'),
  method              text        NOT NULL CHECK (method IN ('islak_imza_tarama','e_imza','kayitli_eposta','egitmen_beyani')),
  recorded_by         uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  withdrawn_at        timestamptz,
  withdrawn_by        uuid        REFERENCES public.users(id) ON DELETE RESTRICT,
  withdraw_channel    text        CHECK (withdraw_channel IS NULL OR withdraw_channel IN ('danisan_talebi','egitmen_karari','owner_karari')),
  CONSTRAINT hd_edu_priv_consent_withdraw_chk CHECK ((withdrawn_at IS NULL) = (withdraw_channel IS NULL)),
  -- Açık isim: ayrı kapsam + ayrı teyit + imzalı yöntem ya da eğitmen beyanı (kayıtlı e-posta isim için YETMEZ).
  CONSTRAINT hd_edu_priv_consent_named_chk CHECK (display_scope = 'anonim'
    OR (named_confirmed IS TRUE AND method IN ('islak_imza_tarama','e_imza','egitmen_beyani'))),
  -- FAZ 14: eğitmen beyanı YALNIZ beyan metniyle; belgeli yöntemler YALNIZ izin metniyle.
  CONSTRAINT hd_edu_priv_consent_text_kind_chk CHECK ((method = 'egitmen_beyani') = (text_version LIKE 'hd-egitim-beyan-%'))
);
CREATE INDEX IF NOT EXISTS hd_edu_priv_consents_tenant_idx ON public.hd_edu_private_consents (tenant_id, hd_client_id, recorded_at DESC);

-- ─── 5) İzin kanıt dosyası (DB içinde; yalnız RPC; danışan / izin silinince CASCADE — yetim dosya yok) ─
CREATE TABLE IF NOT EXISTS public.hd_edu_private_consent_evidence (
  consent_id   uuid        PRIMARY KEY REFERENCES public.hd_edu_private_consents(id) ON DELETE CASCADE,
  tenant_id    uuid        NOT NULL,
  mime         text        NOT NULL CHECK (mime IN ('application/pdf','image/png','image/jpeg')),
  byte_size    integer     NOT NULL CHECK (byte_size BETWEEN 64 AND 2097152),
  sha256       text        NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  content      bytea       NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hd_edu_priv_evidence_size_chk CHECK (octet_length(content) = byte_size)
);

-- ─── 6) Özel eğitim kayıtları (KOPYA YOK — kaynak haritaya bağlı) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hd_edu_private_items (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL,
  trainer_user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  -- FAZ 14: 'gercek' = danışanın kayıtlı haritası (izin + danışan + kaynak harita ZORUNLU); 'kurgusal' = kurgusal eğitim haritası.
  item_kind           text        NOT NULL DEFAULT 'gercek' CHECK (item_kind IN ('gercek','kurgusal')),
  consent_id          uuid        REFERENCES public.hd_edu_private_consents(id) ON DELETE CASCADE,
  hd_client_id        uuid        REFERENCES public.human_design_clients(id) ON DELETE CASCADE,
  source_chart_id     uuid        REFERENCES public.human_design_charts(id) ON DELETE CASCADE,
  source_fingerprint  text        CHECK (source_fingerprint IS NULL OR source_fingerprint ~ '^[0-9a-f]{64}$'),
  -- Kurgusal kayıt: girdi (kurgusal doğum bilgisi) + mevcut motorun hesap sonucu + ham sağlayıcı yanıtı + kurgusal beyanı.
  fic_input           jsonb,
  fic_chart           jsonb,
  fic_provider_raw    jsonb,
  fic_input_hash      text,
  fic_declared_at     timestamptz,
  fic_declaration     text,
  title               text        NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  alias_label         text        NOT NULL CHECK (char_length(btrim(alias_label)) BETWEEN 1 AND 80),
  display_mode        text        NOT NULL DEFAULT 'alias' CHECK (display_mode IN ('alias','named')),
  category            text        NOT NULL DEFAULT 'genel' CHECK (category IN ('genel','tip','otorite','profil','merkezler','kanallar','tanim','iliski','diger')),
  description         text        CHECK (description IS NULL OR char_length(description) <= 2000),
  teaching_notes      text        CHECK (teaching_notes IS NULL OR char_length(teaching_notes) <= 20000),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT hd_edu_priv_items_chart_uq UNIQUE (source_chart_id),
  CONSTRAINT hd_edu_priv_items_kind_chk CHECK (
    (item_kind = 'gercek' AND consent_id IS NOT NULL AND hd_client_id IS NOT NULL AND source_chart_id IS NOT NULL AND source_fingerprint IS NOT NULL
       AND fic_input IS NULL AND fic_chart IS NULL AND fic_provider_raw IS NULL AND fic_input_hash IS NULL AND fic_declared_at IS NULL AND fic_declaration IS NULL)
    OR (item_kind = 'kurgusal' AND consent_id IS NULL AND hd_client_id IS NULL AND source_chart_id IS NULL AND source_fingerprint IS NULL
       AND display_mode = 'alias'
       AND jsonb_typeof(fic_input) = 'object' AND jsonb_typeof(fic_chart) = 'object'
       AND (fic_provider_raw IS NULL OR jsonb_typeof(fic_provider_raw) = 'object')
       AND fic_input_hash ~ '^[0-9a-f]{64}$' AND fic_declared_at IS NOT NULL AND fic_declaration ~ '^hd-egitim-kurgusal-beyan-v[0-9]{1,3}$'
       AND pg_column_size(fic_chart) <= 262144 AND pg_column_size(fic_input) <= 4096
       AND (fic_provider_raw IS NULL OR pg_column_size(fic_provider_raw) <= 524288)))
);
-- Aynı eğitmen + aynı kurgusal girdi → tek kayıt (yanlışlıkla çoğaltma ve gereksiz ücretli hesap yok).
CREATE UNIQUE INDEX IF NOT EXISTS hd_edu_priv_items_fic_uq ON public.hd_edu_private_items (trainer_user_id, fic_input_hash) WHERE item_kind = 'kurgusal';
CREATE INDEX IF NOT EXISTS hd_edu_priv_items_tenant_idx ON public.hd_edu_private_items (tenant_id, trainer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS hd_edu_priv_items_consent_idx ON public.hd_edu_private_items (consent_id);
CREATE INDEX IF NOT EXISTS hd_edu_priv_items_client_idx ON public.hd_edu_private_items (hd_client_id);

-- ─── 7) Asgari denetim izi (kişisel içerik YOK) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hd_edu_private_audit (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  tenant_id      uuid,
  actor_kind     text        NOT NULL CHECK (actor_kind IN ('trainer','owner','system')),
  actor_user_id  uuid,
  action         text        NOT NULL CHECK (action IN (
                   'archive_opened','archive_closed','text_approved',
                   'consent_recorded','consent_withdrawn','consent_deleted',
                   'item_added','item_updated','item_rebound','item_deleted','fictional_added')),
  item_id        uuid,
  consent_id     uuid,
  target_user_id uuid,
  detail         jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object' AND pg_column_size(detail) <= 4096)
);
CREATE INDEX IF NOT EXISTS hd_edu_priv_audit_tenant_idx ON public.hd_edu_private_audit (tenant_id, created_at DESC);

-- ─── Tetikleyiciler ──────────────────────────────────────────────────────────────────────────────
-- İzin metni: gövde / sürüm değişmez; yalnız kullanıma onay (bir kez) verilebilir.
CREATE OR REPLACE FUNCTION public.hd_edu_priv_text_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'hd_edu_private_consent_texts: silinemez' USING ERRCODE = '23514';
  END IF;
  IF NEW.version <> OLD.version OR NEW.body <> OLD.body OR NEW.body_sha256 <> OLD.body_sha256 OR NEW.title <> OLD.title
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'hd_edu_private_consent_texts: metin değiştirilemez (yeni sürüm ekleyin)' USING ERRCODE = '23514';
  END IF;
  IF OLD.approved_for_use AND (NEW.approved_for_use IS DISTINCT FROM OLD.approved_for_use OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.legal_ref IS DISTINCT FROM OLD.legal_ref) THEN
    -- Tek istisna: onaylayan kullanıcı silinince FK'nin approved_by'ı NULL yapması.
    RAISE EXCEPTION 'hd_edu_private_consent_texts: onay geri alınamaz' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hd_edu_priv_text_guard ON public.hd_edu_private_consent_texts;
CREATE TRIGGER trg_hd_edu_priv_text_guard BEFORE UPDATE OR DELETE ON public.hd_edu_private_consent_texts
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_priv_text_guard();

-- İzin: çekirdek alanlar değişmez; yalnız bir kez geri çekilebilir (geri alınamaz). Tenant = danışanın tenant'ı.
CREATE OR REPLACE FUNCTION public.hd_edu_priv_consent_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_tenant uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT c.tenant_id INTO v_tenant FROM public.human_design_clients c WHERE c.id = NEW.hd_client_id;
    IF v_tenant IS NULL OR v_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'hd_edu_private_consents: danışan bu tenant''a ait değil' USING ERRCODE = '23514';
    END IF;
    IF NEW.withdrawn_at IS NOT NULL THEN
      RAISE EXCEPTION 'hd_edu_private_consents: yeni izin geri çekilmiş olamaz' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'hd_edu_private_consents: geri çekilmiş izin değiştirilemez / yeniden açılamaz' USING ERRCODE = '23514';
  END IF;
  IF NEW.withdrawn_at IS NULL
     OR (to_jsonb(NEW) - ARRAY['withdrawn_at','withdrawn_by','withdraw_channel']) <> (to_jsonb(OLD) - ARRAY['withdrawn_at','withdrawn_by','withdraw_channel']) THEN
    RAISE EXCEPTION 'hd_edu_private_consents: izin içeriği değiştirilemez (yalnız geri çekilebilir)' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hd_edu_priv_consent_guard ON public.hd_edu_private_consents;
CREATE TRIGGER trg_hd_edu_priv_consent_guard BEFORE INSERT OR UPDATE ON public.hd_edu_private_consents
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_priv_consent_guard();

-- Kanıt: değiştirilemez; tenant = iznin tenant'ı; SHA-256 içerikten doğrulanır.
CREATE OR REPLACE FUNCTION public.hd_edu_priv_evidence_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_tenant uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'hd_edu_private_consent_evidence: kanıt değiştirilemez' USING ERRCODE = '23514';
  END IF;
  SELECT tenant_id INTO v_tenant FROM public.hd_edu_private_consents WHERE id = NEW.consent_id;
  IF v_tenant IS NULL OR v_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'hd_edu_private_consent_evidence: tenant uyuşmazlığı' USING ERRCODE = '23514';
  END IF;
  IF encode(sha256(NEW.content), 'hex') <> NEW.sha256 THEN
    RAISE EXCEPTION 'hd_edu_private_consent_evidence: SHA-256 uyuşmazlığı' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hd_edu_priv_evidence_guard ON public.hd_edu_private_consent_evidence;
CREATE TRIGGER trg_hd_edu_priv_evidence_guard BEFORE INSERT OR UPDATE ON public.hd_edu_private_consent_evidence
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_priv_evidence_guard();

-- Kaynak harita parmak izi: yalnız HESAPLA İLGİLİ alanlar + tenant / danışan bağı (ad / not değişikliği etkilemez).
-- to_jsonb(satır) ile okunur: kolon eksikse (eski şema) NULL sayılır, fonksiyon kırılmaz.
CREATE OR REPLACE FUNCTION public.hd_edu_priv_chart_fp(p_chart uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array(
           j -> 'tenant_id', j -> 'client_id', j -> 'source', j -> 'provider', j -> 'birth_date', j -> 'birth_time',
           j -> 'birth_place', j -> 'timezone', j -> 'location_id', j -> 'input', j -> 'computed_result', j -> 'input_hash',
           md5(coalesce(j ->> 'provider_raw', '')))::text, 'UTF8')), 'hex')
    FROM (SELECT to_jsonb(c) AS j FROM public.human_design_charts c WHERE c.id = p_chart) s
$$;

-- Kayıt: kimlik / kaynak alanları değişmez (parmak izi yalnız yeniden bağlama RPC'siyle). Tenant tutarlılığı.
CREATE OR REPLACE FUNCTION public.hd_edu_priv_item_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_ct uuid; v_cc uuid; v_kt uuid; v_kc uuid; v_ut uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.item_kind = 'kurgusal' THEN
      -- Kurgusal: yalnız eğitmenin tenant'ı; danışan / harita / izin bağı YOK (CHECK de zorlar).
      SELECT tenant_id INTO v_ut FROM public.users WHERE id = NEW.trainer_user_id;
      IF v_ut IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'hd_edu_private_items: tenant tutarsız' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END IF;
    SELECT tenant_id, client_id INTO v_ct, v_cc FROM public.human_design_charts WHERE id = NEW.source_chart_id;
    SELECT tenant_id, hd_client_id INTO v_kt, v_kc FROM public.hd_edu_private_consents WHERE id = NEW.consent_id;
    SELECT tenant_id INTO v_ut FROM public.users WHERE id = NEW.trainer_user_id;
    IF v_ct IS DISTINCT FROM NEW.tenant_id OR v_kt IS DISTINCT FROM NEW.tenant_id OR v_ut IS DISTINCT FROM NEW.tenant_id
       OR v_cc IS DISTINCT FROM NEW.hd_client_id OR v_kc IS DISTINCT FROM NEW.hd_client_id THEN
      RAISE EXCEPTION 'hd_edu_private_items: tenant / danışan / harita tutarsız' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.trainer_user_id <> OLD.trainer_user_id
     OR NEW.consent_id IS DISTINCT FROM OLD.consent_id OR NEW.hd_client_id IS DISTINCT FROM OLD.hd_client_id
     OR NEW.source_chart_id IS DISTINCT FROM OLD.source_chart_id OR NEW.created_at <> OLD.created_at
     -- FAZ 14: kayıt türü ve kurgusal veri / beyan değiştirilemez (tür değiştirerek izin kontrolü atlatılamaz).
     OR NEW.item_kind IS DISTINCT FROM OLD.item_kind OR NEW.fic_input IS DISTINCT FROM OLD.fic_input OR NEW.fic_chart IS DISTINCT FROM OLD.fic_chart
     OR NEW.fic_provider_raw IS DISTINCT FROM OLD.fic_provider_raw OR NEW.fic_input_hash IS DISTINCT FROM OLD.fic_input_hash
     OR NEW.fic_declared_at IS DISTINCT FROM OLD.fic_declared_at OR NEW.fic_declaration IS DISTINCT FROM OLD.fic_declaration THEN
    RAISE EXCEPTION 'hd_edu_private_items: kimlik / kaynak alanları değiştirilemez' USING ERRCODE = '23514';
  END IF;
  IF NEW.source_fingerprint IS DISTINCT FROM OLD.source_fingerprint
     AND coalesce(current_setting('hd_edu_priv.rebind', true), '') <> NEW.id::text THEN
    RAISE EXCEPTION 'hd_edu_private_items: kaynak parmak izi yalnız yeniden bağlama ile değişir' USING ERRCODE = '23514';
  END IF;
  -- Kullanıcı silinince FK'nin updated_by'ı NULL yapması dışında her güncelleme zaman damgası alır.
  IF (to_jsonb(NEW) - 'updated_by') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_by') OR NEW.updated_by IS NOT NULL THEN
    NEW.updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hd_edu_priv_item_guard ON public.hd_edu_private_items;
CREATE TRIGGER trg_hd_edu_priv_item_guard BEFORE INSERT OR UPDATE ON public.hd_edu_private_items
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_priv_item_guard();

-- Denetim: append-only. Tek istisna: owner purge (admin_purge_archived_expert) aynı tx'te uzman tenant'ını silerken.
CREATE OR REPLACE FUNCTION public.hd_edu_priv_audit_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_purge boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.tenant_id IS NOT NULL AND to_regprocedure('public.admin_purge_in_progress(uuid,uuid)') IS NOT NULL THEN
      EXECUTE 'SELECT public.admin_purge_in_progress(NULL::uuid, $1)' INTO v_purge USING OLD.tenant_id;
    END IF;
    IF v_purge IS TRUE THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'hd_edu_private_audit: silinemez' USING ERRCODE = '23514';
  END IF;
  RAISE EXCEPTION 'hd_edu_private_audit: değiştirilemez (append-only)' USING ERRCODE = '23514';
END $$;
DROP TRIGGER IF EXISTS trg_hd_edu_priv_audit_guard ON public.hd_edu_private_audit;
CREATE TRIGGER trg_hd_edu_priv_audit_guard BEFORE UPDATE OR DELETE ON public.hd_edu_private_audit
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_priv_audit_guard();

-- ─── Aktör çözümü ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hd_edu_priv_is_owner(p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce((
    SELECT u.is_super_admin IS TRUE AND lower(coalesce(u.role,'')) = 'admin' AND u.active IS TRUE
           AND coalesce(u.is_demo_account,false) IS FALSE
      FROM public.users u WHERE u.id = p_actor), false)
$$;

-- 'owner' | 'trainer' | NULL. Uygunsuzluk (rol / tenant değişimi) varsa etkin yetkiyi KALICI kapatır (erişim AÇAMAZ).
CREATE OR REPLACE FUNCTION public.hd_edu_priv_resolve_actor(p_actor uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE u public.users%ROWTYPE; v_open boolean;
BEGIN
  IF p_actor IS NULL THEN RETURN NULL; END IF;
  IF public.hd_edu_priv_is_owner(p_actor) THEN RETURN 'owner'; END IF;
  SELECT * INTO u FROM public.users WHERE id = p_actor;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- TEK YETKİ (FAZ 8): merkezî eğitim yetkisi. Uygunsuzluk (rol / tenant değişimi) varsa merkezî RPC yetkiyi KALICI kapatır.
  IF public.hd_education_auto_revoke_ineligible(p_actor) IS NOT NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hd_education_access_grants g
                  WHERE g.user_id = p_actor AND g.revoked_at IS NULL AND g.granted_tenant_id = u.tenant_id) THEN
    RETURN NULL;
  END IF;
  IF lower(coalesce(u.role,'')) <> 'expert' OR u.is_super_admin IS TRUE OR u.active IS NOT TRUE OR coalesce(u.is_demo_account,false)
     OR u.tenant_id IS NULL OR lower(coalesce(u.approval_status,'')) NOT IN ('approved','')
     OR coalesce(u.module_permissions ->> 'human_design','') <> 'true' THEN
    RETURN NULL;
  END IF;
  -- Owner'ın özel arşiv acil kapatma anahtarı (yetki değil; dağıtım / güvenlik anahtarı).
  SELECT archive_open INTO v_open FROM public.hd_edu_private_control WHERE id = 1;
  IF v_open IS NOT TRUE THEN RETURN NULL; END IF;
  RETURN 'trainer';
END $$;

-- Ortak: aktör bu kayda erişebilir mi? (owner her kayıt; eğitmen yalnız kendi tenant'ı + kendi kaydı)
CREATE OR REPLACE FUNCTION public.hd_edu_priv_can_touch(p_kind text, p_actor uuid, p_tenant uuid, p_trainer uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE
    WHEN p_kind = 'owner' THEN true
    WHEN p_kind = 'trainer' THEN EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_actor AND u.tenant_id = p_tenant)
                                 AND (p_trainer IS NULL OR p_trainer = p_actor)
    ELSE false END
$$;

-- Kayıt erişim durumu: her okumada DB'de yeniden hesaplanır.
CREATE OR REPLACE FUNCTION public.hd_edu_priv_item_state(p_item uuid, p_check_evidence boolean) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE i public.hd_edu_private_items%ROWTYPE; k public.hd_edu_private_consents%ROWTYPE; e record; c record;
BEGIN
  SELECT * INTO i FROM public.hd_edu_private_items WHERE id = p_item;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  -- FAZ 14: kurgusal kayıt izne / danışana / kaynak haritaya bağlı değildir; yalnız kendi hesap sonucu.
  IF i.item_kind = 'kurgusal' THEN
    RETURN CASE WHEN jsonb_typeof(i.fic_chart) = 'object' THEN 'ok' ELSE 'source_changed' END;
  END IF;
  SELECT * INTO k FROM public.hd_edu_private_consents WHERE id = i.consent_id;
  IF NOT FOUND OR k.tenant_id <> i.tenant_id OR k.hd_client_id <> i.hd_client_id THEN RETURN 'consent_invalid'; END IF;
  IF k.withdrawn_at IS NOT NULL THEN RETURN 'consent_withdrawn'; END IF;
  IF i.display_mode = 'named' AND k.display_scope <> 'acik_isim' THEN RETURN 'consent_invalid'; END IF;
  -- FAZ 14: eğitmen beyanında kanıt dosyası YOKTUR (beyan metni sürümü + SHA ile kayıtlı); belgeli yöntemlerde kanıt doğrulanır.
  IF k.method = 'egitmen_beyani' THEN
    IF NOT EXISTS (SELECT 1 FROM public.hd_edu_private_consent_texts t WHERE t.version = k.text_version AND t.body_sha256 = k.text_sha256) THEN
      RETURN 'consent_invalid';
    END IF;
  ELSE
  SELECT ev.sha256, ev.mime, ev.byte_size, ev.tenant_id,
         CASE WHEN p_check_evidence THEN encode(sha256(ev.content), 'hex') ELSE ev.sha256 END AS actual,
         octet_length(ev.content) AS len
    INTO e FROM public.hd_edu_private_consent_evidence ev WHERE ev.consent_id = k.id;
  IF NOT FOUND OR e.tenant_id <> k.tenant_id OR e.len <> e.byte_size OR e.actual <> e.sha256 THEN RETURN 'evidence_invalid'; END IF;
  END IF;
  SELECT ch.tenant_id, ch.client_id, ch.source, ch.computed_result IS NOT NULL AS has_result INTO c
    FROM public.human_design_charts ch WHERE ch.id = i.source_chart_id;
  IF NOT FOUND OR c.tenant_id IS DISTINCT FROM i.tenant_id OR c.client_id IS DISTINCT FROM i.hd_client_id
     OR c.source IS DISTINCT FROM 'computed' OR NOT c.has_result THEN
    RETURN 'source_changed';
  END IF;
  IF public.hd_edu_priv_chart_fp(i.source_chart_id) IS DISTINCT FROM i.source_fingerprint THEN RETURN 'source_changed'; END IF;
  RETURN 'ok';
END $$;

-- ─── RPC: owner yönetimi ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hd_edu_priv_owner_set_open(p_actor uuid, p_open boolean, p_reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT public.hd_edu_priv_is_owner(p_actor) THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  IF p_open IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: eksik parametre' USING ERRCODE = 'EP001'; END IF;
  UPDATE public.hd_edu_private_control
     SET archive_open = p_open, changed_by = p_actor, changed_at = now(), reason = nullif(btrim(coalesce(p_reason,'')),'')
   WHERE id = 1;
  INSERT INTO public.hd_edu_private_audit (actor_kind, actor_user_id, action)
  VALUES ('owner', p_actor, CASE WHEN p_open THEN 'archive_opened' ELSE 'archive_closed' END);
  RETURN p_open;
END $$;

CREATE OR REPLACE FUNCTION public.hd_edu_priv_owner_approve_text(p_actor uuid, p_version text, p_legal_ref text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT public.hd_edu_priv_is_owner(p_actor) THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  IF nullif(btrim(coalesce(p_legal_ref,'')),'') IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: hukuk referansı zorunlu' USING ERRCODE = 'EP019'; END IF;
  UPDATE public.hd_edu_private_consent_texts
     SET approved_for_use = true, approved_by = p_actor, approved_at = now(), legal_ref = btrim(p_legal_ref)
   WHERE version = p_version AND approved_for_use = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'hd_edu_priv: metin bulunamadı veya zaten onaylı' USING ERRCODE = 'EP004'; END IF;
  INSERT INTO public.hd_edu_private_audit (actor_kind, actor_user_id, action, detail)
  VALUES ('owner', p_actor, 'text_approved', jsonb_build_object('surum', p_version));
  RETURN p_version;
END $$;

-- Owner genel bakış: anahtar + metinler + yetkiler + eğitmen bazında kayıt sayıları (içerik YOK).
CREATE OR REPLACE FUNCTION public.hd_edu_priv_owner_overview(p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT public.hd_edu_priv_is_owner(p_actor) THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  RETURN jsonb_build_object(
    'archive_open', (SELECT archive_open FROM public.hd_edu_private_control WHERE id = 1),
    'texts', coalesce((SELECT jsonb_agg(jsonb_build_object('version', t.version, 'title', t.title, 'approved', t.approved_for_use,
                         'approved_at', t.approved_at, 'sha256', t.body_sha256) ORDER BY t.version) FROM public.hd_edu_private_consent_texts t), '[]'::jsonb),
    'grants', coalesce((SELECT jsonb_agg(jsonb_build_object('user_id', g.user_id, 'name', coalesce(u.full_name, u.name, ''),
                          'granted_at', g.granted_at, 'items', (SELECT count(*) FROM public.hd_edu_private_items i WHERE i.trainer_user_id = g.user_id))
                          ORDER BY g.granted_at DESC)
                         FROM public.hd_education_access_grants g JOIN public.users u ON u.id = g.user_id WHERE g.revoked_at IS NULL), '[]'::jsonb),
    'trainers', coalesce((SELECT jsonb_agg(jsonb_build_object('user_id', x.trainer_user_id, 'name', coalesce(u.full_name, u.name, ''), 'items', x.n)
                            ORDER BY coalesce(u.full_name, u.name, ''))
                           FROM (SELECT trainer_user_id, count(*) AS n FROM public.hd_edu_private_items GROUP BY trainer_user_id) x
                           JOIN public.users u ON u.id = x.trainer_user_id), '[]'::jsonb)
  );
END $$;

-- ─── RPC: izin ────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hd_edu_priv_consent_text(p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_kind text := public.hd_edu_priv_resolve_actor(p_actor);
BEGIN
  IF v_kind IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  RETURN (SELECT jsonb_build_object('version', t.version, 'title', t.title, 'body', t.body, 'sha256', t.body_sha256)
            FROM public.hd_edu_private_consent_texts t WHERE t.approved_for_use AND t.version LIKE 'hd-egitim-izin-%'
           ORDER BY t.approved_at DESC LIMIT 1);
END $$;

-- FAZ 14: gerçek danışan için eğitmen beyanı metni (owner + hukuk onaylı en güncel sürüm; yoksa NULL → beyan yolu kapalı).
CREATE OR REPLACE FUNCTION public.hd_edu_priv_declaration_text(p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_kind text := public.hd_edu_priv_resolve_actor(p_actor);
BEGIN
  IF v_kind IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  RETURN (SELECT jsonb_build_object('version', t.version, 'title', t.title, 'body', t.body, 'sha256', t.body_sha256)
            FROM public.hd_edu_private_consent_texts t WHERE t.approved_for_use AND t.version LIKE 'hd-egitim-beyan-%'
           ORDER BY t.approved_at DESC LIMIT 1);
END $$;

CREATE OR REPLACE FUNCTION public.hd_edu_priv_consent_record(
  p_actor uuid, p_hd_client uuid, p_consenter_name text, p_relation text, p_display_scope text, p_include_birth boolean,
  p_named_confirmed boolean, p_text_version text, p_text_sha256 text, p_given_on date, p_method text,
  p_evidence_b64 text, p_evidence_mime text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_kind text := public.hd_edu_priv_resolve_actor(p_actor); v_tenant uuid; v_bytes bytea; v_id uuid; v_head text;
BEGIN
  IF v_kind IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  -- Kayıt yalnız aktörün KENDİ tenant'ında (owner dahil: başka eğitmen adına izin / kayıt oluşturulamaz).
  SELECT tenant_id INTO v_tenant FROM public.users WHERE id = p_actor;
  IF v_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.human_design_clients c WHERE c.id = p_hd_client AND c.tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'hd_edu_priv: bulunamadı' USING ERRCODE = 'EP004';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hd_edu_private_consent_texts t
                  WHERE t.version = p_text_version AND t.approved_for_use AND t.body_sha256 = lower(coalesce(p_text_sha256,''))) THEN
    RAISE EXCEPTION 'hd_edu_priv: izin metni sürümü geçersiz veya kullanıma onaylı değil' USING ERRCODE = 'EP010';
  END IF;
  IF p_given_on IS NULL OR p_given_on > current_date THEN RAISE EXCEPTION 'hd_edu_priv: izin tarihi geçersiz' USING ERRCODE = 'EP019'; END IF;
  IF p_display_scope = 'acik_isim' AND (p_named_confirmed IS NOT TRUE OR p_method NOT IN ('islak_imza_tarama','e_imza','egitmen_beyani')) THEN
    RAISE EXCEPTION 'hd_edu_priv: açık isim için ayrı teyit ve imzalı yöntem gerekir' USING ERRCODE = 'EP012';
  END IF;
  -- FAZ 14: eğitmen beyanı ↔ beyan metni; belgeli yöntem ↔ izin metni (karıştırılamaz).
  IF (p_method = 'egitmen_beyani') <> (p_text_version LIKE 'hd-egitim-beyan-%') THEN
    RAISE EXCEPTION 'hd_edu_priv: izin metni sürümü geçersiz veya kullanıma onaylı değil' USING ERRCODE = 'EP010';
  END IF;
  IF p_method = 'egitmen_beyani' THEN
    -- Beyanda dosya YOK (gönderilirse reddedilir — sessizce yok sayılmaz).
    IF nullif(coalesce(p_evidence_b64,''),'') IS NOT NULL OR nullif(coalesce(p_evidence_mime,''),'') IS NOT NULL THEN
      RAISE EXCEPTION 'hd_edu_priv: beyan yolunda dosya gönderilmez' USING ERRCODE = 'EP011';
    END IF;
    INSERT INTO public.hd_edu_private_consents (tenant_id, hd_client_id, consenter_name, consenter_relation, display_scope,
             include_birth_data, named_confirmed, text_version, text_sha256, given_on, method, recorded_by)
    VALUES (v_tenant, p_hd_client, btrim(p_consenter_name), p_relation, p_display_scope, coalesce(p_include_birth,false),
            coalesce(p_named_confirmed,false), p_text_version, lower(p_text_sha256), p_given_on, p_method, p_actor)
    RETURNING id INTO v_id;
    INSERT INTO public.hd_edu_private_audit (tenant_id, actor_kind, actor_user_id, action, consent_id, detail)
    VALUES (v_tenant, v_kind, p_actor, 'consent_recorded', v_id,
            jsonb_build_object('kapsam', p_display_scope, 'dogum_verisi', coalesce(p_include_birth,false), 'yontem', p_method, 'surum', p_text_version));
    RETURN v_id;
  END IF;
  BEGIN
    v_bytes := decode(coalesce(p_evidence_b64,''), 'base64');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'hd_edu_priv: kanıt dosyası okunamadı' USING ERRCODE = 'EP011';
  END;
  IF octet_length(v_bytes) < 64 OR octet_length(v_bytes) > 2097152 THEN
    RAISE EXCEPTION 'hd_edu_priv: kanıt dosyası boyutu geçersiz' USING ERRCODE = 'EP011';
  END IF;
  v_head := encode(substring(v_bytes FROM 1 FOR 8), 'hex');
  IF NOT ((p_evidence_mime = 'application/pdf' AND v_head LIKE '255044462d%')
       OR (p_evidence_mime = 'image/png' AND v_head = '89504e470d0a1a0a')
       OR (p_evidence_mime = 'image/jpeg' AND v_head LIKE 'ffd8ff%')) THEN
    RAISE EXCEPTION 'hd_edu_priv: kanıt dosyası türü içerikle uyuşmuyor' USING ERRCODE = 'EP011';
  END IF;
  INSERT INTO public.hd_edu_private_consents (tenant_id, hd_client_id, consenter_name, consenter_relation, display_scope,
           include_birth_data, named_confirmed, text_version, text_sha256, given_on, method, recorded_by)
  VALUES (v_tenant, p_hd_client, btrim(p_consenter_name), p_relation, p_display_scope, coalesce(p_include_birth,false),
          coalesce(p_named_confirmed,false), p_text_version, lower(p_text_sha256), p_given_on, p_method, p_actor)
  RETURNING id INTO v_id;
  INSERT INTO public.hd_edu_private_consent_evidence (consent_id, tenant_id, mime, byte_size, sha256, content)
  VALUES (v_id, v_tenant, p_evidence_mime, octet_length(v_bytes), encode(sha256(v_bytes), 'hex'), v_bytes);
  INSERT INTO public.hd_edu_private_audit (tenant_id, actor_kind, actor_user_id, action, consent_id, detail)
  VALUES (v_tenant, v_kind, p_actor, 'consent_recorded', v_id,
          jsonb_build_object('kapsam', p_display_scope, 'dogum_verisi', coalesce(p_include_birth,false), 'yontem', p_method, 'surum', p_text_version));
  RETURN v_id;
EXCEPTION WHEN check_violation OR not_null_violation THEN
  RAISE EXCEPTION 'hd_edu_priv: alan değeri geçersiz' USING ERRCODE = 'EP019';
END $$;

-- İzin listesi (danışan bazında; eğitmen yalnız kendi tenant'ı). Kanıt içeriği DÖNMEZ.
CREATE OR REPLACE FUNCTION public.hd_edu_priv_consent_list(p_actor uuid, p_hd_client uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_kind text := public.hd_edu_priv_resolve_actor(p_actor); v_tenant uuid;
BEGIN
  IF v_kind IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.human_design_clients WHERE id = p_hd_client;
  IF v_tenant IS NULL OR NOT public.hd_edu_priv_can_touch(v_kind, p_actor, v_tenant, NULL) THEN
    RAISE EXCEPTION 'hd_edu_priv: bulunamadı' USING ERRCODE = 'EP004';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', k.id, 'consenter_name', k.consenter_name, 'relation', k.consenter_relation, 'display_scope', k.display_scope,
      'include_birth_data', k.include_birth_data, 'text_version', k.text_version, 'given_on', k.given_on, 'method', k.method,
      'recorded_at', k.recorded_at, 'withdrawn_at', k.withdrawn_at, 'withdraw_channel', k.withdraw_channel,
      'evidence', (SELECT jsonb_build_object('mime', e.mime, 'byte_size', e.byte_size, 'sha256', e.sha256) FROM public.hd_edu_private_consent_evidence e WHERE e.consent_id = k.id),
      'items', (SELECT count(*) FROM public.hd_edu_private_items i WHERE i.consent_id = k.id)) ORDER BY k.recorded_at DESC)
    FROM public.hd_edu_private_consents k WHERE k.hd_client_id = p_hd_client AND k.tenant_id = v_tenant), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.hd_edu_priv_consent_evidence_get(p_actor uuid, p_consent uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_kind text := public.hd_edu_priv_resolve_actor(p_actor); e public.hd_edu_private_consent_evidence%ROWTYPE;
BEGIN
  IF v_kind IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  SELECT * INTO e FROM public.hd_edu_private_consent_evidence WHERE consent_id = p_consent;
  IF NOT FOUND OR NOT public.hd_edu_priv_can_touch(v_kind, p_actor, e.tenant_id, NULL) THEN
    RAISE EXCEPTION 'hd_edu_priv: bulunamadı' USING ERRCODE = 'EP004';
  END IF;
  IF encode(sha256(e.content), 'hex') <> e.sha256 OR octet_length(e.content) <> e.byte_size THEN
    RAISE EXCEPTION 'hd_edu_priv: kanıt dosyası bozuk' USING ERRCODE = 'EP011';
  END IF;
  RETURN jsonb_build_object('mime', e.mime, 'sha256', e.sha256, 'b64', encode(e.content, 'base64'));
END $$;

CREATE OR REPLACE FUNCTION public.hd_edu_priv_consent_withdraw(p_actor uuid, p_consent uuid, p_channel text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_kind text := public.hd_edu_priv_resolve_actor(p_actor); k public.hd_edu_private_consents%ROWTYPE; v_n integer;
BEGIN
  IF v_kind IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  SELECT * INTO k FROM public.hd_edu_private_consents WHERE id = p_consent FOR UPDATE;
  IF NOT FOUND OR NOT public.hd_edu_priv_can_touch(v_kind, p_actor, k.tenant_id, NULL) THEN
    RAISE EXCEPTION 'hd_edu_priv: bulunamadı' USING ERRCODE = 'EP004';
  END IF;
  IF k.withdrawn_at IS NOT NULL THEN RAISE EXCEPTION 'hd_edu_priv: izin zaten geri çekilmiş' USING ERRCODE = 'EP013'; END IF;
  IF p_channel NOT IN ('danisan_talebi','egitmen_karari','owner_karari') OR (p_channel = 'owner_karari' AND v_kind <> 'owner') THEN
    RAISE EXCEPTION 'hd_edu_priv: geçersiz geri çekme kanalı' USING ERRCODE = 'EP019';
  END IF;
  UPDATE public.hd_edu_private_consents SET withdrawn_at = now(), withdrawn_by = p_actor, withdraw_channel = p_channel WHERE id = k.id;
  SELECT count(*) INTO v_n FROM public.hd_edu_private_items WHERE consent_id = k.id;
  INSERT INTO public.hd_edu_private_audit (tenant_id, actor_kind, actor_user_id, action, consent_id, detail)
  VALUES (k.tenant_id, v_kind, p_actor, 'consent_withdrawn', k.id, jsonb_build_object('kanal', p_channel, 'kapanan_kayit', v_n));
  RETURN v_n;
END $$;

-- İzni (kanıt + bağlı eğitim kayıtları CASCADE) siler. Danışan / harita / analiz SİLİNMEZ.
CREATE OR REPLACE FUNCTION public.hd_edu_priv_consent_delete(p_actor uuid, p_consent uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_kind text := public.hd_edu_priv_resolve_actor(p_actor); k public.hd_edu_private_consents%ROWTYPE; v_items uuid[];
BEGIN
  IF v_kind IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  SELECT * INTO k FROM public.hd_edu_private_consents WHERE id = p_consent FOR UPDATE;
  IF NOT FOUND OR NOT public.hd_edu_priv_can_touch(v_kind, p_actor, k.tenant_id, NULL) THEN
    RAISE EXCEPTION 'hd_edu_priv: bulunamadı' USING ERRCODE = 'EP004';
  END IF;
  SELECT coalesce(array_agg(id), '{}') INTO v_items FROM public.hd_edu_private_items WHERE consent_id = k.id;
  DELETE FROM public.hd_edu_private_consents WHERE id = k.id;
  INSERT INTO public.hd_edu_private_audit (tenant_id, actor_kind, actor_user_id, action, consent_id, detail)
  VALUES (k.tenant_id, v_kind, p_actor, 'consent_deleted', k.id, jsonb_build_object('silinen_kayit', cardinality(v_items)));
  RETURN cardinality(v_items);
END $$;

-- ─── RPC: eğitim kayıtları ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hd_edu_priv_item_add(
  p_actor uuid, p_chart uuid, p_consent uuid, p_title text, p_alias text, p_display_mode text, p_category text,
  p_description text, p_notes text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_kind text := public.hd_edu_priv_resolve_actor(p_actor); v_tenant uuid; ch record; k public.hd_edu_private_consents%ROWTYPE;
        v_id uuid;
BEGIN
  IF v_kind IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.users WHERE id = p_actor;
  SELECT c.id, c.tenant_id, c.client_id, c.source, c.computed_result IS NOT NULL AS has_result INTO ch
    FROM public.human_design_charts c WHERE c.id = p_chart FOR SHARE;
  -- Başka tenant'ın haritası ile "hiç yok" AYNI yanıt (varlık sızdırılmaz).
  IF NOT FOUND OR v_tenant IS NULL OR ch.tenant_id IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'hd_edu_priv: bulunamadı' USING ERRCODE = 'EP004';
  END IF;
  IF ch.source IS DISTINCT FROM 'computed' OR NOT ch.has_result OR ch.client_id IS NULL THEN
    RAISE EXCEPTION 'hd_edu_priv: yalnız danışana bağlı, hesaplanmış kayıtlı harita eklenebilir' USING ERRCODE = 'EP014';
  END IF;
  SELECT * INTO k FROM public.hd_edu_private_consents WHERE id = p_consent FOR SHARE;
  IF NOT FOUND OR k.tenant_id <> v_tenant THEN RAISE EXCEPTION 'hd_edu_priv: bulunamadı' USING ERRCODE = 'EP004'; END IF;
  IF k.hd_client_id <> ch.client_id THEN RAISE EXCEPTION 'hd_edu_priv: izin bu haritanın danışanına ait değil' USING ERRCODE = 'EP015'; END IF;
  IF k.withdrawn_at IS NOT NULL THEN RAISE EXCEPTION 'hd_edu_priv: izin geri çekilmiş' USING ERRCODE = 'EP013'; END IF;
  IF coalesce(p_display_mode,'alias') = 'named' AND k.display_scope <> 'acik_isim' THEN
    RAISE EXCEPTION 'hd_edu_priv: izin açık isim kapsamı içermiyor' USING ERRCODE = 'EP012';
  END IF;
  IF k.method <> 'egitmen_beyani'
     AND NOT EXISTS (SELECT 1 FROM public.hd_edu_private_consent_evidence e WHERE e.consent_id = k.id AND encode(sha256(e.content),'hex') = e.sha256) THEN
    RAISE EXCEPTION 'hd_edu_priv: izin kanıtı geçersiz' USING ERRCODE = 'EP011';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hd_edu_private_items WHERE source_chart_id = p_chart) THEN
    RAISE EXCEPTION 'hd_edu_priv: bu harita zaten eğitim arşivinde' USING ERRCODE = 'EP016';
  END IF;
  INSERT INTO public.hd_edu_private_items (tenant_id, trainer_user_id, consent_id, hd_client_id, source_chart_id, source_fingerprint,
           title, alias_label, display_mode, category, description, teaching_notes, updated_by)
  VALUES (v_tenant, p_actor, k.id, ch.client_id, p_chart, public.hd_edu_priv_chart_fp(p_chart),
          btrim(coalesce(p_title,'')), btrim(coalesce(p_alias,'')), coalesce(p_display_mode,'alias'), coalesce(p_category,'genel'),
          nullif(btrim(coalesce(p_description,'')),''), nullif(btrim(coalesce(p_notes,'')),''), p_actor)
  RETURNING id INTO v_id;
  INSERT INTO public.hd_edu_private_audit (tenant_id, actor_kind, actor_user_id, action, item_id, consent_id)
  VALUES (v_tenant, v_kind, p_actor, 'item_added', v_id, k.id);
  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'hd_edu_priv: bu harita zaten eğitim arşivinde' USING ERRCODE = 'EP016';
  WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION 'hd_edu_priv: alan değeri geçersiz' USING ERRCODE = 'EP019';
END $$;

-- FAZ 14: kurgusal eğitim haritası. Hesap sonucu sunucu route'unda MEVCUT motorla (Roxy hattı) üretilir ve burada yalnız
-- saklanır; danışan / Danışan Yolculuğu / normal HD arşivi kaydı OLUŞMAZ. Eğitmenin kurgusal beyanı sürümüyle zorunludur.
-- Aynı eğitmen + aynı kurgusal girdi → mevcut kayıt (EP016; çoğaltma yok).
CREATE OR REPLACE FUNCTION public.hd_edu_priv_fictional_find(p_actor uuid, p_input_hash text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_kind text := public.hd_edu_priv_resolve_actor(p_actor); v_tenant uuid;
BEGIN
  IF v_kind IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.users WHERE id = p_actor;
  RETURN (SELECT id FROM public.hd_edu_private_items
           WHERE item_kind = 'kurgusal' AND trainer_user_id = p_actor AND tenant_id = v_tenant AND fic_input_hash = lower(coalesce(p_input_hash,'')));
END $$;

CREATE OR REPLACE FUNCTION public.hd_edu_priv_fictional_add(
  p_actor uuid, p_title text, p_alias text, p_category text, p_description text, p_notes text,
  p_input jsonb, p_chart jsonb, p_raw jsonb, p_input_hash text, p_declaration text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_kind text := public.hd_edu_priv_resolve_actor(p_actor); v_tenant uuid; v_id uuid;
BEGIN
  IF v_kind IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.users WHERE id = p_actor;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: bulunamadı' USING ERRCODE = 'EP004'; END IF;
  IF nullif(btrim(coalesce(p_declaration,'')),'') IS NULL THEN
    RAISE EXCEPTION 'hd_edu_priv: kurgusal beyan zorunlu' USING ERRCODE = 'EP019';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hd_edu_private_items WHERE item_kind = 'kurgusal' AND trainer_user_id = p_actor
              AND fic_input_hash = lower(coalesce(p_input_hash,''))) THEN
    RAISE EXCEPTION 'hd_edu_priv: bu kurgusal harita zaten eğitim arşivinde' USING ERRCODE = 'EP016';
  END IF;
  INSERT INTO public.hd_edu_private_items (tenant_id, trainer_user_id, item_kind, title, alias_label, display_mode, category,
           description, teaching_notes, updated_by, fic_input, fic_chart, fic_provider_raw, fic_input_hash, fic_declared_at, fic_declaration)
  VALUES (v_tenant, p_actor, 'kurgusal', btrim(coalesce(p_title,'')), btrim(coalesce(p_alias,'')), 'alias', coalesce(p_category,'genel'),
          nullif(btrim(coalesce(p_description,'')),''), nullif(btrim(coalesce(p_notes,'')),''), p_actor,
          p_input, p_chart, p_raw, lower(coalesce(p_input_hash,'')), now(), btrim(p_declaration))
  RETURNING id INTO v_id;
  INSERT INTO public.hd_edu_private_audit (tenant_id, actor_kind, actor_user_id, action, item_id, detail)
  VALUES (v_tenant, v_kind, p_actor, 'fictional_added', v_id, jsonb_build_object('beyan', btrim(p_declaration)));
  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'hd_edu_priv: bu kurgusal harita zaten eğitim arşivinde' USING ERRCODE = 'EP016';
  WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION 'hd_edu_priv: alan değeri geçersiz' USING ERRCODE = 'EP019';
END $$;

-- Yalnız eğitim alanları; CAS (p_expected_updated_at) ile kayıp güncelleme yok. Doğum / hesap verisi BURADA YOK.
CREATE OR REPLACE FUNCTION public.hd_edu_priv_item_update(p_actor uuid, p_item uuid, p_patch jsonb, p_expected_updated_at timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_kind text := public.hd_edu_priv_resolve_actor(p_actor); i public.hd_edu_private_items%ROWTYPE; k public.hd_edu_private_consents%ROWTYPE;
        v_keys text[]; v_bad text[]; v_mode text; v_at timestamptz;
BEGIN
  IF v_kind IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  SELECT * INTO i FROM public.hd_edu_private_items WHERE id = p_item FOR UPDATE;
  IF NOT FOUND OR NOT public.hd_edu_priv_can_touch(v_kind, p_actor, i.tenant_id, i.trainer_user_id) THEN
    RAISE EXCEPTION 'hd_edu_priv: bulunamadı' USING ERRCODE = 'EP004';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN RAISE EXCEPTION 'hd_edu_priv: eksik parametre' USING ERRCODE = 'EP001'; END IF;
  SELECT array_agg(k2) INTO v_keys FROM jsonb_object_keys(p_patch) k2;
  SELECT array_agg(x) INTO v_bad FROM unnest(coalesce(v_keys,'{}')) x
   WHERE x NOT IN ('title','alias_label','display_mode','category','description','teaching_notes');
  IF v_bad IS NOT NULL OR v_keys IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: düzenlenemeyen alan' USING ERRCODE = 'EP019'; END IF;
  IF p_expected_updated_at IS NULL OR i.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'hd_edu_priv: kayıt başka bir oturumda değişti' USING ERRCODE = 'EP017';
  END IF;
  v_mode := coalesce(p_patch ->> 'display_mode', i.display_mode);
  IF v_mode = 'named' THEN
    SELECT * INTO k FROM public.hd_edu_private_consents WHERE id = i.consent_id;
    IF k.display_scope <> 'acik_isim' OR k.withdrawn_at IS NOT NULL THEN
      RAISE EXCEPTION 'hd_edu_priv: izin açık isim kapsamı içermiyor' USING ERRCODE = 'EP012';
    END IF;
  END IF;
  UPDATE public.hd_edu_private_items SET
    title          = CASE WHEN p_patch ? 'title' THEN btrim(coalesce(p_patch ->> 'title','')) ELSE title END,
    alias_label    = CASE WHEN p_patch ? 'alias_label' THEN btrim(coalesce(p_patch ->> 'alias_label','')) ELSE alias_label END,
    display_mode   = v_mode,
    category       = CASE WHEN p_patch ? 'category' THEN coalesce(p_patch ->> 'category','genel') ELSE category END,
    description    = CASE WHEN p_patch ? 'description' THEN nullif(btrim(coalesce(p_patch ->> 'description','')),'') ELSE description END,
    teaching_notes = CASE WHEN p_patch ? 'teaching_notes' THEN nullif(btrim(coalesce(p_patch ->> 'teaching_notes','')),'') ELSE teaching_notes END,
    updated_by     = p_actor
  WHERE id = i.id RETURNING updated_at INTO v_at;
  INSERT INTO public.hd_edu_private_audit (tenant_id, actor_kind, actor_user_id, action, item_id, detail)
  VALUES (i.tenant_id, v_kind, p_actor, 'item_updated', i.id, jsonb_build_object('alanlar', to_jsonb(v_keys)));
  RETURN v_at;
EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION 'hd_edu_priv: alan değeri geçersiz' USING ERRCODE = 'EP019';
END $$;

-- Kaynak harita değiştiyse: eğitmen güncel hesabı bilinçli olarak yeniden bağlar (izin hâlâ geçerli olmalı).
CREATE OR REPLACE FUNCTION public.hd_edu_priv_item_rebind(p_actor uuid, p_item uuid)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_kind text := public.hd_edu_priv_resolve_actor(p_actor); i public.hd_edu_private_items%ROWTYPE; c record;
        k public.hd_edu_private_consents%ROWTYPE; v_fp text; v_at timestamptz;
BEGIN
  IF v_kind IS DISTINCT FROM 'trainer' AND v_kind IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  SELECT * INTO i FROM public.hd_edu_private_items WHERE id = p_item FOR UPDATE;
  -- Yeniden bağlama kaydın SAHİBİNE özgüdür (owner başka eğitmenin kaydını yeniden bağlayamaz; kaldırabilir).
  IF NOT FOUND OR i.trainer_user_id <> p_actor OR NOT public.hd_edu_priv_can_touch(v_kind, p_actor, i.tenant_id, i.trainer_user_id)
     OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_actor AND u.tenant_id = i.tenant_id) THEN
    RAISE EXCEPTION 'hd_edu_priv: bulunamadı' USING ERRCODE = 'EP004';
  END IF;
  IF i.item_kind = 'kurgusal' THEN RAISE EXCEPTION 'hd_edu_priv: kurgusal kayıt yeniden bağlanmaz' USING ERRCODE = 'EP014'; END IF;
  SELECT ch.tenant_id, ch.client_id, ch.source, ch.computed_result IS NOT NULL AS has_result INTO c FROM public.human_design_charts ch WHERE ch.id = i.source_chart_id;
  IF c.tenant_id IS DISTINCT FROM i.tenant_id OR c.client_id IS DISTINCT FROM i.hd_client_id OR c.source IS DISTINCT FROM 'computed' OR NOT c.has_result THEN
    RAISE EXCEPTION 'hd_edu_priv: kaynak harita artık uygun değil (kaldırın)' USING ERRCODE = 'EP014';
  END IF;
  SELECT * INTO k FROM public.hd_edu_private_consents WHERE id = i.consent_id;
  IF k.withdrawn_at IS NOT NULL THEN RAISE EXCEPTION 'hd_edu_priv: izin geri çekilmiş' USING ERRCODE = 'EP013'; END IF;
  v_fp := public.hd_edu_priv_chart_fp(i.source_chart_id);
  IF v_fp = i.source_fingerprint THEN RAISE EXCEPTION 'hd_edu_priv: kaynak değişmemiş' USING ERRCODE = 'EP020'; END IF;
  PERFORM set_config('hd_edu_priv.rebind', i.id::text, true);
  UPDATE public.hd_edu_private_items SET source_fingerprint = v_fp, updated_by = p_actor WHERE id = i.id RETURNING updated_at INTO v_at;
  PERFORM set_config('hd_edu_priv.rebind', '', true);
  INSERT INTO public.hd_edu_private_audit (tenant_id, actor_kind, actor_user_id, action, item_id)
  VALUES (i.tenant_id, v_kind, p_actor, 'item_rebound', i.id);
  RETURN v_at;
END $$;

-- Silme: yalnız eğitim kaydı (danışan / harita / analiz / izin DEĞİL). Hepsi-ya-hiçbiri; görünmeyen kimlik = "bulunamadı".
-- Onay sözleşmesi: p_confirm_count = kayıt sayısı; 3+ kayıtta p_confirm_phrase = '<N> KAYDI SİL' (lib/ui/bulkDeleteGuard).
CREATE OR REPLACE FUNCTION public.hd_edu_priv_item_delete(p_actor uuid, p_items jsonb, p_confirm_count integer, p_confirm_phrase text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_kind text := public.hd_edu_priv_resolve_actor(p_actor); v_n integer; v_ok integer; r record; v_ids uuid[];
BEGIN
  IF v_kind IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'hd_edu_priv: kayıt listesi geçersiz' USING ERRCODE = 'EP001'; END IF;
  BEGIN
    v_ids := ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(p_items) x);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'hd_edu_priv: kayıt listesi geçersiz' USING ERRCODE = 'EP001';
  END;
  v_n := coalesce(cardinality(v_ids), 0);
  IF v_n < 1 OR v_n > 100 OR (SELECT count(DISTINCT x) FROM unnest(v_ids) x) <> v_n THEN
    RAISE EXCEPTION 'hd_edu_priv: kayıt listesi geçersiz' USING ERRCODE = 'EP001';
  END IF;
  IF p_confirm_count IS DISTINCT FROM v_n
     OR (v_n >= 3 AND upper(regexp_replace(btrim(coalesce(p_confirm_phrase,'')), '\s+', ' ', 'g')) <> v_n::text || ' KAYDI SIL'
                  AND upper(regexp_replace(btrim(coalesce(p_confirm_phrase,'')), '\s+', ' ', 'g')) <> v_n::text || ' KAYDI SİL') THEN
    RAISE EXCEPTION 'hd_edu_priv: silme onayı eksik' USING ERRCODE = 'EP018';
  END IF;
  SELECT count(*) INTO v_ok FROM public.hd_edu_private_items i
   WHERE i.id = ANY (v_ids) AND public.hd_edu_priv_can_touch(v_kind, p_actor, i.tenant_id, i.trainer_user_id);
  IF v_ok <> v_n THEN RAISE EXCEPTION 'hd_edu_priv: bulunamadı' USING ERRCODE = 'EP004'; END IF;
  FOR r IN DELETE FROM public.hd_edu_private_items WHERE id = ANY (v_ids) RETURNING id, tenant_id, consent_id LOOP
    INSERT INTO public.hd_edu_private_audit (tenant_id, actor_kind, actor_user_id, action, item_id, consent_id)
    VALUES (r.tenant_id, v_kind, p_actor, 'item_deleted', r.id, r.consent_id);
  END LOOP;
  RETURN v_n;
END $$;

-- Liste: eğitmen yalnız KENDİ kayıtları; owner tümü (isteğe bağlı eğitmen filtresi). Notlar ve harita verisi DÖNMEZ.
CREATE OR REPLACE FUNCTION public.hd_edu_priv_item_list(p_actor uuid, p_trainer uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_kind text := public.hd_edu_priv_resolve_actor(p_actor); v_tenant uuid;
BEGIN
  IF v_kind IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.users WHERE id = p_actor;
  RETURN coalesce((
    SELECT jsonb_agg(x.j ORDER BY x.created_at DESC) FROM (
      SELECT i.created_at, jsonb_build_object(
        'id', i.id, 'title', i.title, 'alias_label', i.alias_label, 'display_mode', i.display_mode, 'category', i.category,
        'description', i.description, 'created_at', i.created_at, 'updated_at', i.updated_at,
        'state', s.state, 'kind', i.item_kind,
        'type_code', CASE WHEN s.state <> 'ok' THEN NULL WHEN i.item_kind = 'kurgusal' THEN i.fic_chart #>> '{appCodes,type_code}' ELSE ch.type_code END,
        'profile_code', CASE WHEN s.state <> 'ok' THEN NULL WHEN i.item_kind = 'kurgusal' THEN i.fic_chart #>> '{appCodes,profile_code}' ELSE ch.profile_code END,
        'authority_code', CASE WHEN s.state <> 'ok' THEN NULL WHEN i.item_kind = 'kurgusal' THEN i.fic_chart #>> '{appCodes,authority_code}' ELSE ch.authority_code END,
        'trainer', CASE WHEN v_kind = 'owner' THEN jsonb_build_object('user_id', u.id, 'name', coalesce(u.full_name, u.name, '')) END,
        'consent', CASE WHEN v_kind = 'owner' AND k.id IS NOT NULL THEN jsonb_build_object('id', k.id, 'display_scope', k.display_scope, 'withdrawn_at', k.withdrawn_at,
                                                                                       'given_on', k.given_on, 'method', k.method) END
      ) AS j
      FROM public.hd_edu_private_items i
      LEFT JOIN public.hd_edu_private_consents k ON k.id = i.consent_id
      JOIN public.users u ON u.id = i.trainer_user_id
      LEFT JOIN public.human_design_charts ch ON ch.id = i.source_chart_id
      CROSS JOIN LATERAL (SELECT public.hd_edu_priv_item_state(i.id, false) AS state) s
      WHERE (v_kind = 'owner' AND (p_trainer IS NULL OR i.trainer_user_id = p_trainer))
         OR (v_kind = 'trainer' AND i.tenant_id = v_tenant AND i.trainer_user_id = p_actor)
    ) x), '[]'::jsonb);
END $$;

-- Ayrıntı: durum her okumada (kanıt SHA-256 dahil) doğrulanır. Durum 'ok' değilse harita verisi DÖNMEZ.
-- Doğum verisi yalnız izin kapsamı içeriyorsa; gerçek isim yalnız 'named' + açık isim izni varsa (kopya değil, güncel danışan adı).
CREATE OR REPLACE FUNCTION public.hd_edu_priv_item_get(p_actor uuid, p_item uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_kind text := public.hd_edu_priv_resolve_actor(p_actor); i public.hd_edu_private_items%ROWTYPE; k public.hd_edu_private_consents%ROWTYPE;
        v_state text; v_chart jsonb := NULL; v_name text := NULL; u record;
BEGIN
  IF v_kind IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  SELECT * INTO i FROM public.hd_edu_private_items WHERE id = p_item;
  IF NOT FOUND OR NOT public.hd_edu_priv_can_touch(v_kind, p_actor, i.tenant_id, i.trainer_user_id) THEN RETURN NULL; END IF;
  SELECT * INTO k FROM public.hd_edu_private_consents WHERE id = i.consent_id;
  SELECT id, coalesce(full_name, name, '') AS name INTO u FROM public.users WHERE id = i.trainer_user_id;
  v_state := public.hd_edu_priv_item_state(i.id, true);
  IF v_state = 'ok' AND i.item_kind = 'kurgusal' THEN
    -- Kurgusal: hesap sonucu kaydın kendisinde; doğum bilgisi KURGUSALDIR (gerçek kişiye ait değil) → künyede gösterilir.
    v_chart := jsonb_build_object(
      'id', NULL, 'provider', 'roxyapi', 'computed_result', i.fic_chart, 'provider_raw', i.fic_provider_raw,
      'type_code', i.fic_chart #>> '{appCodes,type_code}', 'authority_code', i.fic_chart #>> '{appCodes,authority_code}',
      'profile_code', i.fic_chart #>> '{appCodes,profile_code}', 'definition_code', i.fic_chart #>> '{appCodes,definition_code}',
      'birth', jsonb_build_object('date', i.fic_input -> 'date', 'time', i.fic_input -> 'time', 'place', i.fic_input -> 'place', 'timezone', i.fic_input -> 'timezone'));
  ELSIF v_state = 'ok' THEN
    -- to_jsonb(satır): provider / provider_raw kolonları eski şemada yoksa NULL (fonksiyon kırılmaz).
    SELECT jsonb_build_object(
             'id', j -> 'id', 'provider', j -> 'provider', 'computed_result', j -> 'computed_result', 'provider_raw', j -> 'provider_raw',
             'type_code', j -> 'type_code', 'authority_code', j -> 'authority_code', 'profile_code', j -> 'profile_code',
             'definition_code', j -> 'definition_code',
             'birth', CASE WHEN k.include_birth_data THEN jsonb_build_object('date', j -> 'birth_date', 'time', j -> 'birth_time',
                                                                             'place', j -> 'birth_place', 'timezone', j -> 'timezone') END)
      INTO v_chart
      FROM (SELECT to_jsonb(c) AS j FROM public.human_design_charts c WHERE c.id = i.source_chart_id) ch;
    IF i.display_mode = 'named' AND k.display_scope = 'acik_isim' THEN
      SELECT name INTO v_name FROM public.human_design_clients WHERE id = i.hd_client_id;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'actor', v_kind, 'state', v_state, 'kind', i.item_kind,
    'fictional', CASE WHEN i.item_kind = 'kurgusal' THEN jsonb_build_object('declared_at', i.fic_declared_at, 'declaration', i.fic_declaration) END,
    'item', jsonb_build_object('id', i.id, 'title', i.title, 'alias_label', i.alias_label, 'display_mode', i.display_mode, 'category', i.category,
              'description', i.description, 'teaching_notes', i.teaching_notes, 'created_at', i.created_at, 'updated_at', i.updated_at),
    'display_name', CASE WHEN v_name IS NOT NULL THEN v_name ELSE i.alias_label END,
    'trainer', jsonb_build_object('user_id', u.id, 'name', u.name),
    -- FAZ 7: izin verenin adı ayrıntı yanıtında YOK (eğitimde ekran paylaşımında görünmesin); kaynak danışan / harita kimliği YOK.
    'consent', CASE WHEN k.id IS NOT NULL THEN jsonb_build_object('id', k.id, 'relation', k.consenter_relation, 'display_scope', k.display_scope,
              'include_birth_data', k.include_birth_data, 'text_version', k.text_version, 'given_on', k.given_on, 'method', k.method,
              'recorded_at', k.recorded_at, 'withdrawn_at', k.withdrawn_at, 'withdraw_channel', k.withdraw_channel) END,
    'chart', v_chart);
END $$;

-- Aktör yoklaması (sunucu kapısı için): 'owner' | 'trainer' | NULL.
CREATE OR REPLACE FUNCTION public.hd_edu_priv_whoami(p_actor uuid)
RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT public.hd_edu_priv_resolve_actor(p_actor)
$$;

-- FAZ 7 (D akışı): kaynak harita uygunluk yoklaması — yalnız aktörün KENDİ tenant'ındaki harita; başka tenant = "yok".
CREATE OR REPLACE FUNCTION public.hd_edu_priv_chart_status(p_actor uuid, p_chart uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_kind text := public.hd_edu_priv_resolve_actor(p_actor); v_tenant uuid; ch record; v_item uuid;
BEGIN
  IF v_kind IS NULL THEN RAISE EXCEPTION 'hd_edu_priv: yetkisiz aktör' USING ERRCODE = 'EP002'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.users WHERE id = p_actor;
  SELECT c.id, c.tenant_id, c.client_id, c.source, c.computed_result IS NOT NULL AS has_result INTO ch FROM public.human_design_charts c WHERE c.id = p_chart;
  IF NOT FOUND OR v_tenant IS NULL OR ch.tenant_id IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'hd_edu_priv: bulunamadı' USING ERRCODE = 'EP004';
  END IF;
  SELECT id INTO v_item FROM public.hd_edu_private_items WHERE source_chart_id = p_chart;
  RETURN jsonb_build_object(
    'eligible', ch.source = 'computed' AND ch.has_result AND ch.client_id IS NOT NULL AND v_item IS NULL,
    'reason', CASE WHEN v_item IS NOT NULL THEN 'duplicate'
                   WHEN ch.source IS DISTINCT FROM 'computed' OR NOT ch.has_result THEN 'not_computed'
                   WHEN ch.client_id IS NULL THEN 'no_client' ELSE NULL END,
    'item_id', v_item, 'hd_client_id', ch.client_id);
END $$;

-- ─── İzin metni v1 (TASLAK — owner + hukuk onayı olmadan KULLANILAMAZ: approved_for_use = false) ──
INSERT INTO public.hd_edu_private_consent_texts (version, title, body, body_sha256)
SELECT v.version, v.title, v.body, encode(sha256(convert_to(v.body, 'UTF8')), 'hex')
  FROM (VALUES ('hd-egitim-izin-v1', 'Human Design haritamın eğitim örneği olarak kullanılmasına izin (TASLAK v1)',
$txt$TASLAK — HUKUK İNCELEMESİ BEKLİYOR. Bu metin owner ve hukuk uzmanı onaylamadan kullanılamaz.

1. Amaç: Danışmanım/eğitmenim tarafından benim için hazırlanmış Human Design haritamın, yalnız onun kendi düzenlediği Human Design eğitimlerinde öğretim örneği olarak gösterilmesine izin veriyorum.
2. Kapsam: Haritam başka eğitmenlerle paylaşılmaz, herkese açık bir katalogda yayımlanmaz, satılmaz. Kayıt Yaşam Sistemi'nde yalnız eğitmenim ve platformun sistem sahibi (yönetim ve denetim amacıyla) tarafından görülebilir.
3. Sunum: Varsayılan olarak adım GÖSTERİLMEZ; takma ad kullanılır. Adımın gösterilmesi ancak bu formda ayrıca işaretlediğim açık isim iznine bağlıdır. Doğum tarihi, saati ve yerimin gösterilmesi de ayrı bir seçimdir.
4. Süre ve geri çekme: Bu izni dilediğim zaman, gerekçe göstermeden, eğitmenime yazılı olarak bildirerek geri çekebilirim. Geri çekme kaydedildiği anda haritam eğitim arşivinde erişime kapanır; eğitmenim kaydı kaldırır.
5. Kayıt: Bu iznin tarihi, metin sürümü ve imzalı kopyası, izni kanıtlamak amacıyla güvenli biçimde saklanır.
6. İzni veren: Danışanın kendisi veya yasal temsilcisi. Ad soyad, tarih ve imza bu metnin imzalı kopyasında yer alır.$txt$)) AS v(version, title, body)
ON CONFLICT (version) DO NOTHING;

-- ─── FAZ 14: Eğitmen beyanı metni v1 (TASLAK — hukukçu değerlendirip owner onaylamadan KULLANILAMAZ) ──
INSERT INTO public.hd_edu_private_consent_texts (version, title, body, body_sha256)
SELECT v.version, v.title, v.body, encode(sha256(convert_to(v.body, 'UTF8')), 'hex')
  FROM (VALUES ('hd-egitim-beyan-v1', 'Eğitmen beyanı: gerçek danışan haritasının eğitim amacıyla kullanımı (TASLAK v1)',
$txt$TASLAK — HUKUK İNCELEMESİ BEKLİYOR. Bu metin owner ve hukuk uzmanı onaylamadan kullanılamaz.

Bu haritayı eğitim amacıyla kullanmak için gerekli izne veya hukuki dayanağa sahip olduğumu beyan ederim.

- Harita yalnız benim kendi düzenlediğim Human Design eğitimlerinde öğretim örneği olarak gösterilir; başka eğitmenlerle paylaşılmaz, yayımlanmaz, satılmaz.
- Varsayılan sunum takma addır. Danışanın adı, doğum tarihi, saati ve yeri yalnız ayrıca işaretlediğim açık yetkiyle gösterilir.
- Danışan iznini geri çektiğinde bunu sisteme kaydederim; kayıt anında eğitim arşivinde erişime kapanır.
- Bu beyan, tarihi, beyan metni sürümü ve seçtiğim kapsamla birlikte kayıt altına alınır. Beyanım, danışanın izin verdiğinin tek başına kesin kanıtı sayılmaz; izni veya hukuki dayanağı gerektiğinde gösterebilmek benim sorumluluğumdadır.$txt$)) AS v(version, title, body)
ON CONFLICT (version) DO NOTHING;

-- ─── Ayrıcalıklar: hiçbir role TABLO ayrıcalığı yok; yalnız service_role belirli RPC'leri çalıştırır ─
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hd_edu_private_control','hd_edu_private_consent_texts','hd_edu_private_consents',
                           'hd_edu_private_consent_evidence','hd_edu_private_items','hd_edu_private_audit'] LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DO $$
DECLARE f text;
BEGIN
  -- İç yardımcılar + tetikleyiciler: hiç kimse doğrudan çalıştıramaz.
  FOREACH f IN ARRAY ARRAY[
    'public.hd_edu_priv_text_guard()', 'public.hd_edu_priv_consent_guard()',
    'public.hd_edu_priv_evidence_guard()', 'public.hd_edu_priv_item_guard()', 'public.hd_edu_priv_audit_guard()',
    'public.hd_edu_priv_chart_fp(uuid)', 'public.hd_edu_priv_is_owner(uuid)', 'public.hd_edu_priv_resolve_actor(uuid)',
    'public.hd_edu_priv_can_touch(text, uuid, uuid, uuid)', 'public.hd_edu_priv_item_state(uuid, boolean)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;
  -- API RPC'leri: yalnız service_role (sunucu route'ları; aktör oturum token'ıyla eşleştirildikten SONRA verilir).
  FOREACH f IN ARRAY ARRAY[
    'public.hd_edu_priv_whoami(uuid)',
    'public.hd_edu_priv_owner_set_open(uuid, boolean, text)', 'public.hd_edu_priv_owner_approve_text(uuid, text, text)',
    'public.hd_edu_priv_owner_overview(uuid)',
    'public.hd_edu_priv_consent_text(uuid)', 'public.hd_edu_priv_declaration_text(uuid)',
    'public.hd_edu_priv_fictional_find(uuid, text)',
    'public.hd_edu_priv_fictional_add(uuid, text, text, text, text, text, jsonb, jsonb, jsonb, text, text)',
    'public.hd_edu_priv_consent_record(uuid, uuid, text, text, text, boolean, boolean, text, text, date, text, text, text)',
    'public.hd_edu_priv_consent_list(uuid, uuid)', 'public.hd_edu_priv_consent_evidence_get(uuid, uuid)',
    'public.hd_edu_priv_consent_withdraw(uuid, uuid, text)', 'public.hd_edu_priv_consent_delete(uuid, uuid)',
    'public.hd_edu_priv_item_add(uuid, uuid, uuid, text, text, text, text, text, text)',
    'public.hd_edu_priv_item_update(uuid, uuid, jsonb, timestamptz)', 'public.hd_edu_priv_item_rebind(uuid, uuid)',
    'public.hd_edu_priv_item_delete(uuid, jsonb, integer, text)', 'public.hd_edu_priv_item_list(uuid, uuid)',
    'public.hd_edu_priv_item_get(uuid, uuid)', 'public.hd_edu_priv_chart_status(uuid, uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma):
--   SELECT archive_open FROM public.hd_edu_private_control;                                  -- false
--   SELECT version, approved_for_use FROM public.hd_edu_private_consent_texts;              -- izin-v1 + beyan-v1, false
--   SELECT has_table_privilege('service_role','public.hd_edu_private_items','SELECT');      -- false
-- ROLLBACK (yalnız hiç kullanılmadıysa): 6 tabloyu + hd_edu_priv_* fonksiyonlarını DROP (mevcut tablolar etkilenmez).
-- =============================================================================
