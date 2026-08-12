-- =============================================================================
-- 20261004000000_yh_professional_event_driven_parity.sql
--
-- YAŞAM HAFIZASI™ — COHORT A: PROFESYONEL KAYNAKLAR EVENT-DRIVEN PARITY (foundation)
--
-- AMAÇ: 14 mevcut registered-but-triggerless KEEP_LIVE professional kaynağı + 2 yeni
--   Biyoenerji professional kaynağını (bioenergy_sessions = Teknikler&Uygulamalar,
--   bioenergy_energy_bodies = Enerji Bedenleri) GERÇEK event-driven current-state modeline
--   bağlar: INSERT→upsert, UPDATE→same-identity refresh, DELETE→deindex/tombstone.
--
-- MERGE-SAFE / APPLY-SAFE (KİLİTLİ): TRIGGER ATTACHED ≠ SOURCE ACTIVATED.
--   Tüm enqueue fonksiyonları AKTİVASYON-KAPILIDIR (yh_source_activation.is_active=true YOKSA
--   sessiz NO-OP; kaynak CRUD ENGELLENMEZ). Bu migration:
--     - yh_source_activation'a HİÇBİR satır INSERT ETMEZ (hiçbir kaynak aktive olmaz)
--     - is_active=true / backfill_allowed=true YAPMAZ
--     - archive/knowledge/catalog DATA DML YAPMAZ (INSERT/UPDATE/DELETE yok)
--     - index DML YAPMAZ            - historical scan / bulk enqueue YAPMAZ
--     - reconcile BAŞLATMAZ         - mevcut 1343 manuel-backfill index satırını TEMİZLEMEZ
--   Kaynak yalnız (kod enabled:true) + (activationMatrix requiresRuntimeActivation gate) +
--   (yh_source_activation.is_active=true) birlikte olduğunda işlenir → AYRI production kapısı.
--
-- TENANT MODELİ:
--   - COLUMN-TENANT (NOT NULL): generic public.yh_cdc_enqueue(source_key, source_table).
--   - SHARED-OPTIONAL (tenant_id NULL = paylaşımlı/admin kütüphane): shared-aware fonksiyon
--     tenant_id NULL satırda SESSİZ SKIP eder (kütüphane satırı bu cohort'ta event-index'lenmez;
--     ayrı outbox-nullable-tenant genişletmesi gerektirir). tenant'lı satır normal enqueue.
--   - PARENT-CHILD (child'da tenant_id yok): source-specific fonksiyon tenant'ı parent'tan çözer;
--     parent yok / cross-tenant belirsizse FAIL-CLOSED SKIP (tahmin YOK).
--
-- GÜVENLİK: fonksiyonlar SECURITY DEFINER + sabit search_path + schema-qualified; PUBLIC/anon/
--   authenticated EXECUTE kapalı. Trigger ham içerik / PII / payload snapshot YAZMAZ (yalnız
--   source_key + source_id + tenant_id + operation).
--
-- KORUNAN (bu migration DOKUNMAZ): dogaltas:stones (mevcut unconditional yh_outbox_enqueue live),
--   kisisel_arsiv:archives (ROW_GATED_CONTROLLED active), refleksoloji:notes (pii-blocked),
--   belge_video (NON_SOURCE, retired).
--
-- UYGULAMA: Supabase Dashboard SQL Editor. AYRI ONAY. Production apply bu paketin DIŞINDA.
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS / CREATE TRIGGER.
-- ROLLBACK-ONLY: tek transaction; herhangi bir adım hata verirse tümü geri alınır.
-- ROLLBACK (manuel): bu migration'daki her CREATE TRIGGER için DROP TRIGGER IF EXISTS <ad> ON
--   public.<tablo>; ve DROP FUNCTION IF EXISTS <yeni 3 fonksiyon>. Index satırları ETKİLENMEZ.
-- =============================================================================

BEGIN;

-- ─── 0) FAIL-CLOSED PRECONDITIONS ────────────────────────────────────────────
DO $pre$
DECLARE
  v_tbl text;
  v_tables text[] := ARRAY[
    'bioenergy_chakras','bioenergy_subconscious_causes','bioenergy_symbols','bioenergy_imaginations',
    'bioenergy_sessions','bioenergy_energy_bodies','reflexology_protocols','healing_guides',
    'healing_guide_sections','minerals','combinations','stone_knowledge_articles',
    'aromatherapy_oils','aromatherapy_reference_sheets','aromatherapy_reference_rows','aromatherapy_blends'
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

-- ─── 1) SHARED-AWARE generic enqueue (tenant_id NULL → sessiz skip; RAISE YOK) ──
-- yh_cdc_enqueue ile birebir; TEK fark: tenant_id NULL satır (paylaşımlı/admin kütüphane) için
-- fail-closed RAISE yerine SESSİZ SKIP (kütüphane satırı bu cohort'ta event-index'lenmez).
CREATE OR REPLACE FUNCTION public.yh_cdc_enqueue_shared_optional()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_source_key   text := TG_ARGV[0];
  v_expect_table text := TG_ARGV[1];
  v_active       boolean;
  v_operation    text;
  v_source_id    uuid;
  v_tenant_id    uuid;
