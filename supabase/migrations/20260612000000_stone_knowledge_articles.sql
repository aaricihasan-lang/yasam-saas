-- ============================================================
-- 20260612000000_stone_knowledge_articles.sql
--
-- Taş Bilgi Kütüphanesi makaleleri
-- Önceki kaynak: public/data/tas_bilgi_kutuphanesi.json (240 makale)
-- Yeni kaynak:   bu tablo (Supabase)
--
-- Güvenlik standardı: RLS kapalı, tenant izolasyonu uygulama katmanında.
-- Admin/global kütüphane: tenant_id = NULL (herkese açık paylaşımlı içerik)
--   veya ADMIN_LIBRARY_TENANT_ID (aa8b960b-f4f1-4e5b-89f5-109bc030c147).
-- Kullanıcıya özel ek makaleler: tenant_id = kullanıcı tenant uuid.
-- ============================================================

-- set_updated_at fonksiyonu zaten varsa tekrar oluşturma
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
-- Tablo
-- -------------------------------------------------------

create table if not exists public.stone_knowledge_articles (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid,                              -- NULL = paylaşımlı kütüphane

  title            text        not null,             -- baslik
  content          text        not null default '',  -- icerik
  category         text        not null default '',  -- kategori
  sub_category     text        not null default '',  -- alt_kategori
  tags             text[]      not null default '{}', -- etiketler
  related_stones   text[]      not null default '{}', -- ilgili_taslar
  related_minerals text[]      not null default '{}', -- ilgili_mineraller
  source           text        not null default '',  -- kaynak
  source_section   text        not null default '',  -- kaynak_bolum
  keyword          text        not null default '',  -- anahtar_kelime
  notes            text        not null default '',  -- notlar

  is_active        boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- -------------------------------------------------------
-- İndeksler
-- -------------------------------------------------------

create index if not exists ska_tenant_id_idx
  on public.stone_knowledge_articles (tenant_id);

create index if not exists ska_category_idx
  on public.stone_knowledge_articles (category);

create index if not exists ska_is_active_idx
  on public.stone_knowledge_articles (is_active);

-- title üzerinde GIN (full-text benzeri)
create index if not exists ska_title_idx
  on public.stone_knowledge_articles
  using btree (title);

-- -------------------------------------------------------
-- updated_at trigger
-- -------------------------------------------------------

drop trigger if exists trg_ska_updated_at
  on public.stone_knowledge_articles;

create trigger trg_ska_updated_at
  before update on public.stone_knowledge_articles
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------
-- Güvenlik — proje standardı: RLS kapalı, GRANT tam yetki
-- -------------------------------------------------------

alter table public.stone_knowledge_articles disable row level security;

grant select, insert, update, delete
  on public.stone_knowledge_articles
  to anon, authenticated;
