-- =============================================================================
-- 20261222000000_yh_kupa_hacamat_cdc_triggers.sql
--
-- YAŞAM HAFIZASI™ — PROFESSIONAL COVERAGE COMPLETION: KUPA & HACAMAT CDC (PREDEPLOY EXPAND).
--
-- KAPSAM (yalnız trigger entegrasyonu; yeni fonksiyon YOK):
--   Kupa & Hacamat'ın aranması-değerli 5 tenant-scoped professional tablosuna mevcut generic
--   AKTİVASYON-KAPILI enqueue fonksiyonunu (public.yh_cdc_enqueue — migration 20260927000000)
--   AFTER INSERT/UPDATE/DELETE trigger olarak bağlar:
--     cupping_knowledge_records → kupa_hacamat:knowledge
--     cupping_points            → kupa_hacamat:points
--     cupping_topics            → kupa_hacamat:topics
--     cupping_techniques        → kupa_hacamat:techniques
--     cupping_safety_notes      → kupa_hacamat:safety-notes
--
-- BİLİNÇLİ DIŞARIDA (trigger YOK): cupping_point_placements (koordinat/atlas geometrisi),
--   cupping_point_topics (junction), cupping_sources + 6 *_sources citation junction (bibliyografik /
--   provenance; arama değeri yok). Kozmik 'hacamat_rules' ile İLGİSİZ ve ONA DOKUNULMAZ.
--
-- BU MIGRATION:
--   - HİÇBİR kaynak tabloyu ALTER etmez; index'e YAZMAZ; DML/seed/backfill/manuel event İÇERMEZ.
--   - AKTİVASYON YAPMAZ: yh_cdc_enqueue aktivasyon-kapılıdır → yh_source_activation.is_active=true
--     olmadan enqueue SESSİZ NO-OP. Bu 5 kaynak default OFF kalır (ayrı POSTDEPLOY activation +
--     kod enabled:true ÇİFT KAPI). CODE ENABLED ≠ TRIGGER INSTALLED ≠ DB ACTIVATED.
--   - Backfill YOK: yalnız aktivasyon SONRASI yeni INSERT→upsert / UPDATE→refresh / DELETE→deindex.
--
-- ATOMİKLİK: AFTER trigger + outbox yazımı kaynak CRUD ile AYNI transaction (dual-write açığı yok).
--   is_active soft-delete (is_active=false) satırları reader tarafında fetch edilmez → UPDATE ile
--   is_active=false → kaynak "artık indexlenemez" → not-found → defensive deindex (ghost yok).
-- GÜVENLİK: yh_cdc_enqueue SECURITY DEFINER + sabit search_path; PUBLIC/anon/authenticated EXECUTE kapalı.
--   Demo/synthetic professional ban writer katmanında (createSupabaseIndexWriter) aynen korunur.
--
-- UYGULAMA: Supabase Dashboard SQL Editor. AYRI ONAY. Production apply bu paketin DIŞINDA.
-- IDEMPOTENT: DROP TRIGGER IF EXISTS / CREATE TRIGGER (yeni fonksiyon yok; tekrar no-op).
-- ROLLBACK: her CREATE TRIGGER için DROP TRIGGER IF EXISTS <ad> ON public.<tablo>; index ETKİLENMEZ.
-- =============================================================================

BEGIN;

-- ─── 0) FAIL-CLOSED PRECONDITIONS ────────────────────────────────────────────
DO $pre$
DECLARE
  v_tbl text;
  v_tables text[] := ARRAY[
    'cupping_knowledge_records','cupping_points','cupping_topics',
    'cupping_techniques','cupping_safety_notes'
  ];
BEGIN
  IF to_regprocedure('public.yh_cdc_enqueue()') IS NULL THEN
    RAISE EXCEPTION 'Coverage Completion BLOCKER: public.yh_cdc_enqueue() yok — önce 20260927000000 uygulanmali';
  END IF;
  IF to_regclass('public.yh_source_activation') IS NULL THEN
    RAISE EXCEPTION 'Coverage Completion BLOCKER: public.yh_source_activation yok — önce 20260927000000 uygulanmali';
  END IF;
  IF to_regclass('public.yasam_hafizasi_outbox') IS NULL THEN
    RAISE EXCEPTION 'Coverage Completion BLOCKER: public.yasam_hafizasi_outbox yok — önce 20260815000000 uygulanmali';
  END IF;
  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF to_regclass('public.'||v_tbl) IS NULL THEN
      RAISE EXCEPTION 'Coverage Completion BLOCKER: public.% tablosu yok', v_tbl;
    END IF;
  END LOOP;
END
$pre$;

-- ─── 1) GENERIC column-tenant (NOT NULL) triggers — worker-v1-supported 5 kaynak ──
-- public.yh_cdc_enqueue(source_key, source_table); AFTER I/U/D FOR EACH ROW; aktivasyon-kapılı.
DROP TRIGGER IF EXISTS yh_cdc_cupping_knowledge_records_trg ON public.cupping_knowledge_records;
CREATE TRIGGER yh_cdc_cupping_knowledge_records_trg AFTER INSERT OR UPDATE OR DELETE ON public.cupping_knowledge_records
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('kupa_hacamat:knowledge', 'cupping_knowledge_records');

DROP TRIGGER IF EXISTS yh_cdc_cupping_points_trg ON public.cupping_points;
CREATE TRIGGER yh_cdc_cupping_points_trg AFTER INSERT OR UPDATE OR DELETE ON public.cupping_points
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('kupa_hacamat:points', 'cupping_points');

DROP TRIGGER IF EXISTS yh_cdc_cupping_topics_trg ON public.cupping_topics;
CREATE TRIGGER yh_cdc_cupping_topics_trg AFTER INSERT OR UPDATE OR DELETE ON public.cupping_topics
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('kupa_hacamat:topics', 'cupping_topics');

DROP TRIGGER IF EXISTS yh_cdc_cupping_techniques_trg ON public.cupping_techniques;
CREATE TRIGGER yh_cdc_cupping_techniques_trg AFTER INSERT OR UPDATE OR DELETE ON public.cupping_techniques
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('kupa_hacamat:techniques', 'cupping_techniques');

DROP TRIGGER IF EXISTS yh_cdc_cupping_safety_notes_trg ON public.cupping_safety_notes;
CREATE TRIGGER yh_cdc_cupping_safety_notes_trg AFTER INSERT OR UPDATE OR DELETE ON public.cupping_safety_notes
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('kupa_hacamat:safety-notes', 'cupping_safety_notes');

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'yh_cdc_cupping_%';  -- 5 satır
--   -- Aktivasyon YOK: is_active=true olmadan enqueue no-op → kupa CRUD outbox'a yazmaz.
--   SELECT * FROM public.yh_source_activation WHERE source_key LIKE 'kupa_hacamat:%';         -- 0 satır (default OFF)
-- =============================================================================
