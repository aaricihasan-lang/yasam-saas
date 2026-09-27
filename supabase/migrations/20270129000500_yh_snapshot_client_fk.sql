-- =============================================================================
-- 20270129000500_yh_snapshot_client_fk.sql
--
-- fix(kvkk/yasam-hafizasi): rapor snapshot'ları danışanla birlikte silinir — DY-A
--
-- AMAÇ (KVKK — silme hakkı):
--   20260923000000_yasam_hafizasi_client_memory_core.sql başlığında
--   "client silinmesi de snapshot'ı cascade ETMEZ; teslim geçmişi bağımsızdır" deniyordu.
--   Bu karar DEĞİŞTİ: snapshot'lar danışanın seçili metin kopyalarını (selected_text,
--   expert_note, evidence) içerir; danışan silindiğinde KALMAMALIDIR. Artık
--   yasam_hafizasi_report_snapshots(tenant_id, client_id) → clients(tenant_id, id)
--   ON DELETE CASCADE. (Kaynak satıra FK yine YOK: kaynak kayıt silinince snapshot
--   kalır — bu yalnız danışan silmesi için geçerlidir.)
--   Danışan silme route'u (cascade-delete) tek clients DELETE yaptığından ek kod gerekmez.
--
-- PRECONDITION:
--   - public.clients ve public.yasam_hafizasi_report_snapshots VAR olmalı.
--   - clients üzerinde (tenant_id, id) UNIQUE (clients_tenant_id_id_key) VAR olmalı.
--   - Yetim snapshot (danışanı olmayan) OLMAMALI. Prod gerçeği (2026-09-27): tablo 0 satır.
--     Yetim varsa RAISE EXCEPTION — yetim temizliği bu dosyada YAPILMAZ (veri silinmez).
--
-- PRODUCTION'A UYGULANMADI. (Yalnız dosya hazırlandı.)
-- VERİ-YIKICI MI: Uygulama anında HAYIR (yalnız FK ekler). Sonrasında danışan silmesi
--   bağlı snapshot'ları da siler (amaçlanan davranış).
-- APPLY SIRASI: Koddan bağımsız; delete-preview "memorySnapshots" sayımı ile aynı deploy önerilir.
-- ROLLBACK:
--   ALTER TABLE public.yasam_hafizasi_report_snapshots DROP CONSTRAINT IF EXISTS yhrs_client_fk;
-- İDEMPOTENT: pg_constraint kontrolü.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'precondition: public.clients tablosu yok — migration durduruldu';
  END IF;
  IF to_regclass('public.yasam_hafizasi_report_snapshots') IS NULL THEN
    RAISE EXCEPTION 'precondition: public.yasam_hafizasi_report_snapshots tablosu yok — migration durduruldu';
  END IF;
  -- Ad bağımsız: (tenant_id, id) kolonlarını tam kapsayan herhangi bir UNIQUE/PK constraint.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.clients'::regclass
      AND c.contype IN ('u', 'p')
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) = ARRAY['id', 'tenant_id']
  ) THEN
    RAISE EXCEPTION 'precondition: clients(tenant_id, id) UNIQUE (clients_tenant_id_id_key) yok — önce 20260923000000 uygulanmalı';
  END IF;
END $$;

DO $$
DECLARE
  orphan_count integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.yasam_hafizasi_report_snapshots'::regclass
      AND conname = 'yhrs_client_fk'
  ) THEN
    RETURN; -- zaten uygulanmış
  END IF;

  SELECT count(*) INTO orphan_count
  FROM public.yasam_hafizasi_report_snapshots s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.tenant_id = s.tenant_id AND c.id = s.client_id
  );
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'precondition: % yetim yasam_hafizasi_report_snapshots satırı var — veri silinmez, elle incelenmeli', orphan_count;
  END IF;

  ALTER TABLE public.yasam_hafizasi_report_snapshots
    ADD CONSTRAINT yhrs_client_fk
    FOREIGN KEY (tenant_id, client_id)
    REFERENCES public.clients (tenant_id, id)
    ON DELETE CASCADE;
END $$;

COMMENT ON TABLE public.yasam_hafizasi_report_snapshots IS
  'YH rapor teslim snapshot''ları (append-only; UPDATE yasak). Kaynak satıra FK yok (kaynak silinince kalır); '
  'danışan silinince (tenant_id, client_id) → clients ON DELETE CASCADE ile birlikte silinir (KVKK, 20270129000500).';

COMMIT;
