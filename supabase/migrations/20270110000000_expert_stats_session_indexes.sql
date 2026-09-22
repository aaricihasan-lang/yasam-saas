-- =============================================================================
-- 20270110000000_expert_stats_session_indexes.sql   [ADDITIVE — INDEX ONLY]
--
-- UZMAN BAZLI KULLANIM İSTATİSTİKLERİ — FAZ 1 / İP-1 (giriş & etkinlik).
--
-- AMAÇ: Kullanıcı-hesabı bazlı salt-okunur metriklerin (ilk/son giriş, dönem giriş
--   sayısı, son görülme, aktif-gün) veritabanında TOPLULAŞTIRILARAK verimli
--   sorgulanabilmesi için user_sessions üzerinde iki additive kompozit index.
--
-- İSTATİSTİK SEMANTİĞİ (kod sözleşmesiyle uyumlu):
--   * created_at  = başarılı giriş anı (create_session_within_limits her başarılı
--     login'de TEK satır insert eder → COUNT(created_at ∈ aralık) = giriş sayısı).
--   * last_seen_at = son görülme (heartbeat; 90 sn throttle) → "son görülme" sinyali;
--     "son anlamlı işlem" DEĞİLDİR (o expert_usage_events'ten türetilir).
--
-- KAPSAM: yalnız index. Yeni tablo/kolon YOK, veri (DML) YOK, davranış değişmez.
-- IDEMPOTENT: CREATE INDEX IF NOT EXISTS.
-- ⚠️ Bu migration bu turda HİÇBİR veritabanına UYGULANMAZ (ayrı onay).
-- =============================================================================

BEGIN;

-- Giriş sayımı / ilk-son giriş: (user_id, created_at DESC).
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_created
  ON public.user_sessions (user_id, created_at DESC);

-- Son görülme / aktif-gün: (user_id, last_seen_at DESC).
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_last_seen
  ON public.user_sessions (user_id, last_seen_at DESC);

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma):
--   SELECT indexname FROM pg_indexes
--     WHERE schemaname='public' AND tablename='user_sessions'
--       AND indexname IN ('idx_user_sessions_user_created','idx_user_sessions_user_last_seen');
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.idx_user_sessions_user_created;
--   DROP INDEX IF EXISTS public.idx_user_sessions_user_last_seen;
-- =============================================================================
