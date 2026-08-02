-- =============================================================================
-- 20260919000000_p3_module_permissions_backfill.sql
--
-- FAZ 1 / P3 (Commit 2) — PREMIUM MODÜL İZİNLERİNİ BACKFILL
--
-- AMAÇ: Runtime "Premium = tüm modüller" BYPASS'ı kaldırılmadan ÖNCE, mevcut Premium
--   uzmanların şu an eriştikleri modül setini (PREMIUM_EXPERT_MODULE_KEYS) kalıcı
--   module_permissions'a yazmak. Böylece server-side modül gate devreye girince
--   Premium uzmanlar mevcut erişimlerini KAYBETMEZ; erişim artık kişiye özel ve
--   server-side (lib/auth/moduleAccess) zorlanır.
--
-- GÜVENLİ / GERİYE UYUMLU:
--   - Yalnız `||` (merge) ile EKLEME yapılır; mevcut true değerler korunur, hiçbir
--     modül KAPATILMAZ. Yalnız role='expert' ve paketi premium olan satırlar.
--   - RLS/grant değişmez; başka kolona dokunulmaz. IDEMPOTENT (tekrar no-op).
--
-- ⚠️ ZORUNLU DEPLOY SIRASI: önce BU migration apply, SONRA kod deploy (Premium bypass'ı
--   kaldıran runtime). Ters sırada Premium uzmanlar geçici olarak modül kaybeder.
--   Otomatik apply DEĞİL; Dashboard SQL Editor ile ayrı onayla.
-- =============================================================================

BEGIN;

UPDATE public.users
   SET module_permissions = COALESCE(module_permissions, '{}'::jsonb) || '{
        "clients": true,
        "appointments": true,
        "numerology": true,
        "stones": true,
        "stok": true,
        "sifa_rehberi": true,
        "reflexology": true,
        "energy_body": true,
        "aromatherapy": true,
        "personal_archive": true,
        "video_ceviri": true,
        "belge_ceviri": true,
        "ders_notu": true,
        "digital_content": true,
        "cosmic_calendar": true,
        "danisan_yonetimi": true,
        "ajanda": true,
        "numeroloji": true,
        "dogaltas": true,
        "refleksoloji": true,
        "biyoenerji": true,
        "aromaterapi": true,
        "kisisel_arsiv": true,
        "stock": true,
        "healing": true
      }'::jsonb
 WHERE role = 'expert'
   AND lower(btrim(coalesce(package_type, plan, ''))) = 'premium';

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası): premium uzmanlarda module_permissions.stones = true.
--   SELECT count(*) FROM public.users
--    WHERE role='expert' AND lower(btrim(coalesce(package_type,plan,'')))='premium'
--      AND (module_permissions->>'stones') IS DISTINCT FROM 'true';   -- 0 olmalı
-- ROLLBACK: veri kaybı riski nedeniyle otomatik geri alma YOK; manuel değerlendirilir.
--   (human_design bilinçli olarak dahil EDİLMEDİ — "yakında", premium dahil kapalı.)
-- =============================================================================