BEGIN
  IF v_source_key IS NULL OR length(btrim(v_source_key)) = 0 THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_shared_optional: source_key argumani eksik';
  END IF;
  IF v_expect_table IS NULL OR length(btrim(v_expect_table)) = 0 THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_shared_optional: expected source_table argumani eksik';
  END IF;
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_shared_optional: beklenmeyen schema %', TG_TABLE_SCHEMA;
  END IF;
  IF TG_TABLE_NAME IS DISTINCT FROM v_expect_table THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_shared_optional: source_table uyusmazligi (% <> %)', TG_TABLE_NAME, v_expect_table;
  END IF;

  -- AKTİVASYON KAPISI: kapalı kaynak OLAY ÜRETMEZ (sessiz no-op).
  SELECT a.is_active INTO v_active FROM public.yh_source_activation AS a WHERE a.source_key = v_source_key;
  IF v_active IS DISTINCT FROM true THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_operation := 'upsert'; v_source_id := NEW.id; v_tenant_id := NEW.tenant_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_operation := 'delete'; v_source_id := OLD.id; v_tenant_id := OLD.tenant_id;
  ELSE
    RAISE EXCEPTION 'yh_cdc_enqueue_shared_optional: desteklenmeyen TG_OP %', TG_OP;
  END IF;

  -- SHARED (tenant_id NULL) → SESSİZ SKIP (kütüphane satırı event-index dışı; RAISE YOK).
  IF v_tenant_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_shared_optional: source_id null (%, %)', v_expect_table, v_source_key;
  END IF;

  INSERT INTO public.yasam_hafizasi_outbox AS o
    (source_key, source_table, source_id, tenant_id, operation)
  VALUES
    (v_source_key, TG_TABLE_NAME, v_source_id, v_tenant_id, v_operation)
  ON CONFLICT (source_key, source_id) DO UPDATE
  SET operation     = EXCLUDED.operation,
      source_table  = EXCLUDED.source_table,
      tenant_id     = EXCLUDED.tenant_id,
      event_version = nextval('public.yasam_hafizasi_outbox_event_version_seq'),
      updated_at    = now(),
      status        = CASE WHEN o.status = 'processing' THEN o.status       ELSE 'pending' END,
      attempts      = CASE WHEN o.status = 'processing' THEN o.attempts     ELSE 0         END,
      available_at  = CASE WHEN o.status = 'processing' THEN o.available_at  ELSE now()     END,
      locked_at     = CASE WHEN o.status = 'processing' THEN o.locked_at     ELSE NULL      END,
      locked_by     = CASE WHEN o.status = 'processing' THEN o.locked_by     ELSE NULL      END,
      last_error    = CASE WHEN o.status = 'processing' THEN o.last_error    ELSE NULL      END,
      processed_at  = CASE WHEN o.status = 'processing' THEN o.processed_at  ELSE NULL      END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_cdc_enqueue_shared_optional() FROM PUBLIC, anon, authenticated;

