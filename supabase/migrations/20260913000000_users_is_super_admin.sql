-- =============================================================================
-- 20260913000000_users_is_super_admin.sql
--
-- FAZ 1 / P1 — KALICI ANA-YÖNETİCİ (super admin) İŞARETİ
--
-- AMAÇ:
--   Ana yönetici kimliği artık kırılgan e-postaya/`admin_level`'a değil, kalıcı
--   bir DB işaretine dayanır: public.users.is_super_admin.
--   Runtime yetkilendirmesi (requireMainAdmin) bu kolon üzerinden yapılır.
--   E-posta YALNIZ bu migration'da doğru satırı bulmak için kullanılır.
--
-- BAĞLAYICI KARAR:
--   Ana yönetici = admin@yasamsistemi.com. İleride oluşturulacak adminler
--   NORMAL admin olur (is_super_admin=false). Sistemde EN FAZLA 1 super admin.
--
-- GÜVENLİ / GERİYE UYUMLU:
--   - ADD COLUMN IF NOT EXISTS + NOT NULL DEFAULT false → mevcut 5 satır false olur.
--   - Uygulama kodu, kolon henüz yokken (deploy sırası) e-posta fallback'ine düşer;
--     kolon geldikten sonra is_super_admin esastır.
--   - RLS/grant değişmez (users tablosu zaten kilitli; yalnız kolon eklenir).
--
-- ⚠️ Bu commit canlıya otomatik uygulama DEĞİLDİR; uygulama ayrı onayla yapılır.
-- =============================================================================

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- Ana yönetici satırını işaretle (e-posta YALNIZ doğru satırı bulmak için).
UPDATE public.users
   SET is_super_admin = true
 WHERE lower(btrim(email)) = 'admin@yasamsistemi.com'
   AND role = 'admin';

-- Sistemde EN FAZLA 1 super admin olabilir (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_single_super_admin
  ON public.users (is_super_admin)
  WHERE is_super_admin = true;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma — beklenen):
--   SELECT count(*) FROM public.users WHERE is_super_admin = true;               -- 1
--   SELECT is_super_admin FROM public.users
--     WHERE lower(btrim(email)) = 'admin@yasamsistemi.com';                      -- true
--   SELECT count(*) FROM public.users;                                          -- 5 (değişmedi)
--   -- ikinci super admin denemesi (test ETME) unique index ile reddedilir.
-- =============================================================================

-- =============================================================================
-- ROLLBACK:
--   DROP INDEX IF EXISTS uq_users_single_super_admin;
--   ALTER TABLE public.users DROP COLUMN IF EXISTS is_super_admin;
-- =============================================================================
