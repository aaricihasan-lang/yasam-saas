-- TRIAL7 DB harness fixture (yerel embedded-pg; prod'a temas YOK).
-- Prod şemasının bu özellik için gereken MİNİMAL kopyası: users (eski üyelik kolonları dahil), tenants,
-- admin_audit_log (prod action CHECK'i — 20271003200100 ile aynı liste), user_sessions,
-- yasam_hafizasi_flags, admin_module_map_is_valid (20270129235900 ile birebir), Gökyüzü Atlası teknik kolonu.
-- Gerçek migration'lar ÜSTÜNE uygulanır: 20260910000000_provisioning_integrity (provision_expert),
-- 20261221000000_yh_grade_expert_premium_rpc, 20280101000000_trial7_self_trial.

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text, slug text, status text, created_at timestamptz DEFAULT now(),
  CONSTRAINT tenants_slug_key UNIQUE (slug)
);

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text, name text, full_name text, role text, status text,
  tenant_id uuid REFERENCES public.tenants(id),
  active boolean DEFAULT true, approval_status text, approved_at timestamptz,
  password text, password_hash text,
  package_type text, plan text, subscription_status text, membership_status text,
  trial_started_at timestamptz, trial_ends_at timestamptz,
  membership_started_at timestamptz, membership_ends_at timestamptz,
  module_permissions jsonb, admin_level text,
  is_super_admin boolean DEFAULT false, is_demo_account boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT users_email_key UNIQUE (email)
);
ALTER TABLE public.users ADD COLUMN astrology_technique_grants jsonb;

CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_admin_id uuid, actor_is_main_admin boolean, target_user_id uuid,
  action text NOT NULL, old_value jsonb, new_value jsonb, context jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_action_chk CHECK (action IN (
  'user_created','user_activated','user_deactivated','user_approved','user_rejected',
  'password_changed_by_admin','all_sessions_terminated','single_session_terminated',
  'desktop_limit_changed','mobile_limit_changed','tablet_limit_changed','total_session_limit_changed',
  'module_enabled','module_disabled','payment_status_changed','role_changed','workspace_viewed',
  'user_deleted','user_archived','main_admin_critical_action','library_transfer_completed',
  'library_transfer_failed','library_transfer_retried','user_profile_updated','license_settings_changed',
  'security_exempt_changed','admin_web_login_pending','admin_web_login_approved','admin_web_login_denied',
  'admin_mobile_login_rejected','own_session_terminated'));

CREATE TABLE public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz, end_reason text
);

CREATE TABLE public.yasam_hafizasi_flags (
  tenant_id uuid PRIMARY KEY, yh_enabled boolean, yh_hizli boolean, yh_shared boolean
);

-- Danışan verisi temsilcisi (Pro'ya geçişte kayıtların korunduğunu kanıtlamak için).
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL, full_name text, created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.admin_module_map_is_valid(p_map jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT p_map IS NOT NULL
     AND jsonb_typeof(p_map) = 'object'
     AND (SELECT count(*) FROM jsonb_object_keys(p_map)) BETWEEN 1 AND 40
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(p_map) e
        WHERE e.key !~ '^[a-z][a-z0-9_]{0,39}$'
           OR e.key = 'yasam_hafizasi'
           OR jsonb_typeof(e.value) <> 'boolean'
     );
$$;

-- Sabit kişiler: aktif admin, mevcut Premium uzman (ödeme kaydı YOK), admin'in açtığı özel hesap,
-- demo hesap, eski (legacy) deneme hesabı (süresi geçmiş, active=true, subscription_status=trial),
-- onay bekleyen eski kayıt.
INSERT INTO public.tenants (id, name, slug, status) VALUES
 ('10000000-0000-0000-0000-000000000001','Admin','admin-t','active'),
 ('10000000-0000-0000-0000-000000000002','Premium','premium-t','active'),
 ('10000000-0000-0000-0000-000000000003','Ozel','ozel-t','active'),
 ('40f842a0-e3e8-448c-8971-9a938e1faccb','Demo','demo-t','active'),
 ('10000000-0000-0000-0000-000000000005','Legacy','legacy-t','active'),
 ('10000000-0000-0000-0000-000000000006','Pending','pending-t','active');

INSERT INTO public.users (id, email, full_name, role, tenant_id, active, approval_status, package_type, plan,
  subscription_status, membership_status, trial_started_at, trial_ends_at, module_permissions, is_super_admin, is_demo_account) VALUES
 ('00000000-0000-0000-0000-0000000000a1','admin@test.com','Admin','admin','10000000-0000-0000-0000-000000000001',true,'approved',NULL,NULL,NULL,NULL,NULL,NULL,NULL,true,false),
 ('00000000-0000-0000-0000-0000000000b1','premium@test.com','Premium Uzman','expert','10000000-0000-0000-0000-000000000002',true,'approved','premium','premium','active','active',
   now() - interval '30 days', now() - interval '27 days',
   '{"clients":true,"digital_content":true,"belge_ceviri":true,"personal_archive":true,"yasam_hafizasi":true}'::jsonb,false,false),
 ('00000000-0000-0000-0000-0000000000c1','ozel@test.com','Ozel Hesap','expert','10000000-0000-0000-0000-000000000003',true,'approved','premium','premium','active','active',NULL,NULL,
   '{"clients":true,"digital_content":true}'::jsonb,false,false),
 ('00000000-0000-0000-0000-0000000000d1','demo@test.com','Demo','expert','40f842a0-e3e8-448c-8971-9a938e1faccb',true,'approved','premium','premium','active','active',NULL,NULL,
   '{"clients":true}'::jsonb,false,true),
 ('00000000-0000-0000-0000-0000000000e1','legacy@test.com','Eski Deneme','expert','10000000-0000-0000-0000-000000000005',true,'approved','trial','trial','trial',NULL,
   now() - interval '20 days', now() - interval '13 days', '{"clients":true}'::jsonb,false,false),
 ('00000000-0000-0000-0000-0000000000f1','pending@test.com','Bekleyen','expert','10000000-0000-0000-0000-000000000006',false,'pending',NULL,'trial','trial',NULL,
   now() - interval '2 days', now() + interval '5 days', '{}'::jsonb,false,false);
