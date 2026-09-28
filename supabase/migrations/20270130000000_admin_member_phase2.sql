-- =============================================================================
-- 20270130000000_admin_member_phase2.sql   [EXPAND — CODE DEPENDENCY]
--
-- ÜYE YÖNETİMİ FAZ 2. Önkoşul: 20270129000000_admin_member_phase1_hardening.sql.
--
-- İÇERİK:
--   1) MEM-012 — Public kayıt için GLOBAL (instance-bağımsız) rate limit:
--      public.auth_rate_limit_events + public.auth_rate_limit_hit(bucket, limit, window).
--      Kova anahtarı uygulamada HMAC'lenir (ham IP/e-posta DB'ye YAZILMAZ).
--   2) MEM-016 — Sunucu tarafı üye listesi: public.admin_search_fold (Türkçe İ/ı/I/ş/ğ/ü/ö/ç
--      katlama) + public.admin_list_users (arama + filtre + sayfalama + toplam + sayaçlar).
--   3) Yeni Uzman (admin create) — public.admin_create_user_with_modules: provision_expert +
--      (uzman ise) admin_approve_expert_with_modules AYNI transaction'da → "onaylı ama 0 modül /
--      trial" üretilemez; admin hesabında approved_at yazılır, trial tarihleri boş kalır.
--   4) MEM-021 — security_events / support_messages: anon + authenticated tablo grant'leri
--      REVOKE (tüm erişim service_role API route'ları üzerinden; RLS zaten satır göstermiyordu).
--
-- VERİ: mevcut kullanıcı satırlarına DML YOK. Yeni tablo yalnız rate-limit olayları.
-- GÜVENLİK: tüm fonksiyonlar SECURITY DEFINER + sabit search_path + YALNIZ service_role EXECUTE.
-- IDEMPOTENT: IF NOT EXISTS / CREATE OR REPLACE / koşullu REVOKE.
-- UYGULAMA: Supabase SQL Editor (AYRI OWNER ONAYI). Bu turda production'a UYGULANMAZ.
-- DEPLOY SIRASI: 20270129 → 20270130 → kod.
-- =============================================================================

BEGIN;

-- ── 1) Rate limit (global, DB-temelli) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auth_rate_limit_events (
  id         bigserial   PRIMARY KEY,
  bucket     text        NOT NULL CHECK (char_length(bucket) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_bucket_time
  ON public.auth_rate_limit_events (bucket, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_created
  ON public.auth_rate_limit_events (created_at);
ALTER TABLE public.auth_rate_limit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_rate_limit_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.auth_rate_limit_events_id_seq FROM PUBLIC, anon, authenticated;

-- Atomik "say + kaydet": aynı kova için advisory xact-lock → eşzamanlı istekler serileşir.
-- Pencere dışı kayıtlar aynı kova için temizlenir (tablo küçük kalır).
CREATE OR REPLACE FUNCTION public.auth_rate_limit_hit(
  p_bucket         text,
  p_limit          integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_count  integer;
  v_oldest timestamptz;
BEGIN
  IF p_bucket IS NULL OR char_length(p_bucket) NOT BETWEEN 1 AND 128
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 10000
     OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'auth_rate_limit_hit: gecersiz parametre' USING ERRCODE = 'UY003';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('auth_rl:' || p_bucket, 0));
  DELETE FROM public.auth_rate_limit_events
   WHERE bucket = p_bucket AND created_at < now() - make_interval(secs => p_window_seconds);
  -- Tek seferlik IP'lerin kovaları birikmesin: 1 günden eski kayıtları SINIRLI (≤200) budar.
  DELETE FROM public.auth_rate_limit_events
   WHERE id IN (SELECT id FROM public.auth_rate_limit_events
                 WHERE created_at < now() - interval '1 day'
                 ORDER BY created_at LIMIT 200);
  SELECT count(*), min(created_at) INTO v_count, v_oldest
    FROM public.auth_rate_limit_events WHERE bucket = p_bucket;
  IF v_count >= p_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'retry_after', GREATEST(1, ceil(extract(epoch FROM (v_oldest + make_interval(secs => p_window_seconds) - now())))::int));
  END IF;
  INSERT INTO public.auth_rate_limit_events (bucket) VALUES (p_bucket);
  RETURN jsonb_build_object('allowed', true, 'retry_after', 0);
END;
$$;

-- ── 2) Türkçe katlama + sunucu tarafı üye listesi ───────────────────────────────
-- İ/I/ı → i, Ş/ş → s, Ğ/ğ → g, Ü/ü → u, Ö/ö → o, Ç/ç → c, Â/Î/Û → a/i/u; sonra lower().
-- Locale'den BAĞIMSIZ (lower('İ') gibi collation tuzakları önlenir): "ŞİŞGİN" = "şişgin" = "sisgin",
-- "ARICI" = "Arıcı".
CREATE OR REPLACE FUNCTION public.admin_search_fold(p text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_catalog
AS $$
  SELECT lower(translate(coalesce(p, ''), 'İIıŞşĞğÜüÖöÇçÂâÎîÛû', 'iiissgguuooccaaiiuu'));
$$;

-- p_view    : 'members' (arşiv HARİÇ) | 'archive' (yalnız onaylı+pasif uzman) | 'all'
-- p_approval: all|pending|approved|rejected (legacy boş/diğer → pending)
-- p_active  : all|active|passive   · p_role: all|admin|expert
-- p_payment : all|paid|pending|overdue|exempt
-- p_role_match: uygulama "uzman"/"yönetici" gibi rol aramasını çözerse 'expert'/'admin' (yoksa NULL)
-- Sayaçlar (counts) GLOBAL'dir (filtreden bağımsız) ve UZMANLAR için bir BÖLÜMLEMEDİR:
--   experts_total = pending + approved_active + archived + rejected  (kesişim yok).
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_q          text,
  p_role_match text,
  p_view       text,
  p_approval   text,
  p_active     text,
  p_role       text,
  p_payment    text,
  p_limit      integer,
  p_offset     integer
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_q      text := public.admin_search_fold(btrim(coalesce(p_q, '')));
  v_pat    text;
  v_limit  integer := LEAST(GREATEST(coalesce(p_limit, 20), 1), 100);
  v_offset integer := LEAST(GREATEST(coalesce(p_offset, 0), 0), 1000000);
  v_total  integer;
  v_rows   jsonb;
  v_counts jsonb;
BEGIN
  IF coalesce(p_view, 'members') NOT IN ('members', 'archive', 'all')
     OR coalesce(p_approval, 'all') NOT IN ('all', 'pending', 'approved', 'rejected')
     OR coalesce(p_active, 'all') NOT IN ('all', 'active', 'passive')
     OR coalesce(p_role, 'all') NOT IN ('all', 'admin', 'expert')
     OR coalesce(p_payment, 'all') NOT IN ('all', 'paid', 'pending', 'overdue', 'exempt')
     OR (p_role_match IS NOT NULL AND p_role_match NOT IN ('admin', 'expert'))
     OR char_length(v_q) > 120 THEN
    RAISE EXCEPTION 'admin_list_users: gecersiz filtre' USING ERRCODE = 'UY003';
  END IF;
  -- LIKE joker karakterleri kaçışlanır (kullanıcı girdisi desen olarak yorumlanmaz).
  v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  -- Toplam (filtreli) + sayfa (aynı koşullar):
  SELECT count(*)::int INTO v_total FROM (
    SELECT 1 FROM public.users u
     WHERE (coalesce(p_view, 'members') = 'all'
            OR (p_view = 'archive' AND (lower(coalesce(u.role,'')) = 'expert' AND lower(coalesce(u.approval_status,'')) = 'approved' AND u.active IS NOT TRUE))
            OR (coalesce(p_view, 'members') = 'members' AND NOT (lower(coalesce(u.role,'')) = 'expert' AND lower(coalesce(u.approval_status,'')) = 'approved' AND u.active IS NOT TRUE)))
       AND (coalesce(p_approval, 'all') = 'all'
            OR (CASE WHEN lower(coalesce(u.approval_status,'')) IN ('approved','rejected') THEN lower(u.approval_status) ELSE 'pending' END) = p_approval)
       AND (coalesce(p_active, 'all') = 'all' OR (p_active = 'active' AND u.active IS TRUE) OR (p_active = 'passive' AND u.active IS NOT TRUE))
       AND (coalesce(p_role, 'all') = 'all' OR lower(coalesce(u.role, '')) = p_role)
       AND (coalesce(p_payment, 'all') = 'all' OR lower(coalesce(u.payment_status, '')) = p_payment)
       AND (v_q = '' OR public.admin_search_fold(u.full_name) LIKE v_pat OR public.admin_search_fold(u.email) LIKE v_pat
            OR (p_role_match IS NOT NULL AND lower(coalesce(u.role, '')) = p_role_match))
  ) t;

  SELECT coalesce(jsonb_agg(to_jsonb(s) - 'ord_appr' ORDER BY s.ord_appr, s.created_at DESC NULLS LAST, s.id), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT u.id, u.full_name, u.email, u.role, u.active, u.approval_status, u.approved_at,
             u.module_permissions, u.package_type, u.membership_status, u.subscription_status,
             u.trial_started_at, u.trial_ends_at, u.membership_started_at, u.membership_ends_at,
             u.plan, u.admin_level, u.tenant_id, u.created_at, u.payment_status, u.last_payment_date,
             u.next_payment_date, u.paid_amount, u.payment_note, u.license_type,
             u.allowed_active_sessions, u.allowed_locations, u.security_mode, u.security_exempt,
             u.license_note, u.allowed_desktop_sessions, u.allowed_mobile_sessions,
             u.allowed_tablet_sessions, u.allowed_unknown_sessions,
             CASE WHEN lower(coalesce(u.approval_status,'')) = 'approved' THEN 1
                  WHEN lower(coalesce(u.approval_status,'')) = 'rejected' THEN 2 ELSE 0 END AS ord_appr
        FROM public.users u
       WHERE (coalesce(p_view, 'members') = 'all'
              OR (p_view = 'archive' AND (lower(coalesce(u.role,'')) = 'expert' AND lower(coalesce(u.approval_status,'')) = 'approved' AND u.active IS NOT TRUE))
              OR (coalesce(p_view, 'members') = 'members' AND NOT (lower(coalesce(u.role,'')) = 'expert' AND lower(coalesce(u.approval_status,'')) = 'approved' AND u.active IS NOT TRUE)))
         AND (coalesce(p_approval, 'all') = 'all'
              OR (CASE WHEN lower(coalesce(u.approval_status,'')) IN ('approved','rejected') THEN lower(u.approval_status) ELSE 'pending' END) = p_approval)
         AND (coalesce(p_active, 'all') = 'all' OR (p_active = 'active' AND u.active IS TRUE) OR (p_active = 'passive' AND u.active IS NOT TRUE))
         AND (coalesce(p_role, 'all') = 'all' OR lower(coalesce(u.role, '')) = p_role)
         AND (coalesce(p_payment, 'all') = 'all' OR lower(coalesce(u.payment_status, '')) = p_payment)
         AND (v_q = '' OR public.admin_search_fold(u.full_name) LIKE v_pat OR public.admin_search_fold(u.email) LIKE v_pat
              OR (p_role_match IS NOT NULL AND lower(coalesce(u.role, '')) = p_role_match))
       ORDER BY ord_appr, u.created_at DESC NULLS LAST, u.id
       LIMIT v_limit OFFSET v_offset
    ) s;

  SELECT jsonb_build_object(
           'experts_total',   count(*) FILTER (WHERE r = 'expert'),
           'pending',         count(*) FILTER (WHERE r = 'expert' AND a NOT IN ('approved', 'rejected')),
           'approved_active', count(*) FILTER (WHERE r = 'expert' AND a = 'approved' AND act IS TRUE),
           'archived',        count(*) FILTER (WHERE r = 'expert' AND a = 'approved' AND act IS NOT TRUE),
           'rejected',        count(*) FILTER (WHERE r = 'expert' AND a = 'rejected'),
           'admins',          count(*) FILTER (WHERE r = 'admin'))
    INTO v_counts
    FROM (SELECT lower(coalesce(role, '')) AS r, lower(coalesce(approval_status, '')) AS a, active AS act
            FROM public.users) z;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows, 'counts', v_counts,
                            'limit', v_limit, 'offset', v_offset);
END;
$$;

-- ── 3) Yeni Uzman / Yeni Admin — tek atomik işlem ───────────────────────────────
-- Uzman: provision_expert(mode=admin, active=false → pending) + admin_approve_expert_with_modules
--        (approved + active + Premium + YALNIZ seçilen modüller + audit) AYNI tx. Onay adımı
--        hata verirse provisioning de ROLLBACK olur (yarım tenant/kullanıcı KALMAZ).
-- Admin: provision_expert(mode=admin, active=true) + approved_at=now() + trial tarihleri boş.
CREATE OR REPLACE FUNCTION public.admin_create_user_with_modules(
  p_payload     jsonb,
  p_membership  jsonb,
  p_modules     jsonb,
  p_remove_keys text[]
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_role  text := p_payload->>'role';
  v_actor uuid := (p_payload->>'actor_admin_id')::uuid;
  v_prov  jsonb;
  v_uid   uuid;
  v_appr  jsonb;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('admin', 'expert') OR v_actor IS NULL THEN
    RAISE EXCEPTION 'admin_create_user_with_modules: rol/aktor gecersiz' USING ERRCODE = 'UY003';
  END IF;

  IF v_role = 'expert' THEN
    IF NOT public.admin_module_map_is_valid(p_modules)
       OR NOT EXISTS (SELECT 1 FROM jsonb_each(p_modules) e WHERE e.value = 'true'::jsonb) THEN
      RAISE EXCEPTION 'admin_create_user_with_modules: en az bir modul secilmeli' USING ERRCODE = 'UY003';
    END IF;
    v_prov := public.provision_expert(
      (p_payload - 'active' - 'mode' - 'role')
        || jsonb_build_object('mode', 'admin', 'role', 'expert', 'active', false,
                              'module_permissions', '{}'::jsonb));
    IF coalesce(v_prov->>'outcome', '') <> 'provisioned' THEN
      RETURN v_prov;
    END IF;
    v_uid := (v_prov->>'user_id')::uuid;
    v_appr := public.admin_approve_expert_with_modules(
      v_uid, p_membership, v_actor, p_modules, coalesce(p_remove_keys, '{}'::text[]), 'pending');
    RETURN v_prov || jsonb_build_object('approval', v_appr);
  END IF;

  v_prov := public.provision_expert(
    (p_payload - 'active' - 'mode' - 'role' - 'module_permissions')
      || jsonb_build_object('mode', 'admin', 'role', 'admin', 'active', true));
  IF coalesce(v_prov->>'outcome', '') = 'provisioned' THEN
    v_uid := (v_prov->>'user_id')::uuid;
    UPDATE public.users
       SET approved_at = coalesce(approved_at, now()),
           trial_started_at = NULL,
           trial_ends_at = NULL
     WHERE id = v_uid;
  END IF;
  RETURN v_prov;
END;
$$;

-- ── 4) MEM-021 — gereksiz anon/authenticated tablo grant'leri ───────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['security_events', 'support_messages'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;

