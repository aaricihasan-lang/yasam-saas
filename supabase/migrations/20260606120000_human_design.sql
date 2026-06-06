-- ============================================================
-- Human Design Modülü
-- Tablolar: human_design_knowledge_records,
--           human_design_charts,
--           human_design_reports
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
-- Bilgi Bankası tablosu
-- -------------------------------------------------------

create table if not exists public.human_design_knowledge_records (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid,
  user_id          uuid,

  category         text        not null,
  title            text        not null,
  code             text        not null,
  content          text        not null,

  keywords         text[]      not null default '{}',
  related_gates    int[]       not null default '{}',
  related_channels text[]      not null default '{}',
  related_centers  text[]      not null default '{}',
  tags             text[]      not null default '{}',

  sort_order       int         not null default 0,
  is_active        boolean     not null default true,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- tenant başına kod eşsizliği (NULL tenant için placeholder UUID kullan)
create unique index if not exists hd_knowledge_tenant_code_uidx
  on public.human_design_knowledge_records
  (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'), code);

-- updated_at trigger (drop + create — idempotent)
drop trigger if exists trg_hd_knowledge_updated_at
  on public.human_design_knowledge_records;

create trigger trg_hd_knowledge_updated_at
  before update on public.human_design_knowledge_records
  for each row execute function public.set_updated_at();

-- İndeksler
create index if not exists hd_knowledge_tenant_id_idx
  on public.human_design_knowledge_records (tenant_id);

create index if not exists hd_knowledge_category_idx
  on public.human_design_knowledge_records (category);

create index if not exists hd_knowledge_code_idx
  on public.human_design_knowledge_records (code);

create index if not exists hd_knowledge_is_active_idx
  on public.human_design_knowledge_records (is_active);

-- RLS: mevcut proje yaklaşımına uygun — uygulama katmanı koruması yeterli
alter table public.human_design_knowledge_records disable row level security;

grant select, insert, update, delete
  on public.human_design_knowledge_records
  to anon, authenticated;


-- -------------------------------------------------------
-- Chart (Harita) tablosu
-- -------------------------------------------------------

create table if not exists public.human_design_charts (
  id                 uuid        primary key default gen_random_uuid(),
  tenant_id          uuid,
  user_id            uuid,
  client_id          uuid,
  client_name        text,

  birth_date         date,
  birth_time         text,
  birth_place        text,

  -- Harici chart bağlantısı (Jovian Archive, MyBodyGraph vb.)
  external_chart_url text,
  chart_image_url    text,

  -- Manuel girilen HD değerleri (dropdown / multi-select)
  type_code          text,
  authority_code     text,
  profile_code       text,
  definition_code    text,

  active_centers     text[]      not null default '{}',
  open_centers       text[]      not null default '{}',
  gates              int[]       not null default '{}',
  channels           text[]      not null default '{}',

  notes              text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- updated_at trigger (drop + create — idempotent)
drop trigger if exists trg_hd_charts_updated_at
  on public.human_design_charts;

create trigger trg_hd_charts_updated_at
  before update on public.human_design_charts
  for each row execute function public.set_updated_at();

-- İndeksler
create index if not exists hd_charts_tenant_id_idx
  on public.human_design_charts (tenant_id);

create index if not exists hd_charts_client_id_idx
  on public.human_design_charts (client_id);

create index if not exists hd_charts_type_code_idx
  on public.human_design_charts (type_code);

create index if not exists hd_charts_created_at_idx
  on public.human_design_charts (created_at desc);

-- RLS: mevcut proje yaklaşımına uygun
alter table public.human_design_charts disable row level security;

grant select, insert, update, delete
  on public.human_design_charts
  to anon, authenticated;


-- -------------------------------------------------------
-- Raporlar tablosu
-- -------------------------------------------------------

create table if not exists public.human_design_reports (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid,
  user_id           uuid,
  client_id         uuid,

  -- chart silinirse NULL olur; rapor yine de korunur
  chart_id          uuid        references public.human_design_charts(id)
                                  on delete set null,

  title             text        not null,
  selected_codes    text[]      not null default '{}',

  generated_content text,
  edited_content    text,
  report_file_url   text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- updated_at trigger (drop + create — idempotent)
drop trigger if exists trg_hd_reports_updated_at
  on public.human_design_reports;

create trigger trg_hd_reports_updated_at
  before update on public.human_design_reports
  for each row execute function public.set_updated_at();

-- İndeksler
create index if not exists hd_reports_tenant_id_idx
  on public.human_design_reports (tenant_id);

create index if not exists hd_reports_client_id_idx
  on public.human_design_reports (client_id);

create index if not exists hd_reports_chart_id_idx
  on public.human_design_reports (chart_id);

create index if not exists hd_reports_created_at_idx
  on public.human_design_reports (created_at desc);

-- RLS: mevcut proje yaklaşımına uygun
alter table public.human_design_reports disable row level security;

grant select, insert, update, delete
  on public.human_design_reports
  to anon, authenticated;
