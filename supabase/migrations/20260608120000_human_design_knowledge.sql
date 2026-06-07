-- ============================================================
-- Human Design Bilgi Bankası (JSON aktarımı için)
-- Tablo: human_design_knowledge
-- ============================================================

-- set_updated_at fonksiyonu 20260606120000_human_design.sql içinde
-- create or replace ile tanımlıdır; burada tekrar tanımlamaya gerek yok.

create table if not exists public.human_design_knowledge (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid,
  source_id            text,
  kategori             text        not null,
  baslik               text        not null,
  kod                  text        not null,
  anahtarlar           jsonb       not null default '[]'::jsonb,
  icerik               text        not null default '',
  aktif                boolean     not null default true,
  desktop_created_at   text,
  desktop_updated_at   text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- kod global unique (tenant ayrımı olmaksızın)
create unique index if not exists hd_knowledge_kod_uidx
  on public.human_design_knowledge (kod);

-- updated_at trigger
drop trigger if exists trg_hd_knowledge_updated_at
  on public.human_design_knowledge;

create trigger trg_hd_knowledge_updated_at
  before update on public.human_design_knowledge
  for each row execute function public.set_updated_at();

-- İndeksler
create index if not exists hd_knowledge_kategori_idx
  on public.human_design_knowledge (kategori);

create index if not exists hd_knowledge_baslik_idx
  on public.human_design_knowledge (baslik);

create index if not exists hd_knowledge_aktif_idx
  on public.human_design_knowledge (aktif);

-- RLS: proje standardına uygun — uygulama katmanı koruması yeterli
alter table public.human_design_knowledge disable row level security;

grant select, insert, update, delete
  on table public.human_design_knowledge
  to anon, authenticated, service_role;
