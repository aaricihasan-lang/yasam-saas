-- ============================================================
-- Video → Türkçe Word/PDF Merkezi
-- Tablolar: video_transcription_jobs, video_training_records
-- ============================================================


-- -------------------------------------------------------
-- updated_at otomatik güncelleme fonksiyonu
-- CREATE OR REPLACE — varsa güvenle üzerine yazar
-- -------------------------------------------------------

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
-- Ana iş tablosu
-- -------------------------------------------------------

create table if not exists public.video_transcription_jobs (
  id                        uuid        primary key default gen_random_uuid(),
  tenant_id                 uuid        not null,
  user_id                   uuid        not null,

  status                    text        not null default 'uploaded'
                              check (status in (
                                'uploaded',
                                'transcribing',
                                'translating',
                                'generating',
                                'completed',
                                'failed'
                              )),

  -- Teknik meta — admin aggregate sorgularında kullanılabilir
  original_filename         text        not null,
  file_size_bytes           bigint,
  source_language           text        not null default 'auto',
  processing_started_at     timestamptz,
  processing_completed_at   timestamptz,
  video_deleted_at          timestamptz,
  error_message             text,

  -- Gizli içerik alanları — yalnızca tenant sorgusu; admin kodunda referans edilmez
  video_temp_path           text,
  word_storage_path         text,
  pdf_storage_path          text,
  transcript_original       text,
  transcript_tr             text,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- updated_at trigger (drop + create — idempotent)
drop trigger if exists trg_vtj_updated_at
  on public.video_transcription_jobs;

create trigger trg_vtj_updated_at
  before update on public.video_transcription_jobs
  for each row execute function public.set_updated_at();

-- İndeksler
create index if not exists vtj_tenant_id_idx
  on public.video_transcription_jobs (tenant_id);

create index if not exists vtj_status_idx
  on public.video_transcription_jobs (status);

create index if not exists vtj_tenant_status_idx
  on public.video_transcription_jobs (tenant_id, status);

create index if not exists vtj_created_at_idx
  on public.video_transcription_jobs (created_at desc);

-- RLS: mevcut proje yaklaşımına uygun — uygulama katmanı koruması yeterli
alter table public.video_transcription_jobs disable row level security;

-- Supabase anon + authenticated rolleri için erişim
grant select, insert, update, delete
  on public.video_transcription_jobs
  to anon, authenticated;


-- -------------------------------------------------------
-- Eğitim kaydı tablosu
-- (Kullanıcı içeriği kalıcı saklamak isterse kaydeder;
--  job silinse de transcript_tr bu tabloda bağımsız kalır)
-- -------------------------------------------------------

create table if not exists public.video_training_records (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null,

  -- job silinirse NULL olur; kayıt yine de korunur
  job_id          uuid        references public.video_transcription_jobs(id)
                                on delete set null,

  title           text        not null,
  category        text        not null default 'Eğitim',
  tags            jsonb       not null default '[]'::jsonb,

  -- Snapshot — job bağımsız olarak burada yaşar
  transcript_tr   text,
  word_path       text,
  pdf_path        text,

  saved_at        timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- updated_at trigger (drop + create — idempotent)
drop trigger if exists trg_vtr_updated_at
  on public.video_training_records;

create trigger trg_vtr_updated_at
  before update on public.video_training_records
  for each row execute function public.set_updated_at();

-- İndeksler
create index if not exists vtr_tenant_id_idx
  on public.video_training_records (tenant_id);

create index if not exists vtr_job_id_idx
  on public.video_training_records (job_id);

create index if not exists vtr_saved_at_idx
  on public.video_training_records (saved_at desc);

-- RLS: mevcut proje yaklaşımına uygun
alter table public.video_training_records disable row level security;

grant select, insert, update, delete
  on public.video_training_records
  to anon, authenticated;


-- ============================================================
-- STORAGE BUCKET'LARI
-- (Supabase SQL Editor veya migrations ile çalışır)
-- on conflict do nothing — bucket zaten varsa sessizce atlar
-- ============================================================

-- Geçici video bucket'ı (işlem sonrası silinir)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'video-temp',
  'video-temp',
  false,
  209715200,           -- 200 MB limit
  array[
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/mpeg',
    'video/ogg'
  ]
)
on conflict (id) do nothing;

-- Kalıcı Word/PDF çıktı bucket'ı
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'video-ceviri-output',
  'video-ceviri-output',
  false,
  52428800,            -- 50 MB limit
  array[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf'
  ]
)
on conflict (id) do nothing;
