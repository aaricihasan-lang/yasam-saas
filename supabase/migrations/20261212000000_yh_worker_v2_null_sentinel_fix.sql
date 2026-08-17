-- =============================================================================
-- 20261212000000_yh_worker_v2_null_sentinel_fix.sql
--
-- YAŞAM HAFIZASI™ — WORKER V2: PARENT-DERIVED CDC "NULL SENTINEL" FIX (forward-only).
--
-- KÖK NEDEN (production B5 cascade-delete ghost — DOĞRULANDI):
--   yh_cdc_enqueue_reference_row_v2() içindeki
--     v_found boolean := false;
--     SELECT s.tenant_id, true INTO v_tenant_id, v_found FROM ... WHERE s.id = v_sheet_id;
--     IF NOT v_found THEN ... RETURN ... END IF;
--   PL/pgSQL'de `SELECT ... INTO` SIFIR satır döndürürse TÜM hedef değişkenlere NULL atar
--   (STRICT değil). Böylece parent (cascade delete sırasında zaten silinmiş) bulunamayınca
--   v_tenant_id=NULL VE v_found=NULL olur. `IF NOT v_found` → `NOT NULL` = NULL → THEN gövdesi
--   ÇALIŞMAZ (yalnız TRUE'da çalışır). "Parent yok → SKIP" niyeti atlanır, akış düşer ve
--     v_scope := 'shared'  +  tenant_id := NULL
--   ile child DELETE olayı enqueue edilir. Parent BEFORE-DELETE capture'ın (authoritative)
--   yazdığı DOĞRU tenant DELETE olayı, aynı UNIQUE(source_key, source_id) outbox satırında
--   coalesce ile EZİLİR. Worker shared deindex (tenant_id IS NULL) yapar → tenant index satırı
--   eşleşmez → delete-none/succeeded → tenant GHOST kalır.
--
-- DÜZELTME (en küçük, davranış-koruyan): found guard'ını NULL-güvenli hale getir.
--   `IF NOT v_found` → `IF v_found IS DISTINCT FROM true`
--   Böylece v_found NULL (satır yok) VE false → "bulunamadı" kabul edilir; parent bulunduğunda
--   (v_found=true) tenant/shared davranışı DEĞİŞMEZ (shared parent: v_found=true, tenant NULL →
--   scope 'shared' korunur; tenant parent: tenant UUID → 'tenant').
--
-- AYNI DEFEKT SINIFI (production-exposed ama gözlemlenen kök neden DEĞİL):
--   yh_cdc_enqueue_guide_section_v2() aynı sentinel desenini kullanır; ancak guard'ı
--   `IF NOT v_found OR v_tenant_id IS NULL` olduğundan parent yokken `NULL OR (NULL IS NULL)`
--   = `NULL OR TRUE` = TRUE ile GÜVENLE döner (guide-sections SHARED değil). Yine de aynı
--   sınıf için netlik/tutarlılık amacıyla found-terimini NULL-güvenli yapıyoruz. Shared-unsupported
--   davranışı (parent tenant NULL → SKIP) `OR v_tenant_id IS NULL` ile AYNEN korunur.
--
-- KAPSAM: yalnız iki fonksiyon gövdesi CREATE OR REPLACE. Trigger'lar DEĞİŞMEZ (aynı OID; mevcut
--   trigger'lar yeni gövdeyi otomatik kullanır → yeniden ATTACH gerekmez). HİÇBİR: source DML,
--   index DML, outbox DML, aktivasyon mutasyonu, backfill, reconcile, historical enqueue, ghost
--   temizliği. Diğer 3 Worker-v2 fonksiyonu (put_v2, shared_optional, capture'lar) DOKUNULMAZ.
--
-- GÜVENLİK POSTURE: SECURITY DEFINER + sabit search_path + schema-qualified; CREATE OR REPLACE
--   grant'ları korur, yine de mevcut posture ile birebir REVOKE tekrarlanır (PUBLIC/anon/authenticated).
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION + REVOKE (tekrar no-op). ROLLBACK-ONLY: tek transaction;
--   herhangi bir precondition/adım hata verirse tümü geri alınır.
-- UYGULAMA: Supabase Dashboard SQL Editor (AYRI ONAY; bu turda UYGULANMAZ).
-- HISTORICAL MIGRATION 20261210000000 DEĞİŞTİRİLMEZ (immutable).
-- =============================================================================

BEGIN;

-- ─── 0) FAIL-CLOSED PRECONDITIONS (beklenen Worker-v2 topolojisi yoksa uygulama) ─
DO $pre$
DECLARE
  v_tbl  text;
  v_tables text[] := ARRAY[
    'aromatherapy_reference_sheets','aromatherapy_reference_rows',
    'healing_guides','healing_guide_sections','yasam_hafizasi_outbox','yh_source_activation'
  ];
  v_trg  text;
  v_trgs text[] := ARRAY[
    'yh_cdc_aromatherapy_reference_rows_v2_trg',
    'yh_capture_reference_sheet_children_del_trg',
    'yh_capture_reference_sheet_children_upd_trg',
    'yh_cdc_healing_guide_sections_v2_trg'
  ];
  v_key  text;
  v_keys text[] := ARRAY['aromaterapi:reference-rows','sifa_rehberi:guide-sections'];
BEGIN
  -- Düzeltilecek fonksiyonlar mevcut mu?
  IF to_regprocedure('public.yh_cdc_enqueue_reference_row_v2()') IS NULL THEN
    RAISE EXCEPTION 'NULL-SENTINEL FIX BLOCKER: public.yh_cdc_enqueue_reference_row_v2() yok — 20261210000000 uygulanmali';
  END IF;
  IF to_regprocedure('public.yh_cdc_enqueue_guide_section_v2()') IS NULL THEN
    RAISE EXCEPTION 'NULL-SENTINEL FIX BLOCKER: public.yh_cdc_enqueue_guide_section_v2() yok — 20261210000000 uygulanmali';
  END IF;
  -- outbox helper mevcut mu? (fonksiyonlar buna delege eder)
  IF to_regprocedure('public.yh_outbox_put_v2(text,text,uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'NULL-SENTINEL FIX BLOCKER: public.yh_outbox_put_v2 yok';
  END IF;
  -- Tablolar
  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF to_regclass('public.'||v_tbl) IS NULL THEN
      RAISE EXCEPTION 'NULL-SENTINEL FIX BLOCKER: public.% tablosu yok', v_tbl;
    END IF;
  END LOOP;
  -- Worker-v2 trigger topolojisi bağlı mı? (yanlış DB'ye uygulamayı engelle)
  FOREACH v_trg IN ARRAY v_trgs LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgname = v_trg
    ) THEN
      RAISE EXCEPTION 'NULL-SENTINEL FIX BLOCKER: beklenen trigger % bagli degil', v_trg;
    END IF;
  END LOOP;
  -- Beklenen kaynak aktivasyon satırları mevcut mu? (topoloji doğrulaması; is_active DEĞERİ zorlanmaz)
  FOREACH v_key IN ARRAY v_keys LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.yh_source_activation a WHERE a.source_key = v_key
    ) THEN
      RAISE EXCEPTION 'NULL-SENTINEL FIX BLOCKER: yh_source_activation satiri yok (%)', v_key;
    END IF;
  END LOOP;
END
$pre$;

-- ─── 1) FIX A: reference_rows child enqueue (KÖK NEDEN) ───────────────────────
-- 20261210000000 gövdesiyle BİREBİR; TEK fark: found guard NULL-güvenli.
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
  -- Parent YOK → SKIP. NULL-GÜVENLİ: `SELECT ... INTO` sıfır satırda v_found'u NULL yapar; bu yüzden
  -- `NOT v_found` (=NULL) YERİNE `IS DISTINCT FROM true` kullanılır (NULL ve false → bulunamadı).
  -- (cascade delete → parent-side capture authoritative; direct write'ta orphan olamaz FK).
  IF v_found IS DISTINCT FROM true THEN
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

-- ─── 2) FIX B: guide_sections child enqueue (aynı defekt sınıfı; sertleştirme) ──
-- 20261210000000 gövdesiyle BİREBİR; TEK fark: found guard NULL-güvenli. Shared-unsupported
-- davranışı `OR v_tenant_id IS NULL` ile AYNEN korunur (parent tenant NULL → SKIP).
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
  -- NULL-GÜVENLİ found terimi (`IS DISTINCT FROM true`); shared-unsupported için `OR v_tenant_id IS NULL` korunur.
  IF v_found IS DISTINCT FROM true OR v_tenant_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  PERFORM public.yh_outbox_put_v2(v_source_key, 'healing_guide_sections', v_source_id, v_tenant_id, 'tenant', v_operation);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_cdc_enqueue_guide_section_v2() FROM PUBLIC, anon, authenticated;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   -- 1) Fix uygulandı (her iki fonksiyon gövdesinde NULL-güvenli guard):