-- ── Yetki: yalnız service_role EXECUTE ──────────────────────────────────────────
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.auth_rate_limit_hit(text,integer,integer)',
    'public.admin_search_fold(text)',
    'public.admin_list_users(text,text,text,text,text,text,text,integer,integer)',
    'public.admin_create_user_with_modules(jsonb,jsonb,jsonb,text[])'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (salt-okunur, uygulama sonrası):
--   SELECT has_table_privilege('anon','public.security_events','SELECT');        -- f
--   SELECT has_table_privilege('anon','public.support_messages','SELECT');       -- f
--   SELECT has_table_privilege('service_role','public.security_events','SELECT'); -- t
--   SELECT public.admin_search_fold('ŞİŞGİN ARICI');                              -- 'sisgin arici'
-- ROLLBACK (kod geri alındıktan sonra):
--   DROP FUNCTION IF EXISTS public.admin_create_user_with_modules(jsonb,jsonb,jsonb,text[]);
--   DROP FUNCTION IF EXISTS public.admin_list_users(text,text,text,text,text,text,text,integer,integer);
--   DROP FUNCTION IF EXISTS public.admin_search_fold(text);
--   DROP FUNCTION IF EXISTS public.auth_rate_limit_hit(text,integer,integer);
--   DROP TABLE IF EXISTS public.auth_rate_limit_events;
--   -- Grant geri alma GEREKMEZ (anon/authenticated erişimi hiçbir kod yolunda kullanılmıyordu).
-- =============================================================================
