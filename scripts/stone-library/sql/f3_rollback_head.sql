-- Doğaltaş Kütüphanesi F3 — GERİ DÖNÜŞ (YALNIZ OWNER ONAYIYLA). F1 + F2'yi KORUR, yalnız F3 nesnelerini kaldırır.
-- Koruma: F3'e özgü veri (incelemede / yayına hazır taş, owner sağlık kararı, owner_decision modu) varsa DURUR → veri kaybı yok.
-- Mevcut hiçbir uygulama tablosuna dokunmaz.
-- TEK ADIM: F3'ün değiştirdiği fonksiyonların özgün F1 / F2 gövdeleri AYNI işlemde geri kurulur, alternatif ad RPC yetkisi geri
-- verilir, yayın belgeleri F2 biçimiyle yeniden üretilir. Ardından: scripts/stone-library/sql/f2_postflight_readonly.sql → PASS.
-- Bu dosya scripts/stone-library/build-f3-migration.py ile üretilir (f3_rollback_head + özgün gövdeler + f3_rollback_tail).
-- Kanıt: scripts/stone-library/pg/f3-rollback-check.mjs
-- Çalıştırmadan önce: SET stone_library.rollback_confirm = 'DROP_STONE_LIBRARY_F3';
BEGIN;
DO $$
BEGIN
  IF coalesce(current_setting('stone_library.rollback_confirm', true), '') <> 'DROP_STONE_LIBRARY_F3' THEN
    RAISE EXCEPTION 'F3 ROLLBACK durdu: onay ayarı yok (stone_library.rollback_confirm)';
  END IF;
  IF to_regprocedure('public.stone_library_readiness(uuid)') IS NULL THEN RAISE NOTICE 'F3 zaten yok'; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_stones WHERE status IN ('review','ready')) THEN
    RAISE EXCEPTION 'F3 ROLLBACK durdu: "incelemede" / "yayına hazır" durumunda taş var (owner kararı gerekir).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_stones WHERE health_publish_decided_at IS NOT NULL) THEN
    RAISE EXCEPTION 'F3 ROLLBACK durdu: owner sağlık yayın kararı kayıtlı (veri kaybı yaratılmaz).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_settings WHERE health_publication_mode <> 'legal_review' OR owner_decision_ref IS NOT NULL) THEN
    RAISE EXCEPTION 'F3 ROLLBACK durdu: sağlık yayın modu owner_decision / owner karar referansı kayıtlı.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stone_library_settings WHERE medical_notice_tr <> 'Bu kütüphanede yer alan bilgiler doğaltaşlara ilişkin geleneksel, kültürel ve tamamlayıcı uygulama kaynaklarından derlenmiştir. Bilgiler tıbbi teşhis veya tedavi önerisi niteliğinde değildir ve profesyonel sağlık hizmetlerinin yerine geçmez.'
             OR medical_notice_en <> 'The information in this library has been compiled from traditional, cultural and complementary practice sources on natural stones. It does not constitute medical diagnosis or treatment advice and does not replace professional healthcare services.') THEN
    RAISE EXCEPTION 'F3 ROLLBACK durdu: owner tıbbi bilgilendirme metnini değiştirmiş (metin kaybı yaratılmaz).';
  END IF;
END $$;

DO $$
DECLARE fn record;
BEGIN
  IF to_regprocedure('public.stone_library_readiness(uuid)') IS NULL THEN RETURN; END IF;
  DROP TRIGGER IF EXISTS trg_stone_library_records_source_integrity ON public.stone_library_records;
  DROP TRIGGER IF EXISTS trg_stone_library_facets_source_integrity ON public.stone_library_facets;
  DROP TRIGGER IF EXISTS trg_stone_library_stones_source_name ON public.stone_library_stones;
  DROP TRIGGER IF EXISTS trg_stone_library_images_binding ON public.stone_library_images;
  DROP TRIGGER IF EXISTS trg_stone_library_records_field_path ON public.stone_library_records;
  DROP TRIGGER IF EXISTS trg_stone_library_facets_field_path ON public.stone_library_facets;
  DROP TRIGGER IF EXISTS trg_stone_library_sources_kind ON public.stone_library_sources;
  DROP TRIGGER IF EXISTS trg_stone_library_external_ids_link ON public.stone_library_external_ids;
  FOR fn IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname IN ('stone_library_health_ok','stone_library_source_integrity_guard','stone_library_source_name_guard',
               'stone_library_image_binding_guard','stone_library_field_path','stone_library_field_path_guard','stone_library_readiness',
               'stone_library_owner_readiness','stone_library_health_decision','stone_library_owner_bulk_review','stone_library_owner_integrity',
               'stone_library_expert_facets','stone_library_source_kind_guard','stone_library_external_link_guard','stone_library_integrity','stone_library_facet_raw_key') LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', fn.sig);
  END LOOP;
  ALTER TABLE public.stone_library_stones DROP CONSTRAINT IF EXISTS stone_library_stones_status_check;
  ALTER TABLE public.stone_library_stones ADD CONSTRAINT stone_library_stones_status_check CHECK (status IN ('draft','published','hidden'));
  ALTER TABLE public.stone_library_stones DROP CONSTRAINT IF EXISTS stone_library_stones_health_decision_chk;
  ALTER TABLE public.stone_library_stones DROP COLUMN IF EXISTS health_publish_decided_at;
  ALTER TABLE public.stone_library_stones DROP COLUMN IF EXISTS health_publish_decided_by;
  ALTER TABLE public.stone_library_stones DROP COLUMN IF EXISTS health_publish_note;
  ALTER TABLE public.stone_library_settings DROP CONSTRAINT IF EXISTS stone_library_settings_health_ref_chk;
  ALTER TABLE public.stone_library_settings ADD CONSTRAINT stone_library_settings_health_ref_chk
    CHECK (NOT health_content_publication_enabled OR legal_review_ref IS NOT NULL);
  ALTER TABLE public.stone_library_settings DROP CONSTRAINT IF EXISTS stone_library_settings_mode_chk;
  ALTER TABLE public.stone_library_settings DROP COLUMN IF EXISTS health_publication_mode;
  ALTER TABLE public.stone_library_settings DROP COLUMN IF EXISTS owner_decision_ref;
  ALTER TABLE public.stone_library_settings DROP COLUMN IF EXISTS medical_notice_tr;
  ALTER TABLE public.stone_library_settings DROP COLUMN IF EXISTS medical_notice_en;
END $$;
