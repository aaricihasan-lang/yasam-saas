-- =============================================================================
-- 20261004000000_yh_professional_event_driven_parity.sql
--
-- YAŞAM HAFIZASI™ — COHORT A: PROFESYONEL KAYNAKLAR EVENT-DRIVEN PARITY (foundation)
--
-- AMAÇ: worker v1 (eventProcessor) tarafından İŞLENEBİLİR 11 professional kaynağı (record birim +
--   column tenant, non-shared) GERÇEK event-driven current-state modeline bağlar:
--   INSERT→upsert, UPDATE→same-identity refresh, DELETE→deindex/tombstone. Bunlardan 2'si YENİ
--   Biyoenerji professional kaynağıdır (bioenergy_sessions = Teknikler&Uygulamalar, client_id yok;
--   bioenergy_energy_bodies = Enerji Bedenleri).
--
-- PRE-MERGE REVIEW DÜZELTMESİ (BAĞLAYICI): worker v1 (eventProcessor) YALNIZ column|join tenant +
--   NON-shared (allowSharedNull != true) + record|row unit kaynağı işler. Bu nedenle 5 kaynak Cohort
--   A worker-v1 parite kapsamından ÇIKARILDI ve BU MIGRATION'DA CDC TRIGGER BAĞLANMAZ:
--     - stone_knowledge_articles / aromatherapy_oils / aromatherapy_reference_sheets /
--       aromatherapy_reference_rows  → allowSharedNull=true (Kapı 6 permanent 'shared-source-unsupported')
--     - healing_guide_sections       → unit=section (Kapı 7 permanent 'non-record-unit-unsupported')
--   Bu 5 kaynak aktive edilseydi olaylar DEAD-LETTER olur, index/deindex OLUŞMAZ, DELETE sonrası
--   GHOST bilgi kalabilirdi. Ayrı worker v2 (shared/global tenant + non-record unit) kohortuna
--   ertelendi (activationMatrix: DEFERRED_SHARED_WORKER_V2). Registry `enabled:true` KORUNUR (arama).
--   → Bu migration HİÇBİR YENİ FONKSİYON OLUŞTURMAZ; yalnız mevcut public.yh_cdc_enqueue ile 11 trigger.
--
-- MERGE-SAFE / APPLY-SAFE (KİLİTLİ): TRIGGER ATTACHED ≠ SOURCE ACTIVATED.
--   yh_cdc_enqueue AKTİVASYON-KAPILIDIR (yh_source_activation.is_active=true YOKSA sessiz NO-OP;
--   kaynak CRUD ENGELLENMEZ). Bu migration:
--     - yh_source_activation'a HİÇBİR satır INSERT ETMEZ (hiçbir kaynak aktive olmaz)
--     - is_active=true / backfill_allowed=true YAPMAZ
--     - archive/knowledge/catalog DATA DML YAPMAZ (INSERT/UPDATE/DELETE yok)
--     - index DML YAPMAZ            - historical scan / bulk enqueue YAPMAZ
--     - reconcile BAŞLATMAZ         - mevcut 1343 manuel-backfill index satırını TEMİZLEMEZ
--   Kaynak yalnız (kod enabled:true) + (activationMatrix requiresRuntimeActivation gate) +
--   (yh_source_activation.is_active=true) birlikte olduğunda işlenir → AYRI production kapısı.
--
-- TENANT MODELİ (yalnız worker-v1-supported): COLUMN-TENANT (NOT NULL) → generic
--   public.yh_cdc_enqueue(source_key, source_table). Shared-optional / parent-child / section
--   kaynaklar bu migration'da YOK (yukarıdaki düzeltme; worker v2'ye ertelendi).
--
-- GÜVENLİK: mevcut public.yh_cdc_enqueue SECURITY DEFINER + sabit search_path + schema-qualified;
--   PUBLIC/anon/authenticated EXECUTE kapalı. Trigger ham içerik / PII / payload snapshot YAZMAZ
--   (yalnız source_key + source_id + tenant_id + operation).
--
-- KORUNAN (bu migration DOKUNMAZ): dogaltas:stones (mevcut unconditional yh_outbox_enqueue live),
--   kisisel_arsiv:archives (ROW_GATED_CONTROLLED active), refleksoloji:notes (pii-blocked),
--   belge_video (NON_SOURCE, retired), 5 DEFERRED_SHARED_WORKER_V2 kaynağı (trigger YOK).
--
-- UYGULAMA: Supabase Dashboard SQL Editor. AYRI ONAY. Production apply bu paketin DIŞINDA.
-- IDEMPOTENT: DROP TRIGGER IF EXISTS / CREATE TRIGGER (yeni fonksiyon yok).
-- ROLLBACK-ONLY: tek transaction; herhangi bir adım hata verirse tümü geri alınır.
-- ROLLBACK (manuel): bu migration'daki her CREATE TRIGGER için DROP TRIGGER IF EXISTS <ad> ON
--   public.<tablo>; Index satırları ETKİLENMEZ. (Yeni fonksiyon oluşturulmadığından DROP FUNCTION yok.)
-- =============================================================================

