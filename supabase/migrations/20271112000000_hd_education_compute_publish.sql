-- =============================================================================
-- 20271112000000_hd_education_compute_publish.sql
--
-- HUMAN DESIGN — HAZIR EĞİTİM HARİTALARI (FAZ 2-B2) · YALNIZ hd_education_* TABLOLARI · ADDITIVE
-- Önkoşul: 20271110000000_hd_education_catalog_access.sql (B1). Bu dosya B1'i YENİDEN YAZMAZ; yalnız
-- ekler (kolon) ve B1 tetikleyici fonksiyonlarını CREATE OR REPLACE ile SIKILAŞTIRIR. users / human_design_* /
-- admin_audit_log / tenant / RLS kurallarına DOKUNULMAZ.
--
-- NEDEN:
--   1) Hukuk incelemesi doğum kanıtı DEĞİLDİR. B1'de hukuk alanı değişikliği de revizyon artırıyordu → avukat
--      kaydı, doğrulanmış hesap snapshot'ını geçersiz kılıyordu. Artık:
--        • DOĞUM KANITI (tarih, yer, koordinat, belge saati/alıntısı, saat standardı, ofset, UTC, durum …) değişikliği
--          → revizyon + 1 zorunlu, eski hâl denetime yazılır (B1 davranışı aynen);
--        • HUKUK alanları (legal_status, legal_note, blockers, legal_reviewed_*) → revizyon değişmez, eski/yeni denetime
--          yazılır ('legal_updated').
--      LOW_REVIEWED (avukat incelemesi kayıtlı) YALNIZ owner kimliği + inceleme referansı + tarih ile yazılabilir —
--      yazılım bu durumu kendiliğinden üretemez. Yayındaki/onaylı kişide HİÇBİR alan değişmez (B1 kuralı korunur).
--   2) Yayın kilidi sıkılaştırılır: approved/published için ayrıca
--        • hukuk = LOW_REVIEWED (LOW_UNREVIEWED ve E yayınlanamaz),
--        • snapshot'ı owner DOĞRULAMIŞ olmalı (chart_verified_by owner + chart_verified_at),
--        • güncel revizyonda doğum saati kaynağı (birth_time) mevcut,
--        • 'published' yalnız 'approved' (veya zaten 'published') durumundan; owner iki adımlı onay verir.
--      Snapshot seçimi/doğrulaması denetime yazılır ('chart_verified').
--   3) Denetim eylemlerine 'legal_updated', 'chart_verified', 'chart_failed' eklenir.
-- DEPLOY: Bu dosyanın repoda olması HİÇBİR ORTAMA UYGULANDIĞI anlamına GELMEZ (owner onayı gerekir).
-- =============================================================================

BEGIN;

-- ─── 1) Kolonlar ────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.hd_education_subjects
  ADD COLUMN IF NOT EXISTS legal_reviewed_by  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legal_reviewed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS legal_review_ref   text        CHECK (legal_review_ref IS NULL OR char_length(legal_review_ref) BETWEEN 3 AND 500);

ALTER TABLE public.hd_education_publications
  ADD COLUMN IF NOT EXISTS chart_verified_by  uuid        REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS chart_verified_at  timestamptz;

-- ─── 2) Denetim eylem listesi (B1 satır içi CHECK'i adıyla bulunup değiştirilir) ──────────────────
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
     WHERE con.conrelid = 'public.hd_education_audit_events'::regclass AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) LIKE '%access_auto_revoked%'
  LOOP
    EXECUTE format('ALTER TABLE public.hd_education_audit_events DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.hd_education_audit_events ADD CONSTRAINT hd_edu_audit_action_chk CHECK (action IN (
  'subject_created','subject_revised','source_added','chart_recorded',
  'publication_changed','takedown_requested','takedown_handled',
  'access_granted','access_revoked','access_auto_revoked',
  'legal_updated','chart_verified','chart_failed'));

