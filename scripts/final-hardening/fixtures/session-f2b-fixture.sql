-- GİRİŞ GÜVENLİĞİ F2-B fixture eki (yerel embedded-pg; prod'a temas YOK; sentetik kullanıcılar).
-- session-model-fixture.sql + session-f2a-fixture.sql'den SONRA uygulanır.
-- security_events: prod şemasıyla aynı kolonlar (20260622100000) — auth_mfa_set_required audit'i yazar.

CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type text NOT NULL, severity text NOT NULL, message text,
  ip_address text, country text, city text, user_agent text, metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), reviewed_by_admin boolean NOT NULL DEFAULT false
);

-- Prod yetkileriyle eşit (2026-11-15 salt-okunur: service_role user_sessions üzerinde tam tablo yetkisi).
-- Migration 20280103000200 bunlardan yalnız INSERT'i kaldırır; test bunu bu tabanla doğrular.
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON public.user_sessions TO service_role;

-- Limitli uzman (toplam 1 oturum) + Android uzmanı.
INSERT INTO public.users (id, email, role, tenant_id, active, approval_status, security_exempt, is_super_admin,
  allowed_active_sessions, allowed_desktop_sessions, allowed_mobile_sessions, allowed_tablet_sessions, allowed_unknown_sessions) VALUES
 ('00000000-0000-0000-0000-00000000e0b1', 'f2b-lim@test.local', 'expert', '10000000-0000-0000-0000-000000000021', true, 'approved', false, false, 1, -1, -1, -1, -1),
 ('00000000-0000-0000-0000-00000000e0b2', 'f2b-and@test.local', 'expert', '10000000-0000-0000-0000-000000000022', true, 'approved', false, false, -1, -1, -1, -1, -1);