BEGIN;

-- ─── 0) FAIL-CLOSED PRECONDITIONS ────────────────────────────────────────────
DO $pre$
DECLARE
  v_tbl text;
  v_tables text[] := ARRAY[
    'bioenergy_chakras','bioenergy_subconscious_causes','bioenergy_symbols','bioenergy_imaginations',
    'bioenergy_sessions','bioenergy_energy_bodies','reflexology_protocols','healing_guides',
    'minerals','combinations','aromatherapy_blends'
  ];
BEGIN
  IF to_regprocedure('public.yh_cdc_enqueue()') IS NULL THEN
    RAISE EXCEPTION 'BF-CohortA BLOCKER: public.yh_cdc_enqueue() yok — önce 20260927000000 uygulanmali';
  END IF;
  IF to_regclass('public.yh_source_activation') IS NULL THEN
    RAISE EXCEPTION 'BF-CohortA BLOCKER: public.yh_source_activation yok — önce 20260927000000 uygulanmali';
  END IF;
  IF to_regclass('public.yasam_hafizasi_outbox') IS NULL THEN
    RAISE EXCEPTION 'BF-CohortA BLOCKER: public.yasam_hafizasi_outbox yok — önce 20260815000000 uygulanmali';
  END IF;
  IF to_regclass('public.yasam_hafizasi_outbox_event_version_seq') IS NULL THEN
    RAISE EXCEPTION 'BF-CohortA BLOCKER: yasam_hafizasi_outbox_event_version_seq yok';
  END IF;
  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF to_regclass('public.'||v_tbl) IS NULL THEN
      RAISE EXCEPTION 'BF-CohortA BLOCKER: public.% tablosu yok', v_tbl;
    END IF;
  END LOOP;
END
$pre$;

-- ─── 1) GENERIC column-tenant (NOT NULL) triggers — worker-v1-supported 11 kaynak ──
-- public.yh_cdc_enqueue(source_key, source_table); AFTER I/U/D FOR EACH ROW; aktivasyon-kapılı.
-- Hepsi unit=record + column tenant + non-shared → eventProcessor Kapı 5/6/7 PASS.
DROP TRIGGER IF EXISTS yh_cdc_bioenergy_chakras_trg ON public.bioenergy_chakras;
CREATE TRIGGER yh_cdc_bioenergy_chakras_trg AFTER INSERT OR UPDATE OR DELETE ON public.bioenergy_chakras
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('biyoenerji:chakras', 'bioenergy_chakras');

DROP TRIGGER IF EXISTS yh_cdc_bioenergy_subconscious_causes_trg ON public.bioenergy_subconscious_causes;
CREATE TRIGGER yh_cdc_bioenergy_subconscious_causes_trg AFTER INSERT OR UPDATE OR DELETE ON public.bioenergy_subconscious_causes
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('biyoenerji:subconscious-causes', 'bioenergy_subconscious_causes');

DROP TRIGGER IF EXISTS yh_cdc_bioenergy_symbols_trg ON public.bioenergy_symbols;
CREATE TRIGGER yh_cdc_bioenergy_symbols_trg AFTER INSERT OR UPDATE OR DELETE ON public.bioenergy_symbols
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('biyoenerji:symbols', 'bioenergy_symbols');

DROP TRIGGER IF EXISTS yh_cdc_bioenergy_imaginations_trg ON public.bioenergy_imaginations;
CREATE TRIGGER yh_cdc_bioenergy_imaginations_trg AFTER INSERT OR UPDATE OR DELETE ON public.bioenergy_imaginations
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('biyoenerji:imaginations', 'bioenergy_imaginations');

DROP TRIGGER IF EXISTS yh_cdc_bioenergy_sessions_trg ON public.bioenergy_sessions;
CREATE TRIGGER yh_cdc_bioenergy_sessions_trg AFTER INSERT OR UPDATE OR DELETE ON public.bioenergy_sessions
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('biyoenerji:sessions', 'bioenergy_sessions');

DROP TRIGGER IF EXISTS yh_cdc_bioenergy_energy_bodies_trg ON public.bioenergy_energy_bodies;
CREATE TRIGGER yh_cdc_bioenergy_energy_bodies_trg AFTER INSERT OR UPDATE OR DELETE ON public.bioenergy_energy_bodies
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('biyoenerji:energy-bodies', 'bioenergy_energy_bodies');

DROP TRIGGER IF EXISTS yh_cdc_reflexology_protocols_trg ON public.reflexology_protocols;
CREATE TRIGGER yh_cdc_reflexology_protocols_trg AFTER INSERT OR UPDATE OR DELETE ON public.reflexology_protocols
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('refleksoloji:protocols', 'reflexology_protocols');

DROP TRIGGER IF EXISTS yh_cdc_healing_guides_trg ON public.healing_guides;
CREATE TRIGGER yh_cdc_healing_guides_trg AFTER INSERT OR UPDATE OR DELETE ON public.healing_guides
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('sifa_rehberi:guides', 'healing_guides');

