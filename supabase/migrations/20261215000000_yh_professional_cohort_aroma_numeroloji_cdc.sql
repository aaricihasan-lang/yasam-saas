-- =============================================================================
-- 20261213000000_yh_professional_cohort_aroma_numeroloji_cdc.sql
--
-- YAŞAM HAFIZASI™ — PROFESSIONAL COHORT: AROMATERAPİ CANONICAL V2 (katalog + verified-method)
--   + NUMEROLOJİ PROFESSIONAL event-driven CDC parity (foundation).
--
-- KAPSAM (yalnız aşağıdaki 5 kaynak; başka kaynak DAVRANIŞI DEĞİŞMEZ):
--   A) aromaterapi:plant-taxa    → aromatherapy_plant_taxa                 (generic; column tenant + record)
--   B) aromaterapi:preparations  → aromatherapy_preparations              (generic; column tenant + record)
--   C) aromaterapi:method        → aromatherapy_preparation_method_series (SEÇENEK B: seri-kimlikli;
--        capture aromatherapy_preparation_method_revisions üzerinde → revizyon status değişimi
--        SERIES-keyed coalesce; worker işleme anında current verified revizyonu çözer)
--   D) numeroloji:sources        → numerology_sources                     (generic; column tenant + record)
--   E) numeroloji:knowledge-entries → numerology_knowledge_source_entries (generic; column tenant + record)
--
-- TENANT MODELİ: hepsi COLUMN-TENANT (tenant_id NOT NULL) + record → worker-v1 (eventProcessor)
--   Kapı 5/6/7 PASS (shared/global/section YOK → capability GEREKMEZ). Generic public.yh_cdc_enqueue
--   4 kaynak için yeterlidir; method için source_id = series_id gerektiğinden AYRI capture fonksiyonu
--   (public.yh_cdc_enqueue_method_series_v2) eklenir (source_table = SERİ tablosu; source_id = series_id).
--
-- MERGE-SAFE / APPLY-SAFE (KİLİTLİ): TRIGGER ATTACHED ≠ SOURCE ACTIVATED.
--   Tüm enqueue AKTİVASYON-KAPILIDIR (public.yh_source_activation.is_active=true YOKSA sessiz NO-OP;
--   kaynak CRUD ENGELLENMEZ). Bu migration:
--     - yh_source_activation'a HİÇBİR satır INSERT ETMEZ (5 kaynak OFF kalır)
--     - is_active=true / backfill_allowed=true YAPMAZ
--     - aroma/numeroloji/index DATA DML YAPMAZ (INSERT/UPDATE/DELETE yok)
--     - historical/bulk enqueue YAPMAZ  - reconcile/purge/backfill YAPMAZ
--     - mevcut index satırlarını TEMİZLEMEZ
--   Kaynak yalnız (kod enabled:true) + (yh_source_activation.is_active=true) birlikte olduğunda
--   işlenir → AYRI production kapısı (numeroloji ayrıca WAIT_FOR_CLEAN_RESET: temiz reset SONRASI).
--
-- GÜVENLİK: yeni capture fonksiyonu mevcut public.yh_cdc_enqueue deseniyle birebir: SECURITY DEFINER +
--   sabit search_path (public, pg_catalog) + schema-qualified + PUBLIC/anon/authenticated EXECUTE kapalı.
--   Trigger ham içerik / PII / payload snapshot YAZMAZ (yalnız source_key + source_id + tenant_id +
--   operation). ALTER TABLE YAPILMAZ (kaynak tablolara dokunulmaz; yalnız CREATE TRIGGER + CREATE FUNCTION).
--
-- KORUNAN (bu migration DOKUNMAZ): mevcut tüm kaynaklar + Cohort A (20261004000000) + Worker-v2
--   (20261210000000) + dogaltas:stones + kisisel_arsiv + aromaterapi:oils/reference*/blends trigger'ları.
--   aromatherapy_claims + Human Design bu cohort DIŞIDIR → onlara CDC EKLENMEZ.
--
-- UYGULAMA: Supabase Dashboard SQL Editor. AYRI ONAY. Production apply bu paketin DIŞINDA.
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS / CREATE TRIGGER.
-- ROLLBACK-ONLY: tek transaction; herhangi bir adım hata verirse tümü geri alınır.
-- ROLLBACK (manuel): her CREATE TRIGGER için DROP TRIGGER IF EXISTS <ad> ON public.<tablo>;
--   + DROP FUNCTION IF EXISTS public.yh_cdc_enqueue_method_series_v2(). Index satırları ETKİLENMEZ.
-- =============================================================================

