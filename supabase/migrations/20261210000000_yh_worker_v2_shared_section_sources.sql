-- =============================================================================
-- 20261210000000_yh_worker_v2_shared_section_sources.sql
--
-- YAŞAM HAFIZASI™ — WORKER V2: 5 DEFERRED PROFESSIONAL SOURCE EVENT-DRIVEN PARITY.
--
-- KAPSAM (yalnız aşağıdaki 5 kaynak; başka kaynak DAVRANIŞI DEĞİŞMEZ):
--   A) dogaltas:knowledge            → stone_knowledge_articles      (shared-optional; own tenant_id NULL=shared)
--   B) aromaterapi:oils              → aromatherapy_oils             (shared-optional)
--   C) aromaterapi:reference-sheets  → aromatherapy_reference_sheets (shared-optional; reference-rows PARENT'ı)
--   D) aromaterapi:reference-rows    → aromatherapy_reference_rows   (parent-derived scope + shared; join)
--   E) sifa_rehberi:guide-sections   → healing_guide_sections        (unit=section; parent-derived scope; join)
--
-- WORKER-V2 CAPABILITY (global gate gevşetmesi YOK; yalnız registry'de AÇIKÇA capability atanmış
--   kaynak geçer — bkz. lib/yasam-hafizasi/indexer/sources.ts workerCapabilities):
--   - shared-optional-professional: tenant_id NULL → SHARED professional referans (outbox tenant_scope='shared').
--   - parent-derived-scope: child tenant/shared scope parent'tan çözülür + PARENT-SIDE BEFORE-DELETE capture
--     (ON DELETE CASCADE'de child trigger parent'ı resolve EDEMEZ → cascade öncesi parent tarafında
--     child delete olayları enqueue edilir; child cascade trigger'ı sonrasında SILENT SKIP GHOST bırakmaz).
--   - section-unit: unit=section worker desteği (yalnız guide-sections; global değil).
--
-- MERGE-SAFE / APPLY-SAFE (KİLİTLİ): TRIGGER ATTACHED ≠ SOURCE ACTIVATED. Tüm enqueue AKTİVASYON-KAPILI
--   (yh_source_activation.is_active=true YOKSA sessiz NO-OP; kaynak CRUD ENGELLENMEZ). Bu migration:
--     - yh_source_activation'a HİÇBİR satır INSERT ETMEZ (5 kaynak OFF kalır)
--     - is_active=true / backfill_allowed=true YAPMAZ
--     - kaynak/index DATA DML YAPMAZ (INSERT/UPDATE/DELETE yok) - historical/bulk enqueue YAPMAZ
--     - reconcile/purge YAPMAZ - mevcut index satırlarını TEMİZLEMEZ
--
-- OUTBOX ADDITIVE SHARED MODEL: yasam_hafizasi_outbox.tenant_id NULLABLE + tenant_scope discriminator
--   (DEFAULT 'tenant'; CHECK (tenant_scope='shared')=(tenant_id IS NULL)). Mevcut satırlar + mevcut
--   trigger'lar (yh_cdc_enqueue / yh_outbox_stones_enqueue) DEĞİŞMEZ: tenant_id NOT NULL yazarlar →
--   scope DEFAULT 'tenant' → check PASS. NULL tenant YALNIZ tenant_scope='shared' ile mümkün → başka
--   column-tenant kaynağında NULL hâlâ FAIL-CLOSED (kendi trigger'ları RAISE eder + worker gate reddeder).
--
-- CASCADE VALIDATION NOTU: Bu ortamda disposable/local PostgreSQL YOK → cascade/trigger sıra davranışı
--   RUNTIME'da doğrulanamadı. Parent-side BEFORE-DELETE capture tasarımı bu belirsizliğe KARŞI güvenlidir
--   (parent hâlâ mevcutken child kimlikleri capture edilir). PostgreSQL RI cascade/trigger-order EXACT
--   doğrulaması production apply ÖNCESİ strict preflight/acceptance gate'e bırakılmıştır
--   (scripts/yh-worker-v2/preflight.sql; ayrı onay + apply öncesi zorunlu).
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS / CREATE TRIGGER; ALTER'lar guard'lı.
-- ROLLBACK-ONLY: tek transaction; herhangi bir adım hata verirse tümü geri alınır.
-- =============================================================================

BEGIN;

-- ─── 0) FAIL-CLOSED PRECONDITIONS ────────────────────────────────────────────
DO $pre$
DECLARE
  v_tbl text;
  v_tables text[] := ARRAY[
    'stone_knowledge_articles','aromatherapy_oils','aromatherapy_reference_sheets',
    'aromatherapy_reference_rows','healing_guide_sections','healing_guides',
    'yasam_hafizasi_outbox'
  ];
BEGIN
  IF to_regclass('public.yh_source_activation') IS NULL THEN
    RAISE EXCEPTION 'BF-Worker-v2 BLOCKER: public.yh_source_activation yok — önce 20260927000000 uygulanmali';
  END IF;
  IF to_regclass('public.yasam_hafizasi_outbox_event_version_seq') IS NULL THEN
    RAISE EXCEPTION 'BF-Worker-v2 BLOCKER: yasam_hafizasi_outbox_event_version_seq yok';
  END IF;
  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF to_regclass('public.'||v_tbl) IS NULL THEN
      RAISE EXCEPTION 'BF-Worker-v2 BLOCKER: public.% tablosu yok', v_tbl;
    END IF;
  END LOOP;
END
$pre$;

-- ─── 1) OUTBOX ADDITIVE SHARED MODEL (backward-compatible) ───────────────────
ALTER TABLE public.yasam_hafizasi_outbox ALTER COLUMN tenant_id DROP NOT NULL;