-- ─── 2) PARENT-RESOLVED enqueue: healing_guide_sections → sifa_rehberi:guide-sections ──
-- Child'da tenant_id YOK; parent healing_guides.tenant_id'den çözülür. source_id = section id.
-- Parent yok / tenant null → FAIL-CLOSED SKIP (cross-tenant tahmin YOK). Aktivasyon-kapılı.
CREATE OR REPLACE FUNCTION public.yh_cdc_enqueue_healing_guide_section()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_source_key text := 'sifa_rehberi:guide-sections';
  v_active     boolean;
  v_operation  text;
  v_source_id  uuid;
  v_guide_id   uuid;
  v_tenant_id  uuid;
BEGIN
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public' OR TG_TABLE_NAME IS DISTINCT FROM 'healing_guide_sections' THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_healing_guide_section: beklenmeyen tablo %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME;
  END IF;

  SELECT a.is_active INTO v_active FROM public.yh_source_activation AS a WHERE a.source_key = v_source_key;
  IF v_active IS DISTINCT FROM true THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_operation := 'upsert'; v_source_id := NEW.id; v_guide_id := NEW.guide_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_operation := 'delete'; v_source_id := OLD.id; v_guide_id := OLD.guide_id;
  ELSE
    RAISE EXCEPTION 'yh_cdc_enqueue_healing_guide_section: desteklenmeyen TG_OP %', TG_OP;
  END IF;

  -- Parent'tan tenant çöz (cross-tenant tahmin YOK).
  IF v_guide_id IS NOT NULL THEN
    SELECT g.tenant_id INTO v_tenant_id FROM public.healing_guides AS g WHERE g.id = v_guide_id;
  END IF;
  -- Parent yok / tenant belirsiz → FAIL-CLOSED SKIP.
  IF v_tenant_id IS NULL OR v_source_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  INSERT INTO public.yasam_hafizasi_outbox AS o
    (source_key, source_table, source_id, tenant_id, operation)
  VALUES
    (v_source_key, 'healing_guide_sections', v_source_id, v_tenant_id, v_operation)
  ON CONFLICT (source_key, source_id) DO UPDATE
  SET operation     = EXCLUDED.operation,
      source_table  = EXCLUDED.source_table,
      tenant_id     = EXCLUDED.tenant_id,
      event_version = nextval('public.yasam_hafizasi_outbox_event_version_seq'),
      updated_at    = now(),
      status        = CASE WHEN o.status = 'processing' THEN o.status       ELSE 'pending' END,
      attempts      = CASE WHEN o.status = 'processing' THEN o.attempts     ELSE 0         END,
      available_at  = CASE WHEN o.status = 'processing' THEN o.available_at  ELSE now()     END,
      locked_at     = CASE WHEN o.status = 'processing' THEN o.locked_at     ELSE NULL      END,
      locked_by     = CASE WHEN o.status = 'processing' THEN o.locked_by     ELSE NULL      END,
      last_error    = CASE WHEN o.status = 'processing' THEN o.last_error    ELSE NULL      END,
      processed_at  = CASE WHEN o.status = 'processing' THEN o.processed_at  ELSE NULL      END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_cdc_enqueue_healing_guide_section() FROM PUBLIC, anon, authenticated;

-- ─── 3) PARENT-RESOLVED + SHARED-AWARE enqueue: aromatherapy_reference_rows → aromaterapi:reference-rows ──
-- Child'da tenant_id YOK; parent aromatherapy_reference_sheets.tenant_id'den çözülür. Parent tenant
-- NULL (paylaşımlı) → SESSİZ SKIP; parent yok → SKIP. source_id = row id. Aktivasyon-kapılı.
CREATE OR REPLACE FUNCTION public.yh_cdc_enqueue_aromatherapy_reference_row()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_source_key text := 'aromaterapi:reference-rows';
  v_active     boolean;
  v_operation  text;
  v_source_id  uuid;
  v_sheet_id   uuid;
  v_tenant_id  uuid;
  v_found      boolean := false;
