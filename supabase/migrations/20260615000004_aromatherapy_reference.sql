-- ============================================================
-- 20260615000004_aromatherapy_reference.sql
--
-- Aromaterapi Excel — birebir referans tabloları
--
-- Amaç: Excel sheet'lerini satır/sütun yapısı bozulmadan
-- saklamak. Hiçbir özetleme/dönüştürme yapılmaz; hücreler
-- JSONB içinde aynen tutulur.
--
-- Güvenlik standardı: RLS kapalı, tenant izolasyonu
-- uygulama katmanında.
-- tenant_id = NULL → paylaşımlı / admin yüklü içerik
-- tenant_id = kullanıcı uuid → kullanıcıya özel kayıt
-- ============================================================

-- -------------------------------------------------------
-- aromatherapy_reference_sheets
-- -------------------------------------------------------
create table if not exists public.aromatherapy_reference_sheets (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid,

  sheet_name    text        not null,        -- Excel'deki sekme adı (birebir)
  display_title text        not null,        -- UI'da gösterilecek başlık
  headers       text[]      not null default '{}',
  -- Excel'in ilk (başlık) satırındaki sütun değerleri.
  -- headers[0] = Col 0, headers[1] = Col 1, ...

  sort_order    int         not null default 0,
  is_active     boolean     not null default true,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -------------------------------------------------------
-- aromatherapy_reference_rows
-- -------------------------------------------------------
create table if not exists public.aromatherapy_reference_rows (
  id          uuid        primary key default gen_random_uuid(),
  sheet_id    uuid        not null
                references public.aromatherapy_reference_sheets(id)
                on delete cascade,

  row_index   int         not null,   -- Excel'deki 0-tabanlı satır numarası
  cells       jsonb       not null default '{}',
  -- {"0": "Terpenler", "1": "Uçucu yağların en büyük kısmını..."}
  -- Anahtar = sütun indeksi (string), değer = hücre metni

  is_header   boolean     not null default false,

  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------
-- İndeksler
-- -------------------------------------------------------

create index if not exists ars_tenant_idx
  on public.aromatherapy_reference_sheets (tenant_id);

create index if not exists ars_name_idx
  on public.aromatherapy_reference_sheets (sheet_name);

create index if not exists ars_sort_idx
  on public.aromatherapy_reference_sheets (sort_order);

create index if not exists arr_sheet_idx
  on public.aromatherapy_reference_rows (sheet_id);

create index if not exists arr_row_idx
  on public.aromatherapy_reference_rows (sheet_id, row_index);

-- -------------------------------------------------------
-- updated_at trigger (sheets)
-- -------------------------------------------------------

drop trigger if exists trg_ars_updated_at
  on public.aromatherapy_reference_sheets;

create trigger trg_ars_updated_at
  before update on public.aromatherapy_reference_sheets
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------
-- Güvenlik — proje standardı: RLS kapalı, GRANT tam yetki
-- -------------------------------------------------------

alter table public.aromatherapy_reference_sheets disable row level security;
alter table public.aromatherapy_reference_rows   disable row level security;

grant select, insert, update, delete
  on public.aromatherapy_reference_sheets
  to anon, authenticated;

grant select, insert, update, delete
  on public.aromatherapy_reference_rows
  to anon, authenticated;