ALTER TABLE public.yasam_hafizasi_outbox
  ADD COLUMN IF NOT EXISTS tenant_scope text NOT NULL DEFAULT 'tenant';

DO $c1$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'yho_tenant_scope_chk') THEN
    ALTER TABLE public.yasam_hafizasi_outbox
      ADD CONSTRAINT yho_tenant_scope_chk CHECK (tenant_scope IN ('tenant','shared'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'yho_shared_null_chk') THEN
    -- SHARED ⟺ tenant_id IS NULL. tenant scope → tenant_id NOT NULL. Mevcut satırlar (scope DEFAULT
    -- 'tenant', tenant_id NOT NULL) bu invariantı sağlar → validate PASS.
    ALTER TABLE public.yasam_hafizasi_outbox
      ADD CONSTRAINT yho_shared_null_chk CHECK ((tenant_scope = 'shared') = (tenant_id IS NULL));
  END IF;
END
$c1$;

-- ─── 2) CORE ENQUEUE HELPER (Worker-v2; aktivasyon-kapılı; scope-aware coalescing) ──
-- Tüm Worker-v2 trigger fonksiyonları outbox yazımını buraya delege eder (tek doğru coalescing).
-- Aktivasyon kapalı → sessiz no-op. scope/tenant tutarsız (shared≠null) → RAISE (fail-closed).
CREATE OR REPLACE FUNCTION public.yh_outbox_put_v2(
  p_source_key    text,
  p_source_table  text,
  p_source_id     uuid,
  p_tenant_id     uuid,
  p_tenant_scope  text,
  p_operation     text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_active boolean;
BEGIN
  IF p_source_key IS NULL OR length(btrim(p_source_key)) = 0 THEN
    RAISE EXCEPTION 'yh_outbox_put_v2: source_key eksik';
  END IF;
  IF p_source_id IS NULL THEN
    RAISE EXCEPTION 'yh_outbox_put_v2: source_id null (%, %)', p_source_table, p_source_key;
  END IF;
  IF p_tenant_scope IS DISTINCT FROM 'tenant' AND p_tenant_scope IS DISTINCT FROM 'shared' THEN
    RAISE EXCEPTION 'yh_outbox_put_v2: gecersiz tenant_scope %', p_tenant_scope;
  END IF;
  -- scope/tenant tutarlılığı (outbox CHECK ile birebir; erken fail-closed).
  IF (p_tenant_scope = 'shared') IS DISTINCT FROM (p_tenant_id IS NULL) THEN
    RAISE EXCEPTION 'yh_outbox_put_v2: scope/tenant tutarsiz (%, tenant=%)', p_tenant_scope, p_tenant_id;
  END IF;

  -- AKTİVASYON KAPISI: kapalı kaynak OLAY ÜRETMEZ (sessiz no-op).
  SELECT a.is_active INTO v_active FROM public.yh_source_activation AS a WHERE a.source_key = p_source_key;
  IF v_active IS DISTINCT FROM true THEN
    RETURN;
  END IF;

  INSERT INTO public.yasam_hafizasi_outbox AS o
    (source_key, source_table, source_id, tenant_id, tenant_scope, operation)
  VALUES
    (p_source_key, p_source_table, p_source_id, p_tenant_id, p_tenant_scope, p_operation)
  ON CONFLICT (source_key, source_id) DO UPDATE
  SET operation     = EXCLUDED.operation,
      source_table  = EXCLUDED.source_table,
      tenant_id     = EXCLUDED.tenant_id,
      tenant_scope  = EXCLUDED.tenant_scope,
      event_version = nextval('public.yasam_hafizasi_outbox_event_version_seq'),
      updated_at    = now(),
      status        = CASE WHEN o.status = 'processing' THEN o.status       ELSE 'pending' END,
      attempts      = CASE WHEN o.status = 'processing' THEN o.attempts     ELSE 0         END,
      available_at  = CASE WHEN o.status = 'processing' THEN o.available_at  ELSE now()     END,
      locked_at     = CASE WHEN o.status = 'processing' THEN o.locked_at     ELSE NULL      END,
      locked_by     = CASE WHEN o.status = 'processing' THEN o.locked_by     ELSE NULL      END,
      last_error    = CASE WHEN o.status = 'processing' THEN o.last_error    ELSE NULL      END,
      processed_at  = CASE WHEN o.status = 'processing' THEN o.processed_at  ELSE NULL      END;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_outbox_put_v2(text, text, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ─── 3) SHARED-OPTIONAL COLUMN enqueue (knowledge / oils / reference-sheets) ──
-- Own tenant_id kolonu: NOT NULL → tenant event; NULL → SHARED event (scope 'shared').
CREATE OR REPLACE FUNCTION public.yh_cdc_enqueue_shared_optional_v2()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_source_key   text := TG_ARGV[0];
  v_expect_table text := TG_ARGV[1];
  v_operation    text;
  v_source_id    uuid;
  v_tenant_id    uuid;
  v_scope        text;
BEGIN
  IF v_source_key IS NULL OR length(btrim(v_source_key)) = 0 THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_shared_optional_v2: source_key argumani eksik';
  END IF;
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public' OR TG_TABLE_NAME IS DISTINCT FROM v_expect_table THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_shared_optional_v2: tablo uyusmazligi (%.% <> %)', TG_TABLE_SCHEMA, TG_TABLE_NAME, v_expect_table;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_operation := 'upsert'; v_source_id := NEW.id; v_tenant_id := NEW.tenant_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_operation := 'delete'; v_source_id := OLD.id; v_tenant_id := OLD.tenant_id;  -- OLD scope korunur
  ELSE
    RAISE EXCEPTION 'yh_cdc_enqueue_shared_optional_v2: desteklenmeyen TG_OP %', TG_OP;
  END IF;

  v_scope := CASE WHEN v_tenant_id IS NULL THEN 'shared' ELSE 'tenant' END;
  PERFORM public.yh_outbox_put_v2(v_source_key, TG_TABLE_NAME, v_source_id, v_tenant_id, v_scope, v_operation);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_cdc_enqueue_shared_optional_v2() FROM PUBLIC, anon, authenticated;

-- ─── 4) PARENT-DERIVED child enqueue: aromatherapy_reference_rows ─────────────
-- Child'da tenant_id YOK; scope parent sheet'ten çözülür. Parent tenant NULL → SHARED. Parent YOK
-- (cascade delete) → SKIP (parent-side capture zaten enqueue etti; GHOST bırakmaz). source_id = row id.
CREATE OR REPLACE FUNCTION public.yh_cdc_enqueue_reference_row_v2()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_source_key text := 'aromaterapi:reference-rows';
  v_operation  text;
  v_source_id  uuid;
  v_sheet_id   uuid;
  v_tenant_id  uuid;
  v_found      boolean := false;
  v_scope      text;
