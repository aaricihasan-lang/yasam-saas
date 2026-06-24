-- ============================================================
-- 20260624120000_demo_numerology_ip_usage.sql
--
-- Demo Numeroloji — IP bazlı tek analiz hakkı.
--
-- Demo hesapta (uzman@test.com) her bağlantı (IP) yalnızca 1 örnek
-- numeroloji analizi oluşturabilir. Hak localStorage'da DEĞİL, burada
-- kalıcı tutulur — demo kullanıcı çıkış yapıp tekrar girse de hak sıfırlanmaz.
--
-- Güvenlik:
--   - Ham IP saklanmaz; yalnızca SHA-256 hash (server-side, pepper'lı).
--   - RLS AÇIK ve hiçbir policy YOK → anon/authenticated client erişemez.
--     Yalnızca service_role (API route) RLS'i bypass ederek okur/yazar.
-- ============================================================

create table if not exists public.demo_numerology_ip_usage (
  id         uuid        primary key default gen_random_uuid(),
  ip_hash    text        not null unique,
  created_at timestamptz not null default now()
);

-- ip_hash unique zaten index oluşturur; ekstra index gerekmez.

alter table public.demo_numerology_ip_usage enable row level security;

-- Bilinçli olarak hiçbir policy tanımlanmadı: RLS açık + policy yok =
-- anon ve authenticated rollerine kapalı (deny-by-default). Tek yazma/okuma
-- yolu service_role anahtarıyla çalışan /api/numeroloji/demo-analiz route'udur.

comment on table public.demo_numerology_ip_usage is
  'Demo numeroloji IP bazlı tek-analiz hakkı. ip_hash = SHA-256(pepper:ip). RLS açık, policy yok; yalnızca service_role erişir.';