BEGIN
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public' OR TG_TABLE_NAME IS DISTINCT FROM 'aromatherapy_reference_rows' THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_aromatherapy_reference_row: beklenmeyen tablo %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME;
  END IF;

  SELECT a.is_active INTO v_active FROM public.yh_source_activation AS a WHERE a.source_key = v_source_key;
  IF v_active IS DISTINCT FROM true THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_operation := 'upsert'; v_source_id := NEW.id; v_sheet_id := NEW.sheet_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_operation := 'delete'; v_source_id := OLD.id; v_sheet_id := OLD.sheet_id;
  ELSE
    RAISE EXCEPTION 'yh_cdc_enqueue_aromatherapy_reference_row: desteklenmeyen TG_OP %', TG_OP;
  END IF;

  -- Parent sheet'ten tenant çöz. v_found ile "parent yok" ile "parent tenant NULL (shared)" ayrılır.
  IF v_sheet_id IS NOT NULL THEN
    SELECT s.tenant_id, true INTO v_tenant_id, v_found
    FROM public.aromatherapy_reference_sheets AS s WHERE s.id = v_sheet_id;
  END IF;
  -- Parent yok → SKIP; parent tenant NULL (paylaşımlı) → SKIP; source_id null → SKIP.
  IF NOT v_found OR v_tenant_id IS NULL OR v_source_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  INSERT INTO public.yasam_hafizasi_outbox AS o
    (source_key, source_table, source_id, tenant_id, operation)
  VALUES
    (v_source_key, 'aromatherapy_reference_rows', v_source_id, v_tenant_id, v_operation)
  ON CONFLICT (source_key, source_id) DO UPDATE
  SET operation     = EXCLUDED.operation,
      source_table  = EXCLUDED.source_table,
      tenant_id     = EXCLUDED.tenant_id,
      event_version = nextval('public.yasam_hafizasi_outbox_event_version_seq'),
      updated_at    = now(),
      status        = CASE WHEN o.status = 'processing' THEN o.status       ELSE 'pending' END,
      attempts      = CASE WHEN o.status = 'processing' THEN o.attempts     ELSE 0         END,
      available_at  = CASE WHEN o.status = 'processing' THEN o.available_at  ELSE now()     END,
      locked_at     = CASE WHEN o.status = 'processing' THEN o.locked_at     ELSE NULL      END,
      locked_by     = CASE WHEN o.status = 'processing' THEN o.locked_by     ELSE NULL      END,
      last_error    = CASE WHEN o.status = 'processing' THEN o.last_error    ELSE NULL      END,
      processed_at  = CASE WHEN o.status = 'processing' THEN o.processed_at  ELSE NULL      END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_cdc_enqueue_aromatherapy_reference_row() FROM PUBLIC, anon, authenticated;

-- ─── 4) GENERIC column-tenant (NOT NULL) triggers — 11 kaynak ─────────────────
-- public.yh_cdc_enqueue(source_key, source_table); AFTER I/U/D FOR EACH ROW; aktivasyon-kapılı.
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

-- ─── 5) SHARED-OPTIONAL (allowSharedNull) triggers — 3 kaynak ─────────────────
-- tenant_id NULL (paylaşımlı/admin kütüphane) satır → sessiz skip; tenant'lı satır → enqueue.
DROP TRIGGER IF EXISTS yh_cdc_stone_knowledge_articles_trg ON public.stone_knowledge_articles;
CREATE TRIGGER yh_cdc_stone_knowledge_articles_trg AFTER INSERT OR UPDATE OR DELETE ON public.stone_knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_shared_optional('dogaltas:knowledge', 'stone_knowledge_articles');

DROP TRIGGER IF EXISTS yh_cdc_aromatherapy_oils_trg ON public.aromatherapy_oils;
CREATE TRIGGER yh_cdc_aromatherapy_oils_trg AFTER INSERT OR UPDATE OR DELETE ON public.aromatherapy_oils
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_shared_optional('aromaterapi:oils', 'aromatherapy_oils');