BEGIN
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public' OR TG_TABLE_NAME IS DISTINCT FROM 'aromatherapy_reference_rows' THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_reference_row_v2: beklenmeyen tablo %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_operation := 'upsert'; v_source_id := NEW.id; v_sheet_id := NEW.sheet_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_operation := 'delete'; v_source_id := OLD.id; v_sheet_id := OLD.sheet_id;
  ELSE
    RAISE EXCEPTION 'yh_cdc_enqueue_reference_row_v2: desteklenmeyen TG_OP %', TG_OP;
  END IF;

  IF v_sheet_id IS NOT NULL THEN
    SELECT s.tenant_id, true INTO v_tenant_id, v_found
    FROM public.aromatherapy_reference_sheets AS s WHERE s.id = v_sheet_id;
  END IF;
  -- Parent YOK → SKIP (cascade delete → parent-side capture handled; direct write'ta orphan olamaz FK).
  IF NOT v_found THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_scope := CASE WHEN v_tenant_id IS NULL THEN 'shared' ELSE 'tenant' END;
  PERFORM public.yh_outbox_put_v2(v_source_key, 'aromatherapy_reference_rows', v_source_id, v_tenant_id, v_scope, v_operation);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_cdc_enqueue_reference_row_v2() FROM PUBLIC, anon, authenticated;

-- ─── 5) PARENT-SIDE CAPTURE: aromatherapy_reference_sheets → reference-rows ───
-- BEFORE DELETE: parent hâlâ mevcut + child'lar hâlâ mevcut → her child için DELETE olayı enqueue
--   (bounded: yalnız bu sheet'in child'ları). Cascade sonrası child trigger parent'ı bulamaz → skip
--   (ghost YOK). AFTER UPDATE OF tenant_id: scope değişimi → her child için UPSERT re-eval (bounded;
--   index conflict key source_id → tek satır tenant güncellenir, ghost YOK). Aktivasyon-kapılı (child key).
CREATE OR REPLACE FUNCTION public.yh_capture_reference_sheet_children()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_child_key    text := 'aromaterapi:reference-rows';
  v_active       boolean;
  v_op           text;
  v_tenant_id    uuid;
  v_scope        text;
  v_child        record;
