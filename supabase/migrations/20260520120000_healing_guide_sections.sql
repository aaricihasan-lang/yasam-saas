-- Şifa Rehberi normalize import (healing_guides + healing_guide_sections)
-- Mevcut healing_guides geniş şeması korunur; eksik kolonlar eklenir.

alter table public.healing_guides
  add column if not exists symptoms text,
  add column if not exists related_stones jsonb,
  add column if not exists related_reflexology jsonb;

create table if not exists public.healing_guide_sections (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.healing_guides (id) on delete cascade,
  section_type text not null check (
    section_type in (
      'reasons',
      'herbal',
      'stones_details',
      'islamic_suggestions',
      'supportive'
    )
  ),
  mode text,
  title text,
  note text,
  source text,
  images jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists healing_guide_sections_guide_id_idx
  on public.healing_guide_sections (guide_id);

create index if not exists healing_guide_sections_type_idx
  on public.healing_guide_sections (section_type);