BEGIN;

-- ─── 0) FAIL-CLOSED PRECONDITIONS ────────────────────────────────────────────
DO $pre$
DECLARE
  v_tbl text;
  v_tables text[] := ARRAY[
    'aromatherapy_plant_taxa','aromatherapy_preparations',
    'aromatherapy_preparation_method_series','aromatherapy_preparation_method_revisions',
    'numerology_sources','numerology_knowledge_source_entries'
  ];
BEGIN
  IF to_regprocedure('public.yh_cdc_enqueue()') IS NULL THEN
    RAISE EXCEPTION 'Professional Cohort BLOCKER: public.yh_cdc_enqueue() yok — önce 20260927000000 uygulanmali';
  END IF;
  IF to_regclass('public.yh_source_activation') IS NULL THEN
    RAISE EXCEPTION 'Professional Cohort BLOCKER: public.yh_source_activation yok — önce 20260927000000 uygulanmali';
  END IF;
  IF to_regclass('public.yasam_hafizasi_outbox') IS NULL THEN
    RAISE EXCEPTION 'Professional Cohort BLOCKER: public.yasam_hafizasi_outbox yok — önce 20260815000000 uygulanmali';
  END IF;
  IF to_regclass('public.yasam_hafizasi_outbox_event_version_seq') IS NULL THEN
    RAISE EXCEPTION 'Professional Cohort BLOCKER: yasam_hafizasi_outbox_event_version_seq yok';
  END IF;
  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF to_regclass('public.'||v_tbl) IS NULL THEN
      RAISE EXCEPTION 'Professional Cohort BLOCKER: public.% tablosu yok', v_tbl;
    END IF;
  END LOOP;
END
$pre$;

-- ─── 1) GENERIC column-tenant (NOT NULL) triggers — 4 kaynak (plant_taxa/preparations/numeroloji) ──
-- public.yh_cdc_enqueue(source_key, source_table); AFTER I/U/D FOR EACH ROW; aktivasyon-kapılı.
-- Hepsi unit=record + column tenant + non-shared → eventProcessor Kapı 5/6/7 PASS. NEW.id=source_id.
DROP TRIGGER IF EXISTS yh_cdc_aromatherapy_plant_taxa_trg ON public.aromatherapy_plant_taxa;
CREATE TRIGGER yh_cdc_aromatherapy_plant_taxa_trg AFTER INSERT OR UPDATE OR DELETE ON public.aromatherapy_plant_taxa
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('aromaterapi:plant-taxa', 'aromatherapy_plant_taxa');

DROP TRIGGER IF EXISTS yh_cdc_aromatherapy_preparations_trg ON public.aromatherapy_preparations;
CREATE TRIGGER yh_cdc_aromatherapy_preparations_trg AFTER INSERT OR UPDATE OR DELETE ON public.aromatherapy_preparations
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('aromaterapi:preparations', 'aromatherapy_preparations');

DROP TRIGGER IF EXISTS yh_cdc_numerology_sources_trg ON public.numerology_sources;
CREATE TRIGGER yh_cdc_numerology_sources_trg AFTER INSERT OR UPDATE OR DELETE ON public.numerology_sources
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('numeroloji:sources', 'numerology_sources');

DROP TRIGGER IF EXISTS yh_cdc_numerology_knowledge_source_entries_trg ON public.numerology_knowledge_source_entries;
CREATE TRIGGER yh_cdc_numerology_knowledge_source_entries_trg AFTER INSERT OR UPDATE OR DELETE ON public.numerology_knowledge_source_entries
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('numeroloji:knowledge-entries', 'numerology_knowledge_source_entries');

