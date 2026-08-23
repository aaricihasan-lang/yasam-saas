-- =============================================================================
-- 20261221000100_yh_expert_rollout_activation.sql   [ACTIVATION DATA — AFTER CODE DEPLOY]
--
-- YAŞAM HAFIZASI™ — TÜM UZMANLARA AÇILIM · ROLLOUT ACTIVATION (kullanıcı açılımı).
--
-- ⛔ RELEASE GATE: Bu migration YALNIZCA production CODE DEPLOY (yeni iki-alan Mesleki/Danışan
--   Hafızası UI + güvenlik fix'leri + shared runtime hard-off + provisioning kodu) BAŞARIYLA
--   tamamlandıktan SONRA (GATE 4) uygulanır. EXPAND (20261221000000, RPC) GATE 1'de zaten
--   uygulanmış olmalıdır. Aksi halde uzman eski/yarım ürünle açılır → İSTENMEZ.
--
-- KAPSAM (yalnız idempotent data açılımı; DB contract/function KURMAZ):
--   1) EXISTING ELIGIBLE EXPERTS: module_permissions.yasam_hafizasi=true + yh_enabled/yh_hizli=true.
--   2) ADMIN FLAG PARITY: ADMIN_LIBRARY_TENANT flags (yh_enabled/yh_hizli=true, yh_shared=false).
--
-- BAĞLAYICI:
--   * DEFAULT_MODULE_PERMISSIONS DEĞİŞMEZ. Admin module_permissions DEĞİŞMEZ (role=admin bypass).
--   * yh_shared HİÇBİR tenant'ta true ÜRETİLMEZ; admin'de EXPLICIT false (INSERT + ON CONFLICT).
--   * module_permissions MERGE (`||`) → diğer izinler korunur. Expert flags upsert yalnız
--     yh_enabled+yh_hizli set eder → yh_shared/diğer dormant flag'ler DEĞİŞMEZ (asla true olmaz).
--   * İÇERİK/INDEX BACKFILL YOK · historical enqueue YOK · reconcile YOK · yh_source_activation /
--     backfill_allowed DOKUNULMAZ.
--   * HARİÇ: ADMIN_LIBRARY (aa8b960b, synthetic) + DEMO (40f842a0) + is_demo_account + tenant'ta
--     demo user olan tenant + inactive/pending/rejected/premium-olmayan. (Admin flags AYRI, bilinçli
--     tek istisna; expert grant'tan HARİÇ tutulur.)
--
-- IDEMPOTENT / non-destructive / tekrar çalıştırılabilir.
-- UYGULAMA: Supabase Dashboard SQL Editor (GATE 4; AYRI ONAY). Bu turda UYGULANMAZ.
-- =============================================================================

BEGIN;

-- ─── 1) EXISTING ELIGIBLE EXPERTS ───────────────────────────────────────────
CREATE TEMP TABLE _yh_rollout_users ON COMMIT DROP AS
SELECT u.id, u.tenant_id
FROM public.users u
WHERE u.role = 'expert'
  AND u.active = true
  AND lower(coalesce(u.approval_status, '')) NOT IN ('pending', 'rejected')
  AND lower(coalesce(u.package_type, u.plan, '')) = 'premium'
  AND coalesce(u.is_demo_account, false) = false
  AND u.tenant_id IS NOT NULL
  AND u.tenant_id NOT IN (
    'aa8b960b-f4f1-4e5b-89f5-109bc030c147'::uuid,  -- ADMIN_LIBRARY_TENANT (synthetic)
    '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid   -- DEMO_TENANT
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.users d
    WHERE d.tenant_id = u.tenant_id AND coalesce(d.is_demo_account, false) = true
  );

-- A) module_permissions.yasam_hafizasi = true (MERGE; diğer izinler korunur)
UPDATE public.users u
SET module_permissions =
      COALESCE(u.module_permissions, '{}'::jsonb) || jsonb_build_object('yasam_hafizasi', true)
FROM _yh_rollout_users r
WHERE u.id = r.id
  AND (u.module_permissions ->> 'yasam_hafizasi') IS DISTINCT FROM 'true';

-- B) yasam_hafizasi_flags: yh_enabled + yh_hizli = true (yh_shared'e DOKUNMA → asla true olmaz)
INSERT INTO public.yasam_hafizasi_flags (tenant_id, yh_enabled, yh_hizli)
SELECT DISTINCT r.tenant_id, true, true
FROM _yh_rollout_users r
ON CONFLICT (tenant_id) DO UPDATE
  SET yh_enabled = true, yh_hizli = true;

-- ─── 2) ADMIN FLAG PARITY — yalnız ADMIN_LIBRARY_TENANT; yh_shared EXPLICIT false ───
-- Admin YH'ye role=admin merkezî bypass ile erişir (module_permissions DEĞİŞTİRİLMEZ). Flags satırı
-- olmadığından arama "henüz aktif değil" dönüyordu → parity eksikti. yh_enabled+yh_hizli açılır;
-- yh_shared HEM INSERT HEM ON CONFLICT'te EXPLICIT false (ürün kararı: ortak havuz YOK). Yalnız bu
-- TEK tenant; demo/diğer synthetic AÇILMAZ.
INSERT INTO public.yasam_hafizasi_flags (tenant_id, yh_enabled, yh_hizli, yh_shared)
VALUES ('aa8b960b-f4f1-4e5b-89f5-109bc030c147'::uuid, true, true, false)  -- ADMIN_LIBRARY_TENANT
ON CONFLICT (tenant_id) DO UPDATE
  SET yh_enabled = true, yh_hizli = true, yh_shared = false;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   -- 1) Uygun uzmanlarda izin+flags açık; demo/admin-library tenant expert grant ALMADI:
--   --   SELECT count(*) FROM public.users
--   --     WHERE role='expert' AND active=true AND (module_permissions->>'yasam_hafizasi')='true';
--   -- 2) Admin tenant flags: yh_enabled=true, yh_hizli=true, yh_shared=false:
--   --   SELECT yh_enabled, yh_hizli, yh_shared FROM public.yasam_hafizasi_flags
--   --     WHERE tenant_id='aa8b960b-f4f1-4e5b-89f5-109bc030c147';   -- t, t, f
--   -- 3) yh_shared HİÇBİR tenant'ta true değil:
--   --   SELECT count(*) FROM public.yasam_hafizasi_flags WHERE yh_shared = true;  -- 0
--   -- 4) backfill_allowed / yh_source_activation DEĞİŞMEDİ; hiçbir content/index backfill yapılmadı.
--
-- ROLLBACK (SALT-OKUNUR şablon; index/veri SİLMEZ — yalnız erişimi geri alır):
--   -- UPDATE public.yasam_hafizasi_flags SET yh_enabled=false, yh_hizli=false WHERE tenant_id IN (...);
--   -- UPDATE public.users SET module_permissions = module_permissions - 'yasam_hafizasi'
--   --   WHERE role='expert' AND (module_permissions->>'yasam_hafizasi')='true' AND id IN (...);
-- =============================================================================
