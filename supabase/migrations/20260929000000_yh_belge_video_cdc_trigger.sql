-- =============================================================================
-- 20260929000000_yh_belge_video_cdc_trigger.sql
--
-- YAŞAM HAFIZASI™ — BF-11E: BELGE/VİDEO (yh_document_passages) CDC TRIGGER FOUNDATION
--
-- AMAÇ: belge_video:passages kaynağı için AKTİVASYON-KAPILI CDC enqueue trigger'ını
--   public.yh_document_passages tablosuna bağlar. Generic public.yh_cdc_enqueue() (BF-11E
--   foundation, migration 20260927000000) kullanılır; ikinci CDC mimarisi ÜRETİLMEZ.
--
-- UYUMLULUK (exact doğrulandı): yh_document_passages id uuid PK + tenant_id uuid NOT NULL
--   taşır → generic yh_cdc_enqueue (NEW.id / NEW.tenant_id, OLD.id / OLD.tenant_id) UYUMLU;
--   outbox tenant_id NOT NULL sözleşmesi karşılanır. Passage ↔ parent (yh_document_sources)
--   composite FK (tenant_id, document_id) tenant sahipliğini DB düzeyinde garanti eder.
--
-- MERGE-SAFE / APPLY-SAFE (KİLİTLİ):
--   TRIGGER ATTACHED ≠ SOURCE ACTIVATED.
--   Trigger aktivasyon-kapılıdır: public.yh_source_activation'da belge_video:passages için
--   is_active=true YOKSA (apply-safe default) yh_cdc_enqueue SESSİZ NO-OP döner (kaynak CRUD
--   ENGELLENMEZ; outbox olayı ÜRETİLMEZ). Bu migration:
--     - activation row SEED ETMEZ            - is_active=true YAPMAZ
--     - backfill_allowed=true YAPMAZ          - historical SELECT / source-scan YAPMAZ
--     - source data DML YAPMAZ                - index DML YAPMAZ
--     - reconcile BAŞLATMAZ                   - test row OLUŞTURMAZ
--   Uygulandığında (source activation false/absent) gelecekteki passage mutation'ları da
--   olay üretmez; yalnız is_active=true flip'i (ayrı production kapısı) sonrası FUTURE-ONLY
--   event akışı başlar.
--
-- FUTURE-ONLY: mevcut historical passage satırları OTOMATİK SCAN EDİLMEZ (trigger yalnız
--   yeni INSERT/UPDATE/DELETE eventlerinde çalışır). Backfill ayrı production risk kapısıdır.
--
-- UYGULAMA: Supabase Dashboard SQL Editor. AYRI ONAY. Production apply bu paketin DIŞINDA.
-- IDEMPOTENT: DROP TRIGGER IF EXISTS + CREATE TRIGGER (tekrar no-op).
-- =============================================================================

BEGIN;

-- Önkoşul savunması (fail-closed): generic CDC fonksiyonu + hedef tablo mevcut olmalı.
DO $bv$
BEGIN
  IF to_regprocedure('public.yh_cdc_enqueue()') IS NULL THEN
    RAISE EXCEPTION 'BF-11E BLOCKER: public.yh_cdc_enqueue() yok — önce BF-11E activation control foundation (20260927000000) uygulanmali';
  END IF;
  IF to_regclass('public.yh_document_passages') IS NULL THEN
    RAISE EXCEPTION 'BF-11E BLOCKER: public.yh_document_passages yok — önce BF-14 deferred sources foundation (20260925000000) uygulanmali';
  END IF;
END
$bv$;

-- Aktivasyon-kapılı CDC trigger: YALNIZ yh_document_passages (belge_video:passages).
-- is_active=false/absent iken sessiz no-op (yh_cdc_enqueue aktivasyon kapısı).
DROP TRIGGER IF EXISTS yh_cdc_yh_document_passages_trg ON public.yh_document_passages;
CREATE TRIGGER yh_cdc_yh_document_passages_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.yh_document_passages
  FOR EACH ROW
  EXECUTE FUNCTION public.yh_cdc_enqueue('belge_video:passages', 'yh_document_passages');

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   -- 1) Trigger yalnız yh_document_passages'ta + generic fonksiyona bağlı:
--   SELECT tgname FROM pg_trigger
--     WHERE tgrelid = 'public.yh_document_passages'::regclass AND NOT tgisinternal; -- yh_cdc_yh_document_passages_trg
--   SELECT p.proname FROM pg_trigger t JOIN pg_proc p ON t.tgfoid = p.oid
--     WHERE t.tgname = 'yh_cdc_yh_document_passages_trg';                           -- yh_cdc_enqueue
--   -- 2) Aktivasyon OFF (bu migration seed etmez):
--   SELECT count(*) FROM public.yh_source_activation
--     WHERE source_key = 'belge_video:passages' AND is_active;                      -- 0
--   -- 3) Bu migration source/index/activation DML'i yapmaz; historical scan yapmaz.
--   -- 4) TRIGGER ATTACHED ≠ SOURCE ACTIVATED: is_active=true olmadan olay üretilmez.
--
-- AKTİVASYON (bu migration'da DEĞİL; AYRI ONAY + preflight PASS + kod enabled:true sonrası):
--   -- SELECT public.yh_source_activation_set('belge_video:passages', true, false,
--   --                                        'FUTURE_ONLY_READY','professional','controlled activation');
--   -- ROLLBACK / KILL-SWITCH (index KORUNUR):
--   -- SELECT public.yh_source_deactivate('belge_video:passages');
--   -- DROP TRIGGER IF EXISTS yh_cdc_yh_document_passages_trg ON public.yh_document_passages;
-- =============================================================================
