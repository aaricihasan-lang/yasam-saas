-- =============================================================================
-- 20260609000000_stones_rls_fix.sql
--
-- SORUN:
--   stones tablosunda Row Level Security (RLS) aktif ama tanımlı policy yoktu.
--   Policy-siz RLS = deny-all → anon key ile yapılan her SELECT 0 satır döndürüyor.
--
-- ÇÖZÜM:
--   Proje standardına uygun: RLS devre dışı, tenant izolasyonu uygulama
--   katmanında (stonesListFetch.ts) yönetiliyor.
--
--   SELECT: tenant_id IN (user_tenant, ADMIN_LIBRARY_TENANT_ID) → uygulama filtresi
--   INSERT/UPDATE/DELETE: .eq("tenant_id", userTenantId) → uygulama filtresi
--   Admin kütüphane taşları (11111111-...) uygulama katmanında yazma korumalı.
-- =============================================================================

-- 1. Mevcut tüm policy'leri temizle (varsa)
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'stones'
  loop
    execute format('drop policy if exists %I on public.stones', pol.policyname);
  end loop;
end
$$;

-- 2. RLS'yi kapat
alter table public.stones disable row level security;

-- 3. anon + authenticated rollerine tam izin ver
grant select, insert, update, delete
  on public.stones
  to anon, authenticated;
