-- ============================================================
-- Human Design — Danışan Tablosu
-- Tablo: human_design_clients
-- FK:    human_design_charts.client_id → human_design_clients.id
-- ============================================================


-- set_updated_at — CREATE OR REPLACE, varsa güvenle üzerine yazar
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- -------------------------------------------------------
-- Danışan tablosu
-- -------------------------------------------------------

create table if not exists public.human_design_clients (
  id                 uuid        primary key default gen_random_uuid(),
  tenant_id          uuid,
  user_id            uuid,

  name               text        not null,
  birth_date         date,
  birth_time         text,
  birth_place        text,

  chart_image_url    text,
  external_chart_url text,

  notes              text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- updated_at trigger (drop + create — idempotent)
drop trigger if exists trg_hd_clients_updated_at
  on public.human_design_clients;

create trigger trg_hd_clients_updated_at
  before update on public.human_design_clients
  for each row execute function public.set_updated_at();

-- İndeksler
create index if not exists hd_clients_tenant_id_idx
  on public.human_design_clients (tenant_id);

create index if not exists hd_clients_name_idx
  on public.human_design_clients (name);

create index if not exists hd_clients_created_at_idx
  on public.human_design_clients (created_at desc);

-- RLS: mevcut proje yaklaşımına uygun — uygulama katmanı koruması yeterli
alter table public.human_design_clients disable row level security;

grant select, insert, update, delete
  on public.human_design_clients
  to anon, authenticated;


-- -------------------------------------------------------
-- human_design_charts.client_id → human_design_clients.id
--
-- human_design_charts.client_id plain UUID olarak var;
-- FK kısıtlaması bu migration ile ekleniyor.
-- Tablo boş olduğu için veri kaybı riski yoktur.
-- Danışan silinirse charts kaydında client_id NULL olur (SET NULL).
-- -------------------------------------------------------

alter table public.human_design_charts
  add constraint fk_hd_charts_client
  foreign key (client_id)
  references public.human_design_clients(id)
  on delete set null;
