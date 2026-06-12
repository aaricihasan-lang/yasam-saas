-- ============================================================
-- 20260612010000_stone_knowledge_categories.sql
--
-- Taş Bilgi Kütüphanesi — dinamik kategori tablosu
-- ============================================================

-- set_updated_at zaten tanımlı — CREATE OR REPLACE ile güvenle üzerine yazar
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------------------------------------
-- Tablo
-- -------------------------------------------------------

create table if not exists public.stone_knowledge_categories (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  slug        text        not null unique,
  icon        text        not null default '📖',
  color       text        not null default 'slate',
  sort_order  int         not null default 0,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -------------------------------------------------------
-- İndeksler
-- -------------------------------------------------------

create index if not exists skc_slug_idx
  on public.stone_knowledge_categories (slug);

create index if not exists skc_sort_idx
  on public.stone_knowledge_categories (sort_order, name);

create index if not exists skc_is_active_idx
  on public.stone_knowledge_categories (is_active);

-- -------------------------------------------------------
-- Trigger
-- -------------------------------------------------------

drop trigger if exists trg_skc_updated_at
  on public.stone_knowledge_categories;

create trigger trg_skc_updated_at
  before update on public.stone_knowledge_categories
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------
-- Güvenlik — proje standardı
-- -------------------------------------------------------

alter table public.stone_knowledge_categories disable row level security;

grant select, insert, update, delete
  on public.stone_knowledge_categories
  to anon, authenticated;

-- -------------------------------------------------------
-- Varsayılan kategoriler
-- -------------------------------------------------------

insert into public.stone_knowledge_categories
  (name, slug, icon, color, sort_order)
values
  ('Şifa',        'sifa',        '💚', 'emerald', 1),
  ('Araştırma',   'arastirma',   '🔬', 'blue',    2),
  ('Mineroloji',  'mineroloji',  '💎', 'violet',  3),
  ('Uygulamalar', 'uygulamalar', '🖐️', 'amber',   4),
  ('Genel',       'genel',       '📖', 'slate',   5)
on conflict (slug) do nothing;