--   SELECT proname FROM pg_proc
--     WHERE proname IN ('yh_cdc_enqueue_reference_row_v2','yh_cdc_enqueue_guide_section_v2')
--       AND pg_get_functiondef(oid) LIKE '%v_found IS DISTINCT FROM true%';         -- 2 satir
--   -- 2) reference_row'da eski kırılgan `IF NOT v_found THEN` KALMADI:
--   SELECT count(*) FROM pg_proc WHERE proname = 'yh_cdc_enqueue_reference_row_v2'
--     AND pg_get_functiondef(oid) ~ 'IF\s+NOT\s+v_found\s+THEN';                    -- 0
--   -- 3) Trigger'lar DEĞİŞMEDİ (CREATE OR REPLACE OID'i korur):
--   SELECT tgname FROM pg_trigger WHERE NOT tgisinternal
--     AND tgname IN ('yh_cdc_aromatherapy_reference_rows_v2_trg','yh_cdc_healing_guide_sections_v2_trg'); -- 2
--   -- 4) Güvenlik: anon/authenticated EXECUTE yok:
--   SELECT has_function_privilege('anon','public.yh_cdc_enqueue_reference_row_v2()','EXECUTE');  -- false
--   -- 5) Bu migration index/outbox/source DML'i + aktivasyon değişikliği YAPMAZ.
--
-- CASCADE DAVRANIŞ REGRESSION (staging/non-prod): scripts/yh-worker-v2/nullSentinelRegression.sql
--   (tek transaction + ROLLBACK; gerçek trigger/cascade üzerinden outbox scope doğrular).
-- =============================================================================