-- ─── 2) METHOD SERİ-KİMLİKLİ capture (SEÇENEK B) ─────────────────────────────
-- Capture aromatherapy_preparation_method_revisions ÜZERİNDE çalışır (içerik immutable; yalnız
-- status/updated_at değişir → promotion/demotion status geçişidir). Hafıza source identity = SERİ:
--   source_key    = TG_ARGV[0] ('aromaterapi:method')
--   source_table  = TG_ARGV[1] (SERİ tablosu 'aromatherapy_preparation_method_series' → eventProcessor
--                   Kapı 3 config.tableName eşleşmesi + deindex bu ad üzerinden filtreler)
--   source_id     = COALESCE(NEW.series_id, OLD.series_id)   (SERİ kimliği; revizyon id DEĞİL)
--   tenant_id     = COALESCE(NEW.tenant_id, OLD.tenant_id)
--   operation     = 'upsert' DAİMA (INSERT/UPDATE/DELETE fark etmez): herhangi bir revizyon değişimi
--                   serinin current verified'ını etkileyebilir → worker İŞLEME ANINDA source-of-truth'tan
--                   current verified revizyonu çözer (varsa index/refresh; yoksa defensiveDeindex).
-- Aynı seride birden fazla revizyon UPDATE'i (ör. eski verified→archived + yeni draft→verified aynı
-- transaction) tek (source_key, source_id) satırında ON CONFLICT ile COALESCE olur (event_version bump) →
-- worker tek olayı işler, current verified'ı tazeler (duplicate/ghost yok).
--
-- NOT: SERİ tablosunun kendisine trigger BAĞLANMAZ — seri DELETE uygulamada ULAŞILAMAZ (revizyonlar
-- silinemez [DELETE trigger guard] + seri→preparat/revizyon RESTRICT FK; seri her zaman ≥1 revizyonla
-- oluşur). Bu nedenle "seri silindi" olayı üretilmez (hayali DELETE yolu yok). "Verified yok" durumu
-- (verified→archived, replacement'sız) revizyon capture'ından üretilir → worker deindex eder.
CREATE OR REPLACE FUNCTION public.yh_cdc_enqueue_method_series_v2()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_source_key   text := TG_ARGV[0];
  v_series_table text := TG_ARGV[1];   -- Hafıza source_table (SERİ tablosu)
  v_active       boolean;
  v_source_id    uuid;
  v_tenant_id    uuid;
BEGIN
  -- Fail-closed argüman + bağlam doğrulaması.
  IF v_source_key IS NULL OR length(btrim(v_source_key)) = 0 THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_method_series_v2: source_key argumani eksik';
  END IF;
  IF v_series_table IS NULL OR length(btrim(v_series_table)) = 0 THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_method_series_v2: series source_table argumani eksik';
  END IF;
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_method_series_v2: beklenmeyen schema % (public bekleniyor)', TG_TABLE_SCHEMA;
  END IF;
  -- Bu capture YALNIZ revizyon tablosunda çalışır (seri kimliğini oradan çözer).
  IF TG_TABLE_NAME IS DISTINCT FROM 'aromatherapy_preparation_method_revisions' THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_method_series_v2: beklenmeyen tablo % (revisions bekleniyor)', TG_TABLE_NAME;
  END IF;

  -- ── AKTİVASYON KAPISI: kapalı kaynak OLAY ÜRETMEZ (kaynak CRUD ENGELLENMEZ) ──
  SELECT a.is_active INTO v_active
  FROM public.yh_source_activation AS a
  WHERE a.source_key = v_source_key;

  IF v_active IS DISTINCT FROM true THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- ── Aktif kaynak: SERİ-keyed enqueue (operation DAİMA 'upsert'; worker current verified'ı çözer) ──
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_source_id := NEW.series_id;
    v_tenant_id := NEW.tenant_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_source_id := OLD.series_id;   -- revizyon silindi (savunma; uygulamada ulaşılamaz) → seriyi re-resolve
    v_tenant_id := OLD.tenant_id;
  ELSE
    RAISE EXCEPTION 'yh_cdc_enqueue_method_series_v2: desteklenmeyen TG_OP %', TG_OP;
  END IF;

  -- Fail-closed: geçerli series_id + tenant_id zorunlu (null → kaynak CRUD ROLLBACK).
  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_method_series_v2: series_id null (%, %)', v_series_table, v_source_key;
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_method_series_v2: tenant_id null (%, %)', v_series_table, v_source_key;
  END IF;

  -- Atomik enqueue + coalescing (UNIQUE(source_key, source_id)); ham PII/text YAZILMAZ.
  -- source_table = SERİ tablosu (revizyon tablosu DEĞİL) → eventProcessor Kapı 3 + deindex tutarlı.
  INSERT INTO public.yasam_hafizasi_outbox AS o
    (source_key, source_table, source_id, tenant_id, operation)
  VALUES
    (v_source_key, v_series_table, v_source_id, v_tenant_id, 'upsert')
  ON CONFLICT (source_key, source_id) DO UPDATE
  SET operation     = EXCLUDED.operation,
      source_table  = EXCLUDED.source_table,
      tenant_id     = EXCLUDED.tenant_id,
      event_version = nextval('public.yasam_hafizasi_outbox_event_version_seq'),
      updated_at    = now(),
      -- PROCESSING (in-flight worker claim/lease) KORUNUR → stale-event sözleşmesi bozulmaz.
      status        = CASE WHEN o.status = 'processing' THEN o.status       ELSE 'pending' END,
      attempts      = CASE WHEN o.status = 'processing' THEN o.attempts     ELSE 0         END,
      available_at  = CASE WHEN o.status = 'processing' THEN o.available_at  ELSE now()     END,
      locked_at     = CASE WHEN o.status = 'processing' THEN o.locked_at     ELSE NULL      END,
      locked_by     = CASE WHEN o.status = 'processing' THEN o.locked_by     ELSE NULL      END,
      last_error    = CASE WHEN o.status = 'processing' THEN o.last_error    ELSE NULL      END,
      processed_at  = CASE WHEN o.status = 'processing' THEN o.processed_at  ELSE NULL      END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger mekanizması EXECUTE gerektirmez; doğrudan çağrı yüzeyi kapatılır (defense-in-depth).
REVOKE ALL ON FUNCTION public.yh_cdc_enqueue_method_series_v2() FROM PUBLIC, anon, authenticated;

-- Method capture: revizyon tablosunda AFTER I/U/D → SERİ-keyed enqueue.
DROP TRIGGER IF EXISTS yh_cdc_method_series_v2_trg ON public.aromatherapy_preparation_method_revisions;
CREATE TRIGGER yh_cdc_method_series_v2_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.aromatherapy_preparation_method_revisions
  FOR EACH ROW
  EXECUTE FUNCTION public.yh_cdc_enqueue_method_series_v2('aromaterapi:method', 'aromatherapy_preparation_method_series');

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   -- 1) 4 generic trigger + 1 method capture trigger bağlı:
--   SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
--     WHERE NOT t.tgisinternal AND t.tgname IN (
--       'yh_cdc_aromatherapy_plant_taxa_trg','yh_cdc_aromatherapy_preparations_trg',
--       'yh_cdc_numerology_sources_trg','yh_cdc_numerology_knowledge_source_entries_trg',
--       'yh_cdc_method_series_v2_trg') ORDER BY c.relname;                       -- 5 satir
--   -- 2) method capture SERİ tablosuna DEĞİL revizyon tablosuna bağlı (seri identity revizyondan çözülür):
--   --    yh_cdc_method_series_v2_trg → c.relname = 'aromatherapy_preparation_method_revisions'
--   -- 3) HİÇBİR kaynak aktif değil (TRIGGER ATTACHED ≠ SOURCE ACTIVATED):
--   SELECT count(*) FROM public.yh_source_activation WHERE source_key IN
--     ('aromaterapi:plant-taxa','aromaterapi:preparations','aromaterapi:method',
--      'numeroloji:sources','numeroloji:knowledge-entries') AND is_active;        -- 0
--   -- 4) Bu migration veri/index DML'i yapmaz; mevcut index satirlari KORUNUR.
--
-- AKTİVASYON (bu migration'da DEĞİL; AYRI ONAY + preflight PASS sonrası, kaynak-başına):
--   -- SELECT public.yh_source_activation_set('aromaterapi:plant-taxa', true, false,
--   --                                        'FUTURE_ONLY_READY','professional','professional-cohort activation');
--   -- NUMEROLOJİ: temiz reset SONRASI (WAIT_FOR_CLEAN_RESET) ayrı onay; şimdi AKTİVE EDİLMEZ.
--   -- KILL-SWITCH: SELECT public.yh_source_deactivate('aromaterapi:method'); (index KORUNUR)
-- =============================================================================
