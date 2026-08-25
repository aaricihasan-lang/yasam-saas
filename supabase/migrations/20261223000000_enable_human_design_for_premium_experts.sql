-- =============================================================================
-- 20261223000000_enable_human_design_for_premium_experts.sql
--
-- HUMAN DESIGN MEMBER OPEN — MEVCUT PREMIUM UZMANLARA human_design İZNİ (BACKFILL)
--
-- AMAÇ: Human Design artık "yakında" değildir; normal module_permissions modülü oldu
--   (PREMIUM_EXPERT_MODULE_KEYS + buildPremiumModulePermissionsPayload dahil). Bu
--   migration, KOD DEPLOY EDİLDİKTEN SONRA (server hard-deny kalktıktan sonra) mevcut
--   Premium uzmanların module_permissions'ına human_design=true ekler → mevcut Premium'lar
--   Human Design'a erişebilir. Yeni Premium geçişleri zaten merkezi payload'dan
--   human_design=true alır (20260919 P3 backfill ile AYNI hedef; o migration'da
--   human_design bilinçli olarak hariç bırakılmıştı — bu, onun tamamlayıcısıdır).
--
-- GÜVENLİ / GERİYE UYUMLU / IDEMPOTENT:
--   * Yalnız `||` (merge) ile human_design=true EKLENİR; mevcut hiçbir izin DEĞİŞMEZ,
--     hiçbir modül KAPATILMAZ.
--   * NULL module_permissions güvenli ele alınır: COALESCE(..., '{}'::jsonb).
--   * Yalnız role='expert' ve paketi gerçekten 'premium' olan satırlar.
--   * Zaten true olan satırlara DOKUNMAZ (IS DISTINCT FROM 'true') → ikinci çalıştırma no-op.
--   * active / approval_status / membership / Yaşam Hafızası flags / başka permission
--     key DEĞİŞMEZ. RLS / policy / grant / schema DEĞİŞMEZ (yalnız veri).
--
-- BAGLAYICI DEPLOY SIRASI: önce KOD production'a (server hard-deny kaldırılmış), SONRA
--   bu migration/backfill. Ters sırada anlamsız yarım state oluşur (server hâlâ deny).
--   Otomatik apply DEĞİL; Dashboard SQL Editor ile ayrı, kontrollü onayla uygulanır.
--
-- PRE-STATE (production read-only preflight): non-admin premium expert = 6,
--   human_design=true = 0, human_design!=true = 6.
-- =============================================================================

BEGIN;

UPDATE public.users
   SET module_permissions =
         COALESCE(module_permissions, '{}'::jsonb) || '{"human_design": true}'::jsonb
 WHERE role = 'expert'
   AND lower(btrim(coalesce(package_type, plan, ''))) = 'premium'
   AND COALESCE(module_permissions ->> 'human_design', 'false') IS DISTINCT FROM 'true';

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası; beklenen 0):
--   SELECT count(*) FROM public.users
--    WHERE role='expert' AND lower(btrim(coalesce(package_type,plan,'')))='premium'
--      AND (module_permissions->>'human_design') IS DISTINCT FROM 'true';   -- 0 olmalı
-- ROLLBACK: veri migration'ı; otomatik geri alma YOK (manuel değerlendirilir). Yalnız
--   human_design anahtarı eklenir; diğer izinler etkilenmez.
-- =============================================================================
