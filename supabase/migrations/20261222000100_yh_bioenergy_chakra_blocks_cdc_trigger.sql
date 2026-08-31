-- =============================================================================
-- 20261222000100_yh_bioenergy_chakra_blocks_cdc_trigger.sql
--
-- YAŞAM HAFIZASI™ — PROFESSIONAL COVERAGE COMPLETION: BİYOENERJİ V4 ÇAKRA BLOKLARI CDC (PREDEPLOY).
--
-- KAPSAM (yalnız trigger; yeni fonksiyon YOK):
--   public.bioenergy_chakra_blocks → biyoenerji:chakra-blocks. Tablo DOĞRUDAN tenant_id (NOT NULL)
--   taşır → column-tenant + record → mevcut generic AKTİVASYON-KAPILI public.yh_cdc_enqueue kullanılır.
--
-- GÖRÜNÜRLÜK (kod-tarafı, UI ile birebir): source config `ineligibleStatusColumn=block_type` +
--   `ineligibleStatuses=['source-evidence']` → gizli kaynak-kanıtı blokları (yalnız bibliyografyayı
--   besler; UI'da içerik olarak render EDİLMEZ) index'e alınmaz; içeriksiz blok evidence-gate ile düşer.
--   Trigger her satır için event üretir; eligibility/evidence kararı WORKER'da (rowEligibility +
--   buildCandidate). block_type değişimi (görünür↔source-evidence) UPDATE event'i → worker re-değerlendirir
--   (görünür→source-evidence → deindex; source-evidence→görünür → index). DELETE / parent CASCADE → deindex.
--
-- PARENT CASCADE (ghost-free): bioenergy_chakras DELETE → FK ON DELETE CASCADE child satırları siler →
--   child AFTER DELETE trigger (bu migration) her silinen blok için delete event üretir → deindex.
--   Row-level trigger CASCADE silmelerinde de ateşlenir → parent silme sonrası ghost KALMAZ.
--
-- BU MIGRATION: kaynak tabloyu ALTER ETMEZ; index'e YAZMAZ; DML/backfill YOK; AKTİVASYON YAPMAZ
--   (is_active=true olmadan enqueue SESSİZ NO-OP; kaynak default OFF; çift kapı: kod enabled + DB flip).
--
-- UYGULAMA: Supabase Dashboard SQL Editor. AYRI ONAY. Production apply bu paketin DIŞINDA.
-- IDEMPOTENT: DROP TRIGGER IF EXISTS / CREATE TRIGGER. ROLLBACK: DROP TRIGGER; index ETKİLENMEZ.
-- =============================================================================

BEGIN;

-- ─── 0) FAIL-CLOSED PRECONDITIONS ────────────────────────────────────────────
DO $pre$
BEGIN
  IF to_regprocedure('public.yh_cdc_enqueue()') IS NULL THEN
    RAISE EXCEPTION 'Coverage Completion BLOCKER: public.yh_cdc_enqueue() yok — önce 20260927000000 uygulanmali';
  END IF;
  IF to_regclass('public.yh_source_activation') IS NULL THEN
    RAISE EXCEPTION 'Coverage Completion BLOCKER: public.yh_source_activation yok';
  END IF;
  IF to_regclass('public.yasam_hafizasi_outbox') IS NULL THEN
    RAISE EXCEPTION 'Coverage Completion BLOCKER: public.yasam_hafizasi_outbox yok';
  END IF;
  IF to_regclass('public.bioenergy_chakra_blocks') IS NULL THEN
    RAISE EXCEPTION 'Coverage Completion BLOCKER: public.bioenergy_chakra_blocks yok — önce 20261203000000 uygulanmali';
  END IF;
END
$pre$;

-- ─── 1) GENERIC column-tenant trigger (record; worker-v1 kapsamı) ─────────────
DROP TRIGGER IF EXISTS yh_cdc_bioenergy_chakra_blocks_trg ON public.bioenergy_chakra_blocks;
CREATE TRIGGER yh_cdc_bioenergy_chakra_blocks_trg AFTER INSERT OR UPDATE OR DELETE ON public.bioenergy_chakra_blocks
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('biyoenerji:chakra-blocks', 'bioenergy_chakra_blocks');

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   SELECT tgname FROM pg_trigger WHERE tgrelid='public.bioenergy_chakra_blocks'::regclass
--     AND NOT tgisinternal;                                     -- yh_cdc_bioenergy_chakra_blocks_trg
--   SELECT * FROM public.yh_source_activation WHERE source_key='biyoenerji:chakra-blocks'; -- 0 satır (OFF)
-- =============================================================================
