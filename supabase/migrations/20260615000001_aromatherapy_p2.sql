-- ============================================================
-- 20260615000001_aromatherapy_p2.sql
--
-- Aromaterapi Öncelik-2 alanları
-- images, is_photosensitive, shelf_life, target_systems
-- ============================================================

alter table public.aromatherapy_oils
  add column if not exists images            jsonb   not null default '[]',
  add column if not exists is_photosensitive boolean not null default false,
  add column if not exists shelf_life        text    not null default '',
  add column if not exists target_systems    text[]  not null default '{}';
