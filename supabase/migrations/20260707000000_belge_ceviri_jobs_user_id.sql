-- ============================================================
-- Belge Çeviri Jobs — user_id kolonu + tenant-içi IDOR kilidi (P1c)
--
-- İdempotent: defalarca çalıştırılabilir.
--
-- Neden:
--   1) job-status ve history job'ı YALNIZ tenant_id ile seçiyordu → aynı
--      tenant'taki farklı kullanıcılar birbirinin belgesini görebiliyordu
--      (tenant-içi IDOR). user_id kolonu + kod filtresi bunu kapatır.
--   2) belge_ceviri_jobs tablosuna YALNIZ sunucu (service_role) erişir; hiçbir
--      tarayıcı/anon çağrısı bu tabloyu kullanmaz. Bu yüzden anon/authenticated
--      erişimi kaldırılır ve RLS açılır (service_role RLS'i bypass eder).
--
-- DEPLOY SIRASI: Bu DDL Dashboard SQL Editor'da ÖNCE uygulanmalı; user_id'yi
--   filtreleyen kod ANCAK kolon eklendikten SONRA deploy edilmeli (yoksa
--   "column user_id does not exist" → 500).
-- ============================================================

-- 1) user_id kolonu (mevcut kayıtlar için NULL geçerli)
alter table public.belge_ceviri_jobs
  add column if not exists user_id uuid;

-- 2) Kullanıcı + tenant bileşik indeksi (job-status/history sorgusu)
create index if not exists bcj_user_tenant_idx
  on public.belge_ceviri_jobs (user_id, tenant_id);

-- 3) K-3: tablo yalnız sunucudan (service_role) erişilir → anon/authenticated kaldır
revoke all on public.belge_ceviri_jobs from anon, authenticated;

-- 4) RLS aç — politika YOK: service_role dışında hiçbir rol satır göremez.
--    (service_role BYPASSRLS'e sahiptir; sunucu route'ları etkilenmez.)
alter table public.belge_ceviri_jobs enable row level security;

-- ============================================================
-- NOT: Eski kayıtlar (user_id = NULL)
-- Bu migration öncesi oluşturulan job kayıtları user_id = NULL kalır ve
-- user_id filtresi eklendikten sonra history/job-status'tan görünmez olur.
-- Belge çeviri işleri geçicidir (1 saatlik imzalı URL) → kabul edilebilir,
-- tenant_id = NULL eski kayıtlarla aynı kasıtlı davranış.
-- ============================================================
