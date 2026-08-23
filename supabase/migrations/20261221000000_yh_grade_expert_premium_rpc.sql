-- =============================================================================
-- 20261221000000_yh_grade_expert_premium_rpc.sql   [EXPAND — CODE DEPENDENCY ONLY]
--
-- YAŞAM HAFIZASI™ — TÜM UZMANLARA AÇILIM · EXPAND MIGRATION (yalnız DB contract).
--
-- AMAÇ: Yeni production kodu `public.yh_grade_expert_premium(...)` RPC'sine bağımlıdır. Bu
--   EXPAND migration YALNIZ o RPC'yi (ve grant/security sözleşmesini) kurar; böylece code
--   deploy'dan ÖNCE güvenle uygulanabilir (GATE 1).
--
-- KRİTİK RELEASE İNVARYANTI — BU MIGRATION KULLANICI AÇILIMI YAPMAZ:
--   * HİÇBİR expert permission DEĞİŞTİRMEZ.
--   * HİÇBİR existing-expert flag AÇMAZ.
--   * HİÇBİR admin flag AÇMAZ.
--   * HİÇBİR activation / bulk / seed / data DML çalıştırmaz (yalnız CREATE FUNCTION + grant).
--   → RPC gövdesindeki UPDATE/INSERT YALNIZ RPC ÇAĞRILDIĞINDA çalışır; apply anında DEĞİL.
--   Kullanıcı açılımı AYRI migration'dadır: 20261221000100_yh_expert_rollout_activation.sql (GATE 4).
--
-- RPC SÖZLEŞMESİ (yh_grade_expert_premium): premium/eligible geçişi + YH grant'i TEK
--   transaction'da uygular. POST-TRANSACTION eligibility (RESULTING state) belirleyicidir:
--   sonuç role=expert · active · approved · premium · non-demo · tenant≠demo/admin-library ·
--   tenant'ta demo user yok ise module_permissions.yasam_hafizasi + yh_enabled + yh_hizli
--   BİRLİKTE set edilir ('premium_with_yh'); aksi 'premium_no_yh'. YH/flags yazımı hata verirse
--   membership/active/approved dahil TÜM transaction ROLLBACK (semantic partial YOK). yh_shared'e
--   DOKUNULMAZ (ortak havuz YOK).
--
-- GÜVENLİK İNVARYANTLARI (DB authoritative; caller JSON'una GÜVENİLMEZ):
--   (1) FAIL-CLOSED PREMIUM GATE (TUTARLILIK): p_membership'te package_type VE plan ikisi birden
--       'premium' DEĞİLSE (çelişkili/eksik/non-premium payload) RPC UPDATE'e GİRMEDEN RAISE eder →
--       active/approved yükseltmesi VE YH grant ASLA üretilmez. Gerçek caller her zaman ikisini de
--       premium gönderir; resulting eligibility de package_type VE plan'ı ayrı ayrı premium arar
--       (COALESCE ile çelişkili state premium SAYILMAZ).
--   (2) CALLER-YH SANITIZATION: ADIM 1, caller-supplied p_module_permissions içinden `yasam_hafizasi`
--       key'ini DB seviyesinde MUTLAKA çıkarır. YH grant AUTHORITY yalnız ADIM 3'ün eligible branch'i
--       olabilir; malicious/hatalı `{"yasam_hafizasi":true}` payload'ı ineligible bir kullanıcıda YH
--       izni BIRAKAMAZ. Generic premium payload YH authority DEĞİLDİR.
--
-- GÜVENLİK: SECURITY DEFINER + sabit search_path + yalnız service_role EXECUTE.
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION + guard'lı REVOKE/GRANT.
-- UYGULAMA: Supabase Dashboard SQL Editor (GATE 1; AYRI ONAY). Bu turda UYGULANMAZ.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.yh_grade_expert_premium(
  p_user_id            uuid,
  p_membership         jsonb,
  p_module_permissions jsonb
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user     public.users%ROWTYPE;
  v_eligible boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'yh_grade_expert_premium: p_user_id null';
  END IF;

  -- ── FAIL-CLOSED PREMIUM GATE (İNVARYANT 1): bu RPC YALNIZ gerçek, TUTARLI PREMIUM transition
  --    içindir. Gerçek caller (app/api/admin/users/[id]/package → buildMembershipUpdatePayload)
  --    HER ZAMAN package_type='premium' VE plan='premium' BİRLİKTE gönderir (USERS_SAFE_SELECT ikisini
  --    de içerir → filter ikisini de korur). Bu yüzden DB de TUTARLILIĞI zorlar: package_type VE plan
  --    ikisi birden premium DEĞİLSE (çelişkili/eksik/non-premium payload) HİÇBİR UPDATE çalıştırmadan
  --    reddet → active/approved yükseltmesi VE YH grant ASLA üretilmez (caller'a güvenilmez). ──
  IF lower(coalesce(p_membership->>'package_type', '')) <> 'premium'
     OR lower(coalesce(p_membership->>'plan', '')) <> 'premium' THEN
    RAISE EXCEPTION 'yh_grade_expert_premium: tutarli premium payload gerekli (package_type VE plan premium olmali)';
  END IF;

  -- ── ADIM 1: membership premium + modül izinleri (YH HARİÇ) + active/approved.
  --    UPDATE satırı kilitler; RESULTING satır RETURNING ile alınır (eligibility POST-TRANSACTION).
  --    CALLER-YH SANITIZATION (İNVARYANT 2): caller-supplied module_permissions'tan `yasam_hafizasi`
  --    DB seviyesinde `- 'yasam_hafizasi'` ile ÇIKARILIR → YH grant authority YALNIZ ADIM 3 eligible
  --    branch'idir; caller'ın `{"yasam_hafizasi":true}` payload'ı ADIM 1'de YH izni BIRAKAMAZ. ──
  UPDATE public.users SET
    package_type          = COALESCE(p_membership->>'package_type', package_type),
    membership_status     = COALESCE(p_membership->>'membership_status', membership_status),
    trial_started_at      = CASE WHEN p_membership ? 'trial_started_at'      THEN (p_membership->>'trial_started_at')::timestamptz      ELSE trial_started_at END,
    trial_ends_at         = CASE WHEN p_membership ? 'trial_ends_at'         THEN (p_membership->>'trial_ends_at')::timestamptz         ELSE trial_ends_at END,
    membership_started_at = CASE WHEN p_membership ? 'membership_started_at' THEN (p_membership->>'membership_started_at')::timestamptz ELSE membership_started_at END,
    membership_ends_at    = CASE WHEN p_membership ? 'membership_ends_at'    THEN (p_membership->>'membership_ends_at')::timestamptz    ELSE membership_ends_at END,
    plan                  = COALESCE(p_membership->>'plan', plan),
    subscription_status   = COALESCE(p_membership->>'subscription_status', subscription_status),
    module_permissions    = (COALESCE(p_module_permissions, module_permissions, '{}'::jsonb)) - 'yasam_hafizasi',
    active                = true,
    approval_status       = 'approved',
    approved_at           = now()
  WHERE id = p_user_id
  RETURNING * INTO v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'yh_grade_expert_premium: kullanici bulunamadi';
  END IF;

  -- ── ADIM 2: POST-TRANSACTION eligibility (RESULTING state; BELİRLEYİCİ invariant) ──
  --    PREMIUM INVARIANT: resulting state TUTARLI premium olmalı — package_type VE plan ayrı ayrı
  --    'premium'. COALESCE(package_type, plan) çelişkili state'i (biri premium/diğeri değil) premium
  --    saymaz; gate zaten çelişkiyi elediği için valid transition sonrası ikisi de 'premium'.
  v_eligible :=
        v_user.role = 'expert'
    AND v_user.active = true
    AND lower(coalesce(v_user.approval_status, '')) = 'approved'
    AND lower(coalesce(v_user.package_type, '')) = 'premium'
    AND lower(coalesce(v_user.plan, '')) = 'premium'
    AND coalesce(v_user.is_demo_account, false) = false
    AND v_user.tenant_id IS NOT NULL
    AND v_user.tenant_id NOT IN (
      'aa8b960b-f4f1-4e5b-89f5-109bc030c147'::uuid,  -- ADMIN_LIBRARY_TENANT (synthetic)
      '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid   -- DEMO_TENANT
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.users d
      WHERE d.tenant_id = v_user.tenant_id AND coalesce(d.is_demo_account, false) = true
    );

  -- ── ADIM 3: resulting eligible ⇒ YH perm + flags BİRLİKTE (aynı transaction; both-or-neither).
  --    flags yazımı hata verirse ADIM 1 dahil TÜM transaction ROLLBACK → semantic partial YOK. ──
  IF v_eligible THEN
    UPDATE public.users
      SET module_permissions =
            COALESCE(module_permissions, '{}'::jsonb) || jsonb_build_object('yasam_hafizasi', true)
      WHERE id = p_user_id;

    INSERT INTO public.yasam_hafizasi_flags (tenant_id, yh_enabled, yh_hizli)
    VALUES (v_user.tenant_id, true, true)
    ON CONFLICT (tenant_id) DO UPDATE
      SET yh_enabled = true, yh_hizli = true;  -- yh_shared vb. DEĞİŞMEZ
    RETURN 'premium_with_yh';
  END IF;

  RETURN 'premium_no_yh';
END;
$$;

REVOKE ALL ON FUNCTION public.yh_grade_expert_premium(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_grade_expert_premium(uuid, jsonb, jsonb) TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   SELECT prosecdef FROM pg_proc WHERE proname='yh_grade_expert_premium';                          -- t
--   SELECT has_function_privilege('anon','public.yh_grade_expert_premium(uuid,jsonb,jsonb)','EXECUTE'); -- false
--   -- İNVARYANT 1 (fail-closed premium/tutarlilik): package_type VE plan ikisi birden premium değilse
--   --   RAISE eder (active/approved/YH üretmez); resulting eligibility de ikisini ayrı ayrı premium arar.
--   -- İNVARYANT 2 (caller-YH sanitize): ADIM 1 `- 'yasam_hafizasi'` → ineligible'da caller YH grant üretemez.
--   -- Bu migration APPLY edildiğinde HİÇBİR users/flags satırı değişmez (yalnız fonksiyon kurulur).
--   -- Kullanıcı açılımı: 20261221000100_yh_expert_rollout_activation.sql (GATE 4; code deploy SONRASI).
-- ROLLBACK: DROP FUNCTION IF EXISTS public.yh_grade_expert_premium(uuid, jsonb, jsonb);
-- =============================================================================
