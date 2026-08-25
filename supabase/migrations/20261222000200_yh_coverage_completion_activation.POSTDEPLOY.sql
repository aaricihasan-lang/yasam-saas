-- =============================================================================
-- 20261222000200_yh_coverage_completion_activation.POSTDEPLOY.sql
--
-- ⚠️⚠️  POST-DEPLOY / MANUAL APPROVAL REQUIRED — BU TUR PRODUCTION'A UYGULANMAZ  ⚠️⚠️
--
-- YAŞAM HAFIZASI™ — PROFESSIONAL COVERAGE COMPLETION: 6 YENİ KAYNAK AKTİVASYONU.
--
-- Bu dosya, Coverage Completion kaynaklarını (Kupa & Hacamat 5 + Biyoenerji V4 chakra-blocks 1)
-- production'da AKTİVE eden AYRI kapıdır. AKTİVASYON = ÜÇLÜ KAPI:
--   (1) KOD: registry enabled:true + activationMatrix (bu PR ile deploy) —  ✅ bu PR
--   (2) TRIGGER: CDC trigger'lar kurulu (20261222000000 + 20261222000100) —  ✅ predeploy migration
--   (3) DB: yh_source_activation.is_active=true (BU DOSYA)                 —  ⛔ AYRI ONAY (bu tur YOK)
--
-- SIRALAMA (zorunlu): önce KOD deploy (Vercel) → sonra (1)/(2) predeploy migration apply →
--   EN SON bu POSTDEPLOY activation (ayrı onay + preflight). Aksi sıra kör aktivasyon riski taşır.
--
-- BACKFILL YASAK: p_backfill_allowed=false. Historical blind backfill YOK — yalnız aktivasyon
--   SONRASI yeni INSERT→upsert / UPDATE→refresh / DELETE→deindex future-event indexlenir.
--   Mevcut kupa/chakra kayıtları OTOMATİK GÖRÜNMEZ (bilinçli ürün politikası). Aktivasyondan önce
--   enqueue edilmiş olay (is_active=false iken no-op) index üretmez → event-time boundary güvenli.
--
-- KILL-SWITCH (rollback): SELECT public.yh_source_deactivate('<source_key>');  → yeni olay işlenmez;
--   mevcut index satırları KORUNUR (explicit cleanup ayrı karar).
--
-- UYGULAMA: Supabase Dashboard SQL Editor, YALNIZ ayrı yazılı onay + preflight PASS sonrası.
-- IDEMPOTENT: yh_source_activation_set UPSERT (tekrar çalıştırma güvenli).
-- =============================================================================

BEGIN;

-- ─── FAIL-CLOSED PRECONDITIONS: CDC trigger'lar + RPC kurulu olmalı ───────────
DO $pre$
BEGIN
  IF to_regprocedure('public.yh_source_activation_set(text,boolean,boolean,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Activation BLOCKER: yh_source_activation_set RPC yok — önce 20260927000000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'yh_cdc_cupping_knowledge_records_trg' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Activation BLOCKER: Kupa CDC trigger yok — önce 20261222000000 uygulanmali';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'yh_cdc_bioenergy_chakra_blocks_trg' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Activation BLOCKER: chakra-blocks CDC trigger yok — önce 20261222000100 uygulanmali';
  END IF;
END
$pre$;

-- ─── AKTİVASYON (FUTURE_ONLY_READY, professional, backfill=false) ─────────────
SELECT public.yh_source_activation_set('kupa_hacamat:knowledge',    true, false, 'FUTURE_ONLY_READY', 'professional', 'coverage-completion');
SELECT public.yh_source_activation_set('kupa_hacamat:points',       true, false, 'FUTURE_ONLY_READY', 'professional', 'coverage-completion');
SELECT public.yh_source_activation_set('kupa_hacamat:topics',       true, false, 'FUTURE_ONLY_READY', 'professional', 'coverage-completion');
SELECT public.yh_source_activation_set('kupa_hacamat:techniques',   true, false, 'FUTURE_ONLY_READY', 'professional', 'coverage-completion');
SELECT public.yh_source_activation_set('kupa_hacamat:safety-notes', true, false, 'FUTURE_ONLY_READY', 'professional', 'coverage-completion');
SELECT public.yh_source_activation_set('biyoenerji:chakra-blocks',  true, false, 'FUTURE_ONLY_READY', 'professional', 'coverage-completion');

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   SELECT source_key, is_active, backfill_allowed, activation_class, scope
--     FROM public.yh_source_activation
--     WHERE source_key IN ('kupa_hacamat:knowledge','kupa_hacamat:points','kupa_hacamat:topics',
--       'kupa_hacamat:techniques','kupa_hacamat:safety-notes','biyoenerji:chakra-blocks')
--     ORDER BY source_key;   -- 6 satır: is_active=t, backfill_allowed=f, FUTURE_ONLY_READY, professional
-- =============================================================================
