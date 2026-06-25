-- =============================================================================
-- 20260625160000_client_combinations.sql
--
-- feat(dogaltas): danışana özel kombinasyon tablosu
--
-- AMAÇ:
--   "Kombinasyon Oluştur" akışında uzman, oluşturduğu kombinasyonu iki ayrı
--   hedefe kaydedebilir:
--     1) Genel Kombinasyonlar  → mevcut public.combinations (DEĞİŞMEZ)
--     2) Danışana Özel          → BU tablo (public.client_combinations)
--
-- İLİŞKİ:
--   - client_id → public.clients(id) ON DELETE CASCADE (best-effort; aşağıya bkz.)
--   - Bir danışan birden çok kombinasyona sahip olabilir (1-N).
--   - Bir kombinasyon yalnızca tek danışana aittir.
--
-- GÜVENLİK (combinations ile aynı model):
--   - RLS açık. anon/authenticated (publishable key) için INSERT/UPDATE/DELETE
--     reddedilir; SELECT policy YOKTUR → varsayılan-deny.
--   - Tüm okuma/yazma service_role'lü sunucu API'leri üzerinden yapılır.
--
-- ÖNEMLİ — FK NEDEN AYRI ADIMDA:
--   FK'yi CREATE TABLE içine inline koymak, public.clients(id) üzerinde PK/UNIQUE
--   yoksa (veya clients bir view ise) TÜM CREATE TABLE'ı başarısız kılar ve tek
--   transaction'da her şey rollback olurdu (tablo hiç oluşmazdı). Bu nedenle:
--     - Tablo FK'siz oluşturulur (KESİN oluşur).
--     - FK ayrı bir DO bloğunda best-effort eklenir; eklenemezse hatanın GERÇEK
--       metni RAISE NOTICE ile yazılır ve migration durmaz. Referans bütünlüğü
--       uygulama düzeyinde de garanti altındadır (NOT NULL client_id + tenant/
--       client kapsamlı API guard + cascade-delete route).
--
-- GÜVENLİ / IDEMPOTENT:
--   - create ... if not exists, drop policy/trigger if exists, FK varlık kontrolü.
--   - Tek transaction YOK → kritik tablo, kozmetik bir adım başarısız olsa bile kalır.
--   - Yalnız YENİ nesneler; mevcut tablolara DOKUNMAZ.
-- =============================================================================

-- ── 0) updated_at trigger fonksiyonu (idempotent garanti) ────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── 1) Tablo (FK'SİZ — kesin oluşur) ─────────────────────────────────────────
create table if not exists public.client_combinations (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null,
  client_id     uuid        not null,

  name          text        not null,
  description   text,        -- Amaç / açıklama
  note          text,        -- Serbest not

  stones_text   text,        -- Taş adları (CSV)
  notes_text    text,        -- Mineral koşulları + karşılanan/eksik özeti
  notes_text_2  text,        -- Uyarı + stok özeti

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── 2) FK (best-effort — hata migration'ı durdurmaz, gerçek nedeni yazar) ────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'client_combinations_client_id_fkey'
  ) then
    alter table public.client_combinations
      add constraint client_combinations_client_id_fkey
      foreign key (client_id) references public.clients (id) on delete cascade;
    raise notice 'client_combinations FK eklendi.';
  end if;
exception when others then
  raise notice 'client_combinations FK EKLENEMEDI: % — (uygulama düzeyinde cascade ile yönetilir, tablo yine de hazır)', sqlerrm;
end$$;

-- ── 3) İndeksler ─────────────────────────────────────────────────────────────
create index if not exists client_combinations_tenant_idx
  on public.client_combinations (tenant_id);
create index if not exists client_combinations_client_idx
  on public.client_combinations (client_id);
create index if not exists client_combinations_created_idx
  on public.client_combinations (created_at desc);

-- ── 4) updated_at trigger ────────────────────────────────────────────────────
drop trigger if exists trg_client_combinations_updated_at
  on public.client_combinations;
create trigger trg_client_combinations_updated_at
  before update on public.client_combinations
  for each row execute function public.set_updated_at();

-- ── 5) RLS: service_role-only (anon/authenticated yazma reddi, SELECT yok) ───
alter table public.client_combinations enable row level security;

drop policy if exists "client_combinations_insert_denied" on public.client_combinations;
create policy "client_combinations_insert_denied"
  on public.client_combinations
  for insert to anon, authenticated
  with check (false);

drop policy if exists "client_combinations_update_denied" on public.client_combinations;
create policy "client_combinations_update_denied"
  on public.client_combinations
  for update to anon, authenticated
  using (false);

drop policy if exists "client_combinations_delete_denied" on public.client_combinations;
create policy "client_combinations_delete_denied"
  on public.client_combinations
  for delete to anon, authenticated
  using (false);

-- ── 6) PostgREST şema önbelleğini yenile (API tabloyu hemen görsün) ──────────
notify pgrst, 'reload schema';

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası):
--   select table_name from information_schema.tables
--     where table_schema='public' and table_name='client_combinations';   -- 1 satır
--   select conname from pg_constraint
--     where conname='client_combinations_client_id_fkey';                  -- FK var mı
-- =============================================================================