BEGIN
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public' OR TG_TABLE_NAME IS DISTINCT FROM 'aromatherapy_reference_sheets' THEN
    RAISE EXCEPTION 'yh_capture_reference_sheet_children: beklenmeyen tablo %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME;
  END IF;

  -- Aktivasyon kapalı → bounded child scan YAPMA (perf + no-op).
  SELECT a.is_active INTO v_active FROM public.yh_source_activation AS a WHERE a.source_key = v_child_key;
  IF v_active IS DISTINCT FROM true THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_op := 'delete'; v_tenant_id := OLD.tenant_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Yalnız tenant scope değişiminde re-eval (aksi child'a etkisi yok). is_active child eligibility'sini
    -- ETKİLEMEZ (child builder parent is_active okumaz) → gereksiz re-eval YAPILMAZ.
    IF NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id THEN
      RETURN NEW;
    END IF;
    v_op := 'upsert'; v_tenant_id := NEW.tenant_id;
  ELSE
    RETURN NEW;
  END IF;

  v_scope := CASE WHEN v_tenant_id IS NULL THEN 'shared' ELSE 'tenant' END;
  -- BOUNDED fan-out: yalnız bu parent'ın child'ları (historical/global scan YOK).
  FOR v_child IN
    SELECT r.id FROM public.aromatherapy_reference_rows AS r
    WHERE r.sheet_id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END)
  LOOP
    PERFORM public.yh_outbox_put_v2(v_child_key, 'aromatherapy_reference_rows', v_child.id, v_tenant_id, v_scope, v_op);
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_capture_reference_sheet_children() FROM PUBLIC, anon, authenticated;

-- ─── 6) PARENT-DERIVED child enqueue: healing_guide_sections (unit=section) ──
-- Child'da tenant_id YOK; tenant parent guide'dan. guide-sections SHARED DEĞİL (allowSharedNull yok):
-- parent tenant NULL → SKIP (shared section desteklenmez). Parent YOK (cascade) → SKIP (parent capture).
CREATE OR REPLACE FUNCTION public.yh_cdc_enqueue_guide_section_v2()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_source_key text := 'sifa_rehberi:guide-sections';
  v_operation  text;
  v_source_id  uuid;
  v_guide_id   uuid;
  v_tenant_id  uuid;
  v_found      boolean := false;
