-- ============================================================
-- 20260615000000_aromatherapy.sql
--
-- Aromaterapi modülü başlangıç migrasyonu
-- Tablo: aromatherapy_oils
--
-- Güvenlik standardı: RLS kapalı, tenant izolasyonu uygulama katmanında.
-- tenant_id = NULL → paylaşımlı / admin yüklü içerik (herkese açık)
-- tenant_id = kullanıcı uuid → kullanıcıya özel kayıt
-- ============================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------------------------------------
-- Tablo: aromatherapy_oils
-- Yağ tipleri: essential (uçucu) | carrier (sabit/taşıyıcı) |
--              hydrosol | resin (reçine) | absolute (mutlak/ekstrakt)
-- -------------------------------------------------------

create table if not exists public.aromatherapy_oils (
  id                     uuid        primary key default gen_random_uuid(),
  tenant_id              uuid,

  -- Kimlik
  name                   text        not null,
  latin_name             text        not null default '',
  oil_type               text        not null default 'essential',
  category               text        not null default '',

  -- Botanik köken
  extraction_method      text        not null default '',
  plant_part             text        not null default '',
  origin                 text        not null default '',

  -- Koku & görünüm
  aroma_profile          text        not null default '',
  aroma_note             text        not null default '',
  color                  text        not null default '',
  consistency            text        not null default '',

  -- Bileşim & terapötik
  main_components        text        not null default '',
  therapeutic_properties text[]      not null default '{}',

  -- Faydalar
  benefits               text        not null default '',
  emotional_benefits     text        not null default '',
  physical_benefits      text        not null default '',
  spiritual_benefits     text        not null default '',
  skin_benefits          text        not null default '',

  -- Kullanım & güvenlik
  usage_methods          text        not null default '',
  dilution_ratio         text        not null default '',
  safety_notes           text        not null default '',
  contraindications      text        not null default '',

  -- Enerji & bağlantı
  blends_well_with       text[]      not null default '{}',
  chakra_connection      text        not null default '',
  element_connection     text        not null default '',

  -- Meta
  notes                  text        not null default '',
  source                 text        not null default '',
  is_active              boolean     not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- -------------------------------------------------------
-- İndeksler
-- -------------------------------------------------------

create index if not exists aro_oils_tenant_idx
  on public.aromatherapy_oils (tenant_id);

create index if not exists aro_oils_type_idx
  on public.aromatherapy_oils (oil_type);

create index if not exists aro_oils_cat_idx
  on public.aromatherapy_oils (category);

create index if not exists aro_oils_active_idx
  on public.aromatherapy_oils (is_active);

create index if not exists aro_oils_name_idx
  on public.aromatherapy_oils using btree (name);

-- -------------------------------------------------------
-- Trigger
-- -------------------------------------------------------

drop trigger if exists trg_aro_oils_updated_at
  on public.aromatherapy_oils;

create trigger trg_aro_oils_updated_at
  before update on public.aromatherapy_oils
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------
-- Güvenlik — proje standardı: RLS kapalı, GRANT tam yetki
-- -------------------------------------------------------

alter table public.aromatherapy_oils disable row level security;

grant select, insert, update, delete
  on public.aromatherapy_oils
  to anon, authenticated;