-- ─── 3) Kişi tetikleyicisi: doğum kanıtı ↔ hukuk alanları ayrımı ─────────────────────────────────
-- Owner yardımcı fonksiyonu B1'dedir: public.hd_edu_actor_is_owner(uuid) (EXECUTE hiçbir role verilmez; tetikleyici
-- SECURITY DEFINER olarak çağırır).
CREATE OR REPLACE FUNCTION public.hd_edu_subject_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  legal_cols  text[] := ARRAY['legal_status','legal_note','blockers','legal_reviewed_by','legal_reviewed_at','legal_review_ref'];
  meta_cols   text[] := ARRAY['revision','updated_at','created_by'];
  v_birth_chg boolean;
  v_legal_chg boolean;
  v_fk_only   boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.legal_status = 'LOW_REVIEWED' AND (NEW.legal_reviewed_by IS NULL OR NOT public.hd_edu_actor_is_owner(NEW.legal_reviewed_by)
        OR NEW.legal_reviewed_at IS NULL OR nullif(btrim(coalesce(NEW.legal_review_ref,'')),'') IS NULL) THEN
      RAISE EXCEPTION 'hd_education_subjects: LOW_REVIEWED yalnız owner hukuk inceleme kaydıyla yazılabilir' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.natural_key <> OLD.natural_key OR NEW.created_at <> OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by AND NOT (NEW.created_by IS NULL) THEN
    RAISE EXCEPTION 'hd_education_subjects: kimlik alanları değiştirilemez' USING ERRCODE = '23514';
  END IF;

  -- Kullanıcı silinince FK'nin yaptığı created_by / legal_reviewed_by → NULL güncellemesi (başka alan değişmeden) serbest.
  v_fk_only := (to_jsonb(NEW) - ARRAY['created_by','legal_reviewed_by','updated_at']) = (to_jsonb(OLD) - ARRAY['created_by','legal_reviewed_by','updated_at'])
               AND (NEW.created_by IS NULL OR NEW.created_by IS NOT DISTINCT FROM OLD.created_by)
               AND (NEW.legal_reviewed_by IS NULL OR NEW.legal_reviewed_by IS NOT DISTINCT FROM OLD.legal_reviewed_by);
  IF v_fk_only THEN
    RETURN NEW;
  END IF;

  v_birth_chg := (to_jsonb(NEW) - (legal_cols || meta_cols)) IS DISTINCT FROM (to_jsonb(OLD) - (legal_cols || meta_cols));
  v_legal_chg := (SELECT jsonb_object_agg(k, to_jsonb(NEW) -> k) FROM unnest(legal_cols) k)
                 IS DISTINCT FROM (SELECT jsonb_object_agg(k, to_jsonb(OLD) -> k) FROM unnest(legal_cols) k);

  -- Onaylı / yayımlı kişide hiçbir kanıt veya hukuk alanı değişmez (önce gerekçeli yayından kaldırma).
  IF (v_birth_chg OR v_legal_chg) AND EXISTS (SELECT 1 FROM public.hd_education_publications p
               WHERE p.subject_id = OLD.id AND p.status IN ('approved','published')) THEN
    RAISE EXCEPTION 'hd_education_subjects: onaylı/yayımlı kişinin kanıtı veya hukuk kaydı değiştirilemez (önce yayından kaldırın)' USING ERRCODE = '23514';
  END IF;

  IF v_birth_chg THEN
    IF NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION 'hd_education_subjects: kanıt değişikliği yeni revizyon ister (revision + 1)' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.hd_education_audit_events (actor_kind, actor_user_id, action, subject_id, detail)
    VALUES ('system', NULL, 'subject_revised', OLD.id, jsonb_build_object('onceki_revizyon', OLD.revision, 'onceki', to_jsonb(OLD)));
  ELSIF NEW.revision <> OLD.revision THEN
    RAISE EXCEPTION 'hd_education_subjects: doğum kanıtı değişmeden revizyon artırılamaz' USING ERRCODE = '23514';
  END IF;

  IF v_legal_chg THEN
    IF NEW.legal_status = 'LOW_REVIEWED' AND (
         NEW.legal_reviewed_by IS NULL OR NOT public.hd_edu_actor_is_owner(NEW.legal_reviewed_by)
         OR NEW.legal_reviewed_at IS NULL OR nullif(btrim(coalesce(NEW.legal_review_ref,'')),'') IS NULL) THEN
      RAISE EXCEPTION 'hd_education_subjects: LOW_REVIEWED yalnız owner hukuk inceleme kaydıyla yazılabilir' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.hd_education_audit_events (actor_kind, actor_user_id, action, subject_id, detail)
    VALUES (CASE WHEN NEW.legal_reviewed_by IS NOT NULL AND NEW.legal_reviewed_by IS DISTINCT FROM OLD.legal_reviewed_by THEN 'owner' ELSE 'system' END,
            CASE WHEN NEW.legal_reviewed_by IS NOT NULL AND NEW.legal_reviewed_by IS DISTINCT FROM OLD.legal_reviewed_by THEN NEW.legal_reviewed_by END,
            'legal_updated', OLD.id,
            jsonb_build_object('onceki', jsonb_build_object('legal_status', OLD.legal_status, 'blockers', OLD.blockers, 'legal_review_ref', OLD.legal_review_ref),
                               'yeni',   jsonb_build_object('legal_status', NEW.legal_status, 'blockers', NEW.blockers, 'legal_review_ref', NEW.legal_review_ref)));
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hd_edu_subject_guard ON public.hd_education_subjects;
CREATE TRIGGER trg_hd_edu_subject_guard BEFORE INSERT OR UPDATE ON public.hd_education_subjects
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_subject_guard();