BEGIN
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public' OR TG_TABLE_NAME IS DISTINCT FROM 'healing_guide_sections' THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_guide_section_v2: beklenmeyen tablo %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_operation := 'upsert'; v_source_id := NEW.id; v_guide_id := NEW.guide_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_operation := 'delete'; v_source_id := OLD.id; v_guide_id := OLD.guide_id;
  ELSE
    RAISE EXCEPTION 'yh_cdc_enqueue_guide_section_v2: desteklenmeyen TG_OP %', TG_OP;
  END IF;

  IF v_guide_id IS NOT NULL THEN
    SELECT g.tenant_id, true INTO v_tenant_id, v_found
    FROM public.healing_guides AS g WHERE g.id = v_guide_id;
  END IF;
  -- Parent YOK (cascade → parent capture) VEYA parent tenant NULL (shared guide; section shared değil) → SKIP.
  IF NOT v_found OR v_tenant_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  PERFORM public.yh_outbox_put_v2(v_source_key, 'healing_guide_sections', v_source_id, v_tenant_id, 'tenant', v_operation);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_cdc_enqueue_guide_section_v2() FROM PUBLIC, anon, authenticated;

-- ─── 7) PARENT-SIDE CAPTURE: healing_guides → guide-sections ──────────────────
-- BEFORE DELETE: her section için DELETE olayı (bounded). AFTER UPDATE OF tenant_id: re-eval (bounded).
-- guide-sections shared değil → parent tenant NULL ise child event ÜRETİLMEZ (section shared değil).
CREATE OR REPLACE FUNCTION public.yh_capture_guide_sections()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_child_key text := 'sifa_rehberi:guide-sections';
  v_active    boolean;
  v_op        text;
  v_tenant_id uuid;
  v_child     record;
BEGIN
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public' OR TG_TABLE_NAME IS DISTINCT FROM 'healing_guides' THEN
    RAISE EXCEPTION 'yh_capture_guide_sections: beklenmeyen tablo %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME;
  END IF;

  SELECT a.is_active INTO v_active FROM public.yh_source_activation AS a WHERE a.source_key = v_child_key;
  IF v_active IS DISTINCT FROM true THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_op := 'delete'; v_tenant_id := OLD.tenant_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id THEN
      RETURN NEW;
    END IF;
    v_op := 'upsert'; v_tenant_id := NEW.tenant_id;
  ELSE
    RETURN NEW;
  END IF;

  -- guide-sections shared DEĞİL: parent tenant NULL → child event üretilmez (section shared değil).
  IF v_tenant_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  FOR v_child IN
    SELECT s.id FROM public.healing_guide_sections AS s
    WHERE s.guide_id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END)
  LOOP
    PERFORM public.yh_outbox_put_v2(v_child_key, 'healing_guide_sections', v_child.id, v_tenant_id, 'tenant', v_op);
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_capture_guide_sections() FROM PUBLIC, anon, authenticated;

-- ─── 8) TRIGGER ATTACH ────────────────────────────────────────────────────────
-- A/B/C: shared-optional column sources (own tenant_id).
DROP TRIGGER IF EXISTS yh_cdc_stone_knowledge_articles_v2_trg ON public.stone_knowledge_articles;
CREATE TRIGGER yh_cdc_stone_knowledge_articles_v2_trg AFTER INSERT OR UPDATE OR DELETE ON public.stone_knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_shared_optional_v2('dogaltas:knowledge', 'stone_knowledge_articles');

DROP TRIGGER IF EXISTS yh_cdc_aromatherapy_oils_v2_trg ON public.aromatherapy_oils;
CREATE TRIGGER yh_cdc_aromatherapy_oils_v2_trg AFTER INSERT OR UPDATE OR DELETE ON public.aromatherapy_oils
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_shared_optional_v2('aromaterapi:oils', 'aromatherapy_oils');