DROP TRIGGER IF EXISTS yh_cdc_aromatherapy_reference_sheets_trg ON public.aromatherapy_reference_sheets;
CREATE TRIGGER yh_cdc_aromatherapy_reference_sheets_trg AFTER INSERT OR UPDATE OR DELETE ON public.aromatherapy_reference_sheets
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_shared_optional('aromaterapi:reference-sheets', 'aromatherapy_reference_sheets');

-- ─── 6) PARENT-CHILD source-specific triggers — 2 kaynak ──────────────────────
DROP TRIGGER IF EXISTS yh_cdc_healing_guide_sections_trg ON public.healing_guide_sections;
CREATE TRIGGER yh_cdc_healing_guide_sections_trg AFTER INSERT OR UPDATE OR DELETE ON public.healing_guide_sections
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_healing_guide_section();

DROP TRIGGER IF EXISTS yh_cdc_aromatherapy_reference_rows_trg ON public.aromatherapy_reference_rows;
CREATE TRIGGER yh_cdc_aromatherapy_reference_rows_trg AFTER INSERT OR UPDATE OR DELETE ON public.aromatherapy_reference_rows
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_aromatherapy_reference_row();

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   -- 1) 16 trigger bağlı (tgtype 29 = ROW+AFTER+INSERT+DELETE+UPDATE):
--   SELECT c.relname, t.tgname, t.tgtype FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
--     WHERE NOT t.tgisinternal AND t.tgname LIKE 'yh_cdc_%_trg'
--       AND c.relname IN ('bioenergy_chakras','bioenergy_subconscious_causes','bioenergy_symbols',
--         'bioenergy_imaginations','bioenergy_sessions','bioenergy_energy_bodies','reflexology_protocols',
--         'healing_guides','healing_guide_sections','minerals','combinations','stone_knowledge_articles',
--         'aromatherapy_oils','aromatherapy_reference_sheets','aromatherapy_reference_rows','aromatherapy_blends')
--     ORDER BY c.relname;                                                        -- 16 satir, tgtype=29
--   -- 2) 3 yeni fonksiyon SECURITY DEFINER + anon/auth EXECUTE kapalı:
--   SELECT proname, prosecdef FROM pg_proc WHERE proname IN
--     ('yh_cdc_enqueue_shared_optional','yh_cdc_enqueue_healing_guide_section','yh_cdc_enqueue_aromatherapy_reference_row');
--   -- 3) HİÇBİR kaynak aktif değil (TRIGGER ATTACHED ≠ SOURCE ACTIVATED):
--   SELECT count(*) FROM public.yh_source_activation WHERE source_key IN
--     ('biyoenerji:chakras','biyoenerji:subconscious-causes','biyoenerji:symbols','biyoenerji:imaginations',
--      'biyoenerji:sessions','biyoenerji:energy-bodies','refleksoloji:protocols','sifa_rehberi:guides',
--      'sifa_rehberi:guide-sections','dogaltas:minerals','dogaltas:combinations','dogaltas:knowledge',
--      'aromaterapi:oils','aromaterapi:reference-sheets','aromaterapi:reference-rows','aromaterapi:blends')
--     AND is_active;                                                             -- 0
--   -- 4) dogaltas:stones trigger DEĞİŞMEDİ (yh_outbox_stones_enqueue_trg hâlâ mevcut).
--   -- 5) Bu migration index/veri DML'i yapmaz; mevcut 1343 manuel-backfill satiri KORUNUR.
--
-- AKTİVASYON (bu migration'da DEĞİL; AYRI ONAY + preflight PASS sonrası, kaynak-başına):
--   -- SELECT public.yh_source_activation_set('biyoenerji:chakras', true, false,
--   --                                        'FUTURE_ONLY_READY','professional','cohort-A activation');
--   -- KILL-SWITCH: SELECT public.yh_source_deactivate('biyoenerji:chakras'); (index KORUNUR)
-- =============================================================================