-- ─── 4) Yayın kilidi (sıkılaştırılmış) ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hd_edu_publication_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE s public.hd_education_subjects%ROWTYPE; c public.hd_education_charts%ROWTYPE; v_has_source boolean;
BEGIN
  IF TG_OP = 'INSERT' AND (NEW.status <> 'draft' OR NEW.chart_id IS NOT NULL OR NEW.chart_verified_by IS NOT NULL) THEN
    RAISE EXCEPTION 'hd_education_publications: yeni kayıt yalnız boş draft olabilir' USING ERRCODE = '23514';
  END IF;

  -- Snapshot seçimi = owner doğrulaması: OK + kişinin güncel revizyonu + owner + zaman damgası. Denetlenir.
  IF NEW.chart_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.chart_id IS DISTINCT FROM OLD.chart_id
                                   OR NEW.chart_verified_by IS DISTINCT FROM OLD.chart_verified_by) THEN
    SELECT * INTO s FROM public.hd_education_subjects WHERE id = NEW.subject_id FOR SHARE;
    SELECT * INTO c FROM public.hd_education_charts WHERE id = NEW.chart_id;
    IF c.id IS NULL OR c.subject_id <> NEW.subject_id OR c.calc_status <> 'OK' OR c.subject_revision <> s.revision
       OR NEW.chart_verified_by IS NULL OR NOT public.hd_edu_actor_is_owner(NEW.chart_verified_by) OR NEW.chart_verified_at IS NULL THEN
      RAISE EXCEPTION 'hd_education_publications: snapshot doğrulaması geçersiz (OK + güncel revizyon + owner)' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.hd_education_audit_events (actor_kind, actor_user_id, action, subject_id, detail)
    VALUES ('owner', NEW.chart_verified_by, 'chart_verified', NEW.subject_id,
            jsonb_build_object('chart_id', NEW.chart_id, 'surum', c.version, 'revizyon', c.subject_revision));
  ELSIF NEW.chart_id IS NULL AND NEW.chart_verified_by IS NOT NULL THEN
    RAISE EXCEPTION 'hd_education_publications: snapshot olmadan doğrulama kaydı olamaz' USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('approved','published') THEN
    SELECT * INTO s FROM public.hd_education_subjects WHERE id = NEW.subject_id FOR SHARE;
    SELECT * INTO c FROM public.hd_education_charts WHERE id = NEW.chart_id;
    SELECT EXISTS (SELECT 1 FROM public.hd_education_sources x
                    WHERE x.subject_id = NEW.subject_id AND x.subject_revision = s.revision AND x.role = 'birth_time')
      INTO v_has_source;
    IF s.utc_status <> 'VERIFIED' OR s.legal_status <> 'LOW_REVIEWED' OR cardinality(s.blockers) > 0 OR s.is_living
       OR s.legal_reviewed_by IS NULL OR NOT public.hd_edu_actor_is_owner(s.legal_reviewed_by)
       OR v_has_source IS NOT TRUE
       OR NEW.chart_id IS NULL OR c.id IS NULL OR c.subject_id <> NEW.subject_id OR c.calc_status <> 'OK'
       OR c.subject_revision <> s.revision
       OR NEW.chart_verified_by IS NULL OR NOT public.hd_edu_actor_is_owner(NEW.chart_verified_by) OR NEW.chart_verified_at IS NULL
       OR NEW.approved_by IS NULL OR NOT public.hd_edu_actor_is_owner(NEW.approved_by) OR NEW.approved_at IS NULL
       OR nullif(btrim(coalesce(NEW.legal_clearance_ref,'')),'') IS NULL THEN
      RAISE EXCEPTION 'hd_education_publications: yayın koşulları sağlanmadı (UTC/kaynak/hukuk incelemesi/engel/doğrulanmış snapshot/owner onayı)' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'published' AND TG_OP = 'UPDATE' AND OLD.status NOT IN ('approved','published') THEN
      RAISE EXCEPTION 'hd_education_publications: yayın yalnız owner onayından (approved) sonra' USING ERRCODE = '23514';
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

-- ─── 5) Ayrıcalıklar: yeni kolonlar mevcut tablo ayrıcalıklarını izler; fonksiyonlar kapalı kalır ─────
REVOKE ALL ON FUNCTION public.hd_edu_subject_guard()     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hd_edu_publication_guard() FROM PUBLIC, anon, authenticated;

COMMIT;