DROP TRIGGER IF EXISTS yh_cdc_aromatherapy_reference_sheets_v2_trg ON public.aromatherapy_reference_sheets;
CREATE TRIGGER yh_cdc_aromatherapy_reference_sheets_v2_trg AFTER INSERT OR UPDATE OR DELETE ON public.aromatherapy_reference_sheets
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_shared_optional_v2('aromaterapi:reference-sheets', 'aromatherapy_reference_sheets');

-- C-parent: reference_sheets parent-side capture for reference_rows (cascade-safe + scope re-eval).
DROP TRIGGER IF EXISTS yh_capture_reference_sheet_children_del_trg ON public.aromatherapy_reference_sheets;
CREATE TRIGGER yh_capture_reference_sheet_children_del_trg BEFORE DELETE ON public.aromatherapy_reference_sheets
  FOR EACH ROW EXECUTE FUNCTION public.yh_capture_reference_sheet_children();
DROP TRIGGER IF EXISTS yh_capture_reference_sheet_children_upd_trg ON public.aromatherapy_reference_sheets;
CREATE TRIGGER yh_capture_reference_sheet_children_upd_trg AFTER UPDATE OF tenant_id ON public.aromatherapy_reference_sheets
  FOR EACH ROW EXECUTE FUNCTION public.yh_capture_reference_sheet_children();

-- D: reference_rows child (parent-derived scope).
DROP TRIGGER IF EXISTS yh_cdc_aromatherapy_reference_rows_v2_trg ON public.aromatherapy_reference_rows;
CREATE TRIGGER yh_cdc_aromatherapy_reference_rows_v2_trg AFTER INSERT OR UPDATE OR DELETE ON public.aromatherapy_reference_rows
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_reference_row_v2();

-- E: guide_sections child (unit=section, parent-derived scope).
DROP TRIGGER IF EXISTS yh_cdc_healing_guide_sections_v2_trg ON public.healing_guide_sections;
CREATE TRIGGER yh_cdc_healing_guide_sections_v2_trg AFTER INSERT OR UPDATE OR DELETE ON public.healing_guide_sections
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_guide_section_v2();

-- E-parent: healing_guides parent-side capture for guide_sections (SEPARATE from existing
-- yh_cdc_healing_guides_trg which indexes the guide itself — that trigger DEĞİŞMEZ).
DROP TRIGGER IF EXISTS yh_capture_guide_sections_del_trg ON public.healing_guides;
CREATE TRIGGER yh_capture_guide_sections_del_trg BEFORE DELETE ON public.healing_guides
  FOR EACH ROW EXECUTE FUNCTION public.yh_capture_guide_sections();
DROP TRIGGER IF EXISTS yh_capture_guide_sections_upd_trg ON public.healing_guides;
CREATE TRIGGER yh_capture_guide_sections_upd_trg AFTER UPDATE OF tenant_id ON public.healing_guides
  FOR EACH ROW EXECUTE FUNCTION public.yh_capture_guide_sections();

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   -- 1) outbox additive shared model:
--   SELECT is_nullable FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='yasam_hafizasi_outbox' AND column_name='tenant_id'; -- YES
--   SELECT conname FROM pg_constraint WHERE conname IN ('yho_tenant_scope_chk','yho_shared_null_chk'); -- 2
--   -- 2) 5 child/source enqueue trigger + 2 parent-capture DELETE + 2 parent-capture UPDATE bağlı.
--   -- 3) Mevcut yh_cdc_healing_guides_trg / yh_cdc_enqueue / stones trigger DEĞİŞMEDİ.
--   -- 4) HİÇBİR kaynak aktif değil:
--   SELECT count(*) FROM public.yh_source_activation WHERE source_key IN
--     ('dogaltas:knowledge','aromaterapi:oils','aromaterapi:reference-sheets',
--      'aromaterapi:reference-rows','sifa_rehberi:guide-sections') AND is_active;  -- 0
--   -- 5) Bu migration index/veri DML'i yapmaz; historical enqueue = 0.
--
-- CASCADE/TRIGGER-ORDER EXACT VALIDATION → scripts/yh-worker-v2/preflight.sql (production apply öncesi;
--   ayrı onay). Bu ortamda disposable PostgreSQL YOKTU → parent-side capture design DB-order'a dayanmaz.
-- AKTİVASYON (bu migration'da DEĞİL; AYRI ONAY): SELECT public.yh_source_activation_set(<key>, true, ...).
-- =============================================================================
