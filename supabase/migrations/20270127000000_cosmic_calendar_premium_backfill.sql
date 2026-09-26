-- ============================================================
-- 20270127000000_cosmic_calendar_premium_backfill.sql
--
-- KOZMİK AJANDA — cosmic_calendar PREMIUM BACKFILL (legacy drift düzeltmesi)
-- Devam: KAJ-P1-04 (cosmic "always-on" kaldırıldı → gerçek kapılı modül).
--
-- NEDEN: cosmic_calendar artık NORMAL kapılı modül. Yeni Premium provisioning payload'ı
-- (PREMIUM_EXPERT_MODULE_KEYS ⊇ cosmic_calendar) her yeni Premium'a cosmic_calendar=true
-- üretir. Ancak bu anahtar eklenmeden ÖNCE Premium olan hesaplarda anahtar EKSİK kalmış
-- olabilir (legacy drift) → gate açıldığında bu hesaplar Kozmik Ajanda erişimini kaybeder.
-- Bu migration yalnız o drift'i kapatır (mevcut Premium erişimini KORUR).
--
-- HEDEF (dar): YALNIZ existing active + approved + Premium UZMAN hesapları.
--   - admin: DOKUNULMAZ (role='expert' filtresi; admin zaten tüm modüllere erişir)
--   - pending/rejected/inactive: DOKUNULMAZ (active IS TRUE + approved zorunlu)
--   - Premium olmayan uzman: DOKUNULMAZ (premium zorunlu)
-- DAVRANIŞ:
--   - mevcut module_permissions JSON'u KORUNUR; SADECE cosmic_calendar = true eklenir/güncellenir
--     (jsonb_set ... create_missing=true → diğer anahtarlara dokunmaz)
--   - IDEMPOTENT: anahtarı OLAN satırlar WHERE ile hariç → yeniden çalıştırma 0 satır
--
-- YALNIZ LEGACY DRIFT (anahtar EKSİK): koşul, cosmic_calendar anahtarı JSON'da HİÇ YOKKEN
--   hedefler. Explicit `{"cosmic_calendar": false}` (gelecekte bilinçli KAPATMA olabilir) ve
--   `true` DEĞİŞMEZ. Bu yüzden `IS DISTINCT FROM 'true'` (false'u da ezerdi) yerine JSONB
--   key-existence kullanılır: NOT (coalesce(module_permissions,'{}') ? 'cosmic_calendar').
--   NULL module_permissions → anahtar yok kabul (coalesce '{}').
--
-- ERİŞİM KONTRATIYLA HİZALI: hasExpertMembershipAccess = active===true &&
--   normalize(approval_status)==='approved' && packageType==='premium'. package precedence
--   (package_type → plan) parseMembershipFromRow ile aynıdır.
--
-- READ-ONLY PREVIEW (APPLY ÖNCESİ ÇALIŞTIR — kaç satır etkilenecek):
--   SELECT count(*) AS etkilenecek FROM public.users
--   WHERE lower(btrim(coalesce(role,''))) = 'expert'
--     AND active IS TRUE
--     AND lower(btrim(coalesce(approval_status,''))) = 'approved'
--     AND lower(btrim(coalesce(nullif(btrim(package_type),''), plan, ''))) = 'premium'
--     AND NOT (coalesce(module_permissions, '{}'::jsonb) ? 'cosmic_calendar');
--   -- Bu worktree'de canlı prod READ-ONLY sayım: 1 (5 zaten true, 0 explicit false, 1 anahtar EKSİK).
--
-- APPLY NOTU: owner onayı + PROD YEDEK olmadan uygulanmaz. Bu tur APPLY EDİLMEZ.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_target  integer;
  v_updated integer;
BEGIN
  -- Önce hedef sayımı (log; APPLY sırasında görünür).
  SELECT count(*) INTO v_target
  FROM public.users
  WHERE lower(btrim(coalesce(role, ''))) = 'expert'
    AND active IS TRUE
    AND lower(btrim(coalesce(approval_status, ''))) = 'approved'
    AND lower(btrim(coalesce(nullif(btrim(package_type), ''), plan, ''))) = 'premium'
    AND NOT (coalesce(module_permissions, '{}'::jsonb) ? 'cosmic_calendar');
  RAISE NOTICE 'cosmic_calendar backfill — hedef (öncesi) satır sayısı: %', v_target;

  -- Yalnız cosmic_calendar anahtarını true yap; diğer izinler değişmez.
  UPDATE public.users u
  SET module_permissions =
        jsonb_set(coalesce(u.module_permissions, '{}'::jsonb),
                  '{cosmic_calendar}', 'true'::jsonb, true)
  WHERE lower(btrim(coalesce(u.role, ''))) = 'expert'
    AND u.active IS TRUE
    AND lower(btrim(coalesce(u.approval_status, ''))) = 'approved'
    AND lower(btrim(coalesce(nullif(btrim(u.package_type), ''), u.plan, ''))) = 'premium'
    AND NOT (coalesce(u.module_permissions, '{}'::jsonb) ? 'cosmic_calendar');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'cosmic_calendar backfill — güncellenen satır: %', v_updated;
END $$;

COMMIT;
