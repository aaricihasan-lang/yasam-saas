-- ============================================================
-- Belge Çeviri Jobs — tablo oluşturma / tenant_id ekleme
--
-- İdempotent: defalarca çalıştırılabilir.
-- Tablo yoksa oluşturur; varsa tenant_id kolonunu ekler.
-- ============================================================

-- Tablo yoksa tam şemayla oluştur (tenant_id dahil)
create table if not exists public.belge_ceviri_jobs (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid,                          -- mevcut kayıtlar için NULL geçerli
  status          text        not null default 'pending',
  job_type        text        not null default 'pdf-to-turkce-word',
  file_name       text        not null default '',
  total_pages     integer     not null default 0,
  total_chunks    integer     not null default 0,
  done_chunks     integer     not null default 0,
  source_path     text        not null default '',
  result_path     text,
  error_message   text,
  created_at      timestamptz not null default now()
);

-- Tablo zaten varsa tenant_id kolonunu ekle (idempotent — varsa atlar)
alter table public.belge_ceviri_jobs
  add column if not exists tenant_id uuid;

-- Tenant bazlı sorgu indeksi
create index if not exists bcj_tenant_id_idx
  on public.belge_ceviri_jobs (tenant_id);

-- Tenant + ID bileşik indeksi (job-status sorgusunu hızlandırır)
create index if not exists bcj_id_tenant_idx
  on public.belge_ceviri_jobs (id, tenant_id);

-- Erişim izinleri (projedeki video_transcription_jobs ile aynı yaklaşım)
grant select, insert, update, delete
  on public.belge_ceviri_jobs
  to anon, authenticated;

-- ============================================================
-- NOT: Eski kayıtlar (tenant_id = NULL)
-- Bu migration öncesi oluşturulan job kayıtları tenant_id = NULL
-- olarak kalır. job-status endpoint'i artık tenantId gerektirdiği
-- için bu eski kayıtlara API üzerinden erişilemez — bu kasıtlıdır.
-- Storage'daki eski dosyalar (output/{jobId}.docx) erişilemez hale
-- gelir; manuel temizlik uygulanabilir.
-- ============================================================
