-- =============================================================================
-- HD-P2-B — human_design_reports.client_id VERİ BÜTÜNLÜĞÜ (FK backstop)
-- =============================================================================
--
-- SORUN: human_design_reports.client_id bugüne dek plain uuid kolonu; referans
-- bütünlüğü YOK. (Kardeş FK'ler zaten var: human_design_charts.client_id ve
-- human_design_reports.chart_id → her ikisi de ON DELETE SET NULL.)
--
-- ÇÖZÜM: client_id → human_design_clients(id) için ON DELETE SET NULL FK ekle
-- (kardeş FK konvansiyonuyla birebir; danışan doğrudan/dolaylı silinirse rapor
-- KORUNUR, yalnız client_id NULL olur — canonical/profesyonel snapshot rapor
-- kendi donmuş kopyasını taşıdığından bilgi kaybı olmaz).
--
-- GÜVENLİK / SÖZLEŞME (FAIL-CLOSED):
--   • ADDITIVE + idempotent + guarded: FK zaten varsa hiçbir şey yapmaz.
--   • DESTRUCTIVE DEĞİL: hiçbir satır SİLİNMEZ.
--   • SESSİZ VERİ İLİŞKİSİ KAYBI YOK: mevcut client_id değerleri OTOMATİK NULL'a
--     ÇEKİLMEZ. Önce orphan/dangling client_id var mı kontrol edilir:
--       - Orphan VARSA → migration AÇIKÇA FAIL eder (RAISE EXCEPTION) ve sayısını +
--         nasıl inceleneceğini bildirir. Transaction geri alınır; hiçbir değişiklik
--         kalıcı olmaz. Operatör önce veriyi bilinçli düzeltmelidir.
--       - Orphan YOKSA → guarded/idempotent FK eklenir.
--
-- ORPHAN ÇIKARSA MANUEL İNCELEME (production'da bilinçli karar; migration yapmaz):
--   -- Etkilenen raporları görüntüle:
--   select r.id, r.client_id, r.title, r.created_at
--     from public.human_design_reports r
--    where r.client_id is not null
--      and not exists (select 1 from public.human_design_clients c where c.id = r.client_id);
--   -- Operatör kararına göre (silinen danışana ait) işaretçiler bilinçli NULL'lanabilir.
--
-- ROLLBACK:
--   alter table public.human_design_reports drop constraint if exists fk_hd_reports_client;
--
-- NOT: Bu dosyanın repo'da olması PROD'a UYGULANDIĞI anlamına GELMEZ.
-- =============================================================================

begin;

do $$
declare
  orphan_count integer := 0;
begin
  -- 1) FAIL-CLOSED PREFLIGHT KONTROLÜ: var olmayan bir danışana işaret eden
  --    (dangling) client_id sayısını hesapla. HİÇBİR SATIR DEĞİŞTİRİLMEZ.
  select count(*)
    into orphan_count
    from public.human_design_reports r
   where r.client_id is not null
     and not exists (
       select 1 from public.human_design_clients c where c.id = r.client_id
     );

  if orphan_count > 0 then
    -- Orphan var → GÜVENLİ DURUŞ. Otomatik NULL YOK; FK EKLENMEZ; transaction rollback.
    raise exception using
      errcode = 'raise_exception',
      message = format(
        'HD-P2-B DURDURULDU: %s adet human_design_reports.client_id var olmayan bir danışana işaret ediyor (dangling).',
        orphan_count
      ),
      detail  = 'Sessiz veri ilişkisi kaybını önlemek için migration fail-closed durdu. Hiçbir satır değiştirilmedi/silinmedi ve FK eklenmedi.',
      hint    = 'Önce dosya başındaki SELECT ile etkilenen raporları inceleyin ve orphan client_id değerlerini bilinçli düzeltin; ardından migration''ı yeniden çalıştırın.';
  end if;

  -- 2) Orphan YOK → FK'i guarded ekle (zaten varsa dokunma → idempotent).
  if not exists (
    select 1
      from pg_constraint
     where conname = 'fk_hd_reports_client'
       and conrelid = 'public.human_design_reports'::regclass
  ) then
    alter table public.human_design_reports
      add constraint fk_hd_reports_client
      foreign key (client_id)
      references public.human_design_clients(id)
      on delete set null;
    raise notice 'HD-P2-B: orphan yok — fk_hd_reports_client eklendi (ON DELETE SET NULL).';
  else
    raise notice 'HD-P2-B: fk_hd_reports_client zaten mevcut — atlandı.';
  end if;
end $$;

commit;