DROP TRIGGER IF EXISTS yh_cdc_minerals_trg ON public.minerals;
CREATE TRIGGER yh_cdc_minerals_trg AFTER INSERT OR UPDATE OR DELETE ON public.minerals
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('dogaltas:minerals', 'minerals');

DROP TRIGGER IF EXISTS yh_cdc_combinations_trg ON public.combinations;
CREATE TRIGGER yh_cdc_combinations_trg AFTER INSERT OR UPDATE OR DELETE ON public.combinations
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('dogaltas:combinations', 'combinations');

DROP TRIGGER IF EXISTS yh_cdc_aromatherapy_blends_trg ON public.aromatherapy_blends;
CREATE TRIGGER yh_cdc_aromatherapy_blends_trg AFTER INSERT OR UPDATE OR DELETE ON public.aromatherapy_blends
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('aromaterapi:blends', 'aromatherapy_blends');

-- ─── 2) DEFERRED_SHARED_WORKER_V2 (worker v1 işleyemez) — TRIGGER BAĞLANMAZ ─────
-- stone_knowledge_articles / aromatherapy_oils / aromatherapy_reference_sheets (allowSharedNull) +
-- aromatherapy_reference_rows (shared parent) + healing_guide_sections (unit=section) worker v1
-- tarafından permanent reject edilir → bilinçli olarak CDC trigger EKLENMEZ (aktive edilse dead-letter).
-- Bu kaynaklar ayrı worker v2 (shared/global tenant + non-record unit) kohortunda bağlanacaktır.
-- Defensif idempotency: önceki taslakta bağlanmış olabilecek herhangi bir trigger'ı KALDIR (varsa).
DROP TRIGGER IF EXISTS yh_cdc_stone_knowledge_articles_trg ON public.stone_knowledge_articles;
DROP TRIGGER IF EXISTS yh_cdc_aromatherapy_oils_trg ON public.aromatherapy_oils;
DROP TRIGGER IF EXISTS yh_cdc_aromatherapy_reference_sheets_trg ON public.aromatherapy_reference_sheets;
DROP TRIGGER IF EXISTS yh_cdc_aromatherapy_reference_rows_trg ON public.aromatherapy_reference_rows;
DROP TRIGGER IF EXISTS yh_cdc_healing_guide_sections_trg ON public.healing_guide_sections;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   -- 1) 11 trigger bağlı (tgtype 29 = ROW+AFTER+INSERT+DELETE+UPDATE):
--   SELECT c.relname, t.tgname, t.tgtype FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
--     WHERE NOT t.tgisinternal AND t.tgname LIKE 'yh_cdc_%_trg'
--       AND c.relname IN ('bioenergy_chakras','bioenergy_subconscious_causes','bioenergy_symbols',
--         'bioenergy_imaginations','bioenergy_sessions','bioenergy_energy_bodies','reflexology_protocols',
--         'healing_guides','minerals','combinations','aromatherapy_blends')
--     ORDER BY c.relname;                                                        -- 11 satir, tgtype=29
--   -- 2) DEFERRED 5 kaynakta yh_cdc trigger YOK (worker v1 işleyemez):
--   SELECT c.relname, count(t.*) FROM pg_class c LEFT JOIN pg_trigger t
--     ON t.tgrelid=c.oid AND NOT t.tgisinternal AND t.tgname LIKE 'yh_cdc_%_trg'
--     WHERE c.relname IN ('stone_knowledge_articles','aromatherapy_oils','aromatherapy_reference_sheets',
--       'aromatherapy_reference_rows','healing_guide_sections') GROUP BY c.relname;   -- her biri 0
--   -- 3) Bu migration YENİ FONKSİYON OLUŞTURMAZ (yalnız mevcut yh_cdc_enqueue kullanılır).
--   -- 4) HİÇBİR kaynak aktif değil (TRIGGER ATTACHED ≠ SOURCE ACTIVATED):
--   SELECT count(*) FROM public.yh_source_activation WHERE source_key IN
--     ('biyoenerji:chakras','biyoenerji:subconscious-causes','biyoenerji:symbols','biyoenerji:imaginations',
--      'biyoenerji:sessions','biyoenerji:energy-bodies','refleksoloji:protocols','sifa_rehberi:guides',
--      'dogaltas:minerals','dogaltas:combinations','aromaterapi:blends')
--     AND is_active;                                                             -- 0
--   -- 5) dogaltas:stones trigger DEĞİŞMEDİ (yh_outbox_stones_enqueue_trg hâlâ mevcut).
--   -- 6) Bu migration index/veri DML'i yapmaz; mevcut 1343 manuel-backfill satiri KORUNUR.
--
-- AKTİVASYON (bu migration'da DEĞİL; AYRI ONAY + preflight PASS sonrası, kaynak-başına):
--   -- SELECT public.yh_source_activation_set('biyoenerji:chakras', true, false,
--   --                                        'FUTURE_ONLY_READY','professional','cohort-A activation');
--   -- KILL-SWITCH: SELECT public.yh_source_deactivate('biyoenerji:chakras'); (index KORUNUR)
-- =============================================================================
