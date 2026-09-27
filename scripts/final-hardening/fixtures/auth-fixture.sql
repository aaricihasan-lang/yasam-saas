-- PAKET AUTH migration fixture (yerel embedded-pg; prod'a temas YOK).
-- Prod şemasının minimal kopyası: users, user_sessions, security_events, eski login_user
-- (20260624230000, düz metin fallback'li + anon grant), verify_admin_login, hash_password,
-- dogaltas_normalize_name, hacamat_rules + identity guard trigger.

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text, name text, full_name text, role text, status text, tenant_id uuid,
  active boolean DEFAULT true, approval_status text,
  password text, password_hash text,
  allowed_locations integer DEFAULT 1,
  package_type text, module_permissions jsonb
);

CREATE TABLE public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ip_address text, country text, city text, user_agent text, device_fingerprint text,
  session_token text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz, end_reason text, platform text, client_channel text
);
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type text NOT NULL, severity text NOT NULL, message text,
  ip_address text, country text, city text, user_agent text, metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), reviewed_by_admin boolean NOT NULL DEFAULT false
);

-- Kullanıcılar: hash'li uzman, hash'li admin, yalnız düz metinli (backfill hedefi), 0/3/999/NULL konum.
INSERT INTO public.users (id, email, name, role, status, tenant_id, active, approval_status, password, password_hash, allowed_locations) VALUES
 ('00000000-0000-0000-0000-000000000001', 'Uzman@Test.com ', 'Uzman', 'expert', 'active', '10000000-0000-0000-0000-000000000001', true, 'approved', 'eskiduz', extensions.crypt('dogru-parola-1', extensions.gen_salt('bf', 4)), 1),
 ('00000000-0000-0000-0000-000000000002', 'admin@test.com', 'Admin', 'admin', 'active', '10000000-0000-0000-0000-000000000002', true, 'approved', NULL, extensions.crypt('admin-parola-1', extensions.gen_salt('bf', 4)), 999),
 ('00000000-0000-0000-0000-000000000003', 'plain@test.com', 'Plain', 'expert', 'active', '10000000-0000-0000-0000-000000000003', true, 'pending', '  duz-parola-9  ', NULL, NULL),
 ('00000000-0000-0000-0000-000000000004', 'zero@test.com', 'Zero', 'expert', 'active', '10000000-0000-0000-0000-000000000004', false, 'approved', NULL, extensions.crypt('x', extensions.gen_salt('bf', 4)), 0),
 ('00000000-0000-0000-0000-000000000005', 'three@test.com', 'Three', 'expert', 'active', '10000000-0000-0000-0000-000000000005', true, 'approved', NULL, extensions.crypt('y', extensions.gen_salt('bf', 4)), 3);

INSERT INTO public.user_sessions (user_id, session_token, is_active, created_at, last_seen_at) VALUES
 ('00000000-0000-0000-0000-000000000001', 'tok-expert-active', true,  now() - interval '3 days', now() - interval '3 days'),
 ('00000000-0000-0000-0000-000000000001', 'tok-expert-ended',  false, now() - interval '9 days', now() - interval '9 days'),
 ('00000000-0000-0000-0000-000000000002', 'tok-admin-active',  true,  now() - interval '2 days', now() - interval '2 days');

-- Eski login_user (20260624230000) — düz metin fallback + anon grant.
CREATE FUNCTION public.login_user(p_email text, p_password text)
RETURNS TABLE (id uuid, email text, name text, role text, status text, tenant_id uuid, active boolean, approval_status text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT u.id::uuid, u.email::text, u.name::text, u.role::text, u.status::text, u.tenant_id::uuid, u.active::boolean, u.approval_status::text
  FROM public.users u
  WHERE lower(btrim(u.email)) = lower(btrim(p_email))
    AND ((u.password_hash IS NOT NULL AND u.password_hash <> '' AND extensions.crypt(p_password, u.password_hash) = u.password_hash)
      OR ((u.password_hash IS NULL OR u.password_hash = '') AND btrim(u.password) = btrim(p_password)))
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.login_user(text, text) TO anon, authenticated, service_role;

CREATE FUNCTION public.verify_admin_login(p_email text, p_password text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_hash text;
BEGIN
  SELECT password_hash INTO v_hash FROM public.users WHERE lower(trim(email)) = lower(trim(p_email)) AND role = 'admin' LIMIT 1;
  IF v_hash IS NULL OR v_hash = '' THEN RETURN false; END IF;
  RETURN crypt(p_password, v_hash) = v_hash;
END $$;

CREATE FUNCTION public.hash_password(p_plain text) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$ SELECT crypt(p_plain, gen_salt('bf', 4)); $$;

CREATE FUNCTION public.dogaltas_normalize_name(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT btrim(regexp_replace(lower(translate(COALESCE(p, ''), 'IİıÇçĞğÖöŞşÜü', 'iiiccggoossuu')), '\s+', ' ', 'g'));
$$;

-- SECURITY DEFINER çağıran (create_combination_with_stones deseni): owner yetkisiyle normalize çağırır.
CREATE FUNCTION public.fixture_definer_uses_normalize(p text) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT public.dogaltas_normalize_name(p); $$;
GRANT EXECUTE ON FUNCTION public.fixture_definer_uses_normalize(text) TO anon, authenticated;

CREATE TABLE public.hacamat_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, title text, created_at timestamptz DEFAULT now());
CREATE FUNCTION public.hacamat_rules_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'hacamat_rules identity columns (id, tenant_id, created_at) are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hacamat_rules_identity_guard BEFORE UPDATE ON public.hacamat_rules
  FOR EACH ROW EXECUTE FUNCTION public.hacamat_rules_identity_guard();
GRANT SELECT, UPDATE ON public.hacamat_rules TO authenticated;
INSERT INTO public.hacamat_rules (tenant_id, title) VALUES ('10000000-0000-0000-0000-000000000001', 'Kural');
