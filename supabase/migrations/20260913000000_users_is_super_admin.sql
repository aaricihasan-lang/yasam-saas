-- =============================================================================
-- 20260913000000_users_is_super_admin.sql
--
-- FAZ 1 / P1 — KALICI ANA-YÖNETİCİ (super admin) İŞARETİ  (FAIL-CLOSED)
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
-- FAIL-CLOSED SÖZLEŞMESİ (bu düzeltmenin özü):
--   - Normalize e-posta eşleşmesi TAM 1 (ve role='admin') DEĞİLSE → RAISE EXCEPTION,
--     transaction ROLLBACK olur. Böylece "0 super admin ile sessiz COMMIT" imkânsızdır.
--   - UPDATE sonrası final super-admin sayısı TAM 1 DEĞİLSE → RAISE EXCEPTION.
--     (Önceden yanlış is_super_admin=true satır varsa sessizce düzeltilmez; migration
--      DURUR. Doğru hesap işaretlenir ama başka true satır kalırsa fail eder.)
--   - En fazla 1 true için partial unique index yapısal koruma sağlar.
--
-- GÜVENLİ / GERİYE UYUMLU:
--   - ADD COLUMN IF NOT EXISTS + NOT NULL DEFAULT false → mevcut 5 satır false olur.
--   - RLS/grant değişmez (users tablosu zaten kilitli; yalnız kolon eklenir).
--   - users INSERT/DELETE yok; password/session/module alanlarına dokunulmaz.
--   - IDEMPOTENT: tekrar çalıştırılırsa eşleşme yine 1, UPDATE no-op, final 1 → geçer.
--
-- ⚠️ Bu commit canlıya otomatik uygulama DEĞİLDİR; uygulama ayrı onayla yapılır.
-- =============================================================================

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- Fail-closed backfill: eşleşme tam 1 ve final tam 1 değilse migration DURUR.
DO $$
DECLARE
  match_count integer;
  super_count integer;
BEGIN
  -- 1) Ana yönetici satırı (normalize e-posta + role=admin) TAM 1 olmalı.
  SELECT count(*) INTO match_count
    FROM public.users
   WHERE lower(btrim(email)) = 'admin@yasamsistemi.com'
     AND role = 'admin';

  IF match_count <> 1 THEN
    RAISE EXCEPTION
      'Ana yönetici (admin@yasamsistemi.com, role=admin) eşleşmesi tam 1 değil (bulunan: %). Migration iptal edildi.',
      match_count;
  END IF;

  -- 2) Yalnız o satırı işaretle.
  UPDATE public.users
     SET is_super_admin = true
   WHERE lower(btrim(email)) = 'admin@yasamsistemi.com'
     AND role = 'admin';

  -- 3) Final: sistemde TAM 1 super admin olmalı (yanlış mevcut true satır varsa fail).
  SELECT count(*) INTO super_count
    FROM public.users
   WHERE is_super_admin = true;

  IF super_count <> 1 THEN
    RAISE EXCEPTION
      'Final super-admin sayısı tam 1 değil (bulunan: %). Beklenmeyen is_super_admin=true satırı olabilir. Migration iptal edildi.',
      super_count;
  END IF;
END $$;

-- Sistemde EN FAZLA 1 super admin olabilir (partial unique index — yapısal koruma).
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
