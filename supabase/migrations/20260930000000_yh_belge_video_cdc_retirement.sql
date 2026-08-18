-- =============================================================================
-- 20260930000000_yh_belge_video_cdc_retirement.sql
--
-- YAŞAM HAFIZASI™ — BF-11E: BELGE/VİDEO SOURCE RETIREMENT (COMPENSATING MIGRATION)
--
-- ÜRÜN KARARI: Dijital İçerik Merkezi'nin belge/video/ders-notu işleme alanı TRANSIENT
--   PROCESSING / EXPORT WORKSPACE'tir; Yaşam Hafızası SOURCE DEĞİLDİR. belge_video:passages
--   source registry/activation/matrix'ten çıkarılmıştır (kod tarafı). Bu telafi migration'ı,
--   20260929000000'de eklenen aktivasyon-kapılı CDC trigger'ını KALDIRIR; böylece migration
--   zinciri gelecekte topluca uygulansa bile nihai desired-state:
--
--     Belge/Video Yaşam Hafızası CDC trigger = 0
--
--   olur. (20260929 trigger'ı zaten aktivasyon-kapılıydı → activation row olmadan olay üretmezdi;
--   bu migration onu bütünüyle kaldırarak yanlış re-aktivasyon yüzeyini de sıfırlar.)
--
-- KAPSAM (yalnız trigger kaldırma; additive/telafi):
--   1. DROP TRIGGER IF EXISTS yh_cdc_yh_document_passages_trg ON public.yh_document_passages
--
-- KAPSAM DIŞI (BİLİNÇLİ — sistem-genel ayrı risk kapısı):
--   * public.yh_document_sources / public.yh_document_passages DROP TABLE YOK (cleanup-candidate).
--   * public.yh_cdc_enqueue() / yh_source_activation / yh_source_activation_set foundation KORUNUR
--     (genel BF-11E kontrol düzlemi; diğer kaynaklar kullanır).
--   * 20260929000000 migration history REWRITE EDİLMEZ (git/migration geçmişi korunur).
--
-- KESİN GARANTİ (fail-closed retirement):
--   - activation row SEED ETMEZ            - is_active=true YAPMAZ
--   - backfill_allowed=true YAPMAZ          - historical SELECT / source-scan YAPMAZ
--   - source data DML YAPMAZ                - index DML YAPMAZ
--   - reconcile BAŞLATMAZ                   - test row OLUŞTURMAZ
--   - DROP TABLE / TRUNCATE YOK             - production activation row cleanup YOK
--
-- UYGULAMA: Supabase Dashboard SQL Editor. AYRI ONAY. Production apply bu paketin DIŞINDA.
--   NOT: 20260929000000 production'a HİÇ UYGULANMADI → bu retirement de production'da beklemede;
--   DROP TRIGGER IF EXISTS trigger yoksa güvenli no-op'tur.
-- IDEMPOTENT: DROP TRIGGER IF EXISTS (tekrar no-op).
-- =============================================================================

BEGIN;

-- Belge/Video CDC trigger'ını kaldır (yoksa güvenli no-op). Fonksiyon (yh_cdc_enqueue) KORUNUR.
DROP TRIGGER IF EXISTS yh_cdc_yh_document_passages_trg ON public.yh_document_passages;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   -- 1) Belge/Video CDC trigger'ı YOK (nihai desired-state = 0):
--   SELECT count(*) FROM pg_trigger
--     WHERE tgrelid = to_regclass('public.yh_document_passages')
--       AND tgname = 'yh_cdc_yh_document_passages_trg' AND NOT tgisinternal;         -- 0
--   -- 2) Genel foundation korunur (yh_cdc_enqueue / yh_source_activation dokunulmadı):
--   SELECT to_regprocedure('public.yh_cdc_enqueue()') IS NOT NULL;                    -- true
--   -- 3) Bu migration activation row / is_active / backfill / source-index DML YAPMAZ.
--   -- 4) yh_document_sources / yh_document_passages tabloları KORUNUR (DROP yok).
-- =============================================================================
