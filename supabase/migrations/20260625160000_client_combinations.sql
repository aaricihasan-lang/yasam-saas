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
--   İki yapı tamamen ayrıdır. Genel kombinasyonlar mevcut şemasını korur;
--   danışana özel kombinasyonlar ayrı tablo + FK ile yönetilir.
--
-- İLİŞKİ:
--   - client_id → public.clients(id) ON DELETE CASCADE
--     (danışan silinince ilgili kombinasyonlar da temizlenir).
--   - Bir danışan birden çok kombinasyona sahip olabilir (1-N).
--   - Bir kombinasyon yalnızca tek danışana aittir.
--
-- GÜVENLİK (combinations ile aynı model):
--   - RLS açık. anon/authenticated (publishable key) için INSERT/UPDATE/DELETE
--     reddedilir ve SELECT policy YOKTUR → varsayılan-deny ile 0 satır döner.
--   - Tüm okuma/yazma service_role'lü sunucu API'leri üzerinden yapılır:
--       GET/POST   /api/clients/[id]/combinations
--       PATCH/DEL  /api/clients/[id]/combinations/[combinationId]
--     (verifyUserRequest + tenant=session + client↔tenant IDOR guard).
--   - service_role BYPASSRLS taşır → API'ler etkilenmez.
--
-- GÜVENLİ:
--   - Idempotent (create ... if not exists, drop policy if exists).
--   - Transaction içinde — kısmi uygulama olmaz.
--   - Yalnız YENİ tablo oluşturur; mevcut hiçbir tabloya DOKUNMAZ.
-- =============================================================================

BEGIN;

create table if not exists public.client_combinations (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null,
  client_id     uuid        not null references public.clients(id) on delete cascade,

  name          text        not null,
  description   text,        -- Amaç / açıklama
  note          text,        -- Serbest not

  stones_text   text,        -- Taş adları (CSV) — combinations.stones_text ile aynı format
  notes_text    text,        -- Mineral koşulları + karşılanan/eksik özeti (client)
  notes_text_2  text,        -- Uyarı + stok özeti (client)

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists client_combinations_tenant_idx
  on public.client_combinations (tenant_id);

create index if not exists client_combinations_client_idx
  on public.client_combinations (client_id);

create index if not exists client_combinations_created_idx
  on public.client_combinations (created_at desc);

-- updated_at trigger — set_updated_at() human_design_clients migration'ında tanımlı.
drop trigger if exists trg_client_combinations_updated_at
  on public.client_combinations;

create trigger trg_client_combinations_updated_at
  before update on public.client_combinations
  for each row execute function public.set_updated_at();

-- ── RLS: service_role-only (anon/authenticated tüm yazma reddi, SELECT policy yok)
alter table public.client_combinations enable row level security;

drop policy if exists "client_combinations_insert_denied" on public.client_combinations;
create policy "client_combinations_insert_denied"
  on public.client_combinations
  for insert
  to anon, authenticated
  with check (false);

drop policy if exists "client_combinations_update_denied" on public.client_combinations;
create policy "client_combinations_update_denied"
  on public.client_combinations
  for update
  to anon, authenticated
  using (false);

drop policy if exists "client_combinations_delete_denied" on public.client_combinations;
create policy "client_combinations_delete_denied"
  on public.client_combinations
  for delete
  to anon, authenticated
  using (false);

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası — salt analiz):
--   - publishable (anon) SELECT/INSERT/UPDATE/DELETE → ENGELLENİR.
--   - service_role API'leri (clients/[id]/combinations) → ÇALIŞIR.
--   - clients satırı silinince ilgili client_combinations satırları CASCADE silinir.
-- =============================================================================
