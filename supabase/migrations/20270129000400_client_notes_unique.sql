-- =============================================================================
-- 20270129000400_client_notes_unique.sql
--
-- fix(danisan-yolculugu): client_notes (tenant_id, client_id) UNIQUE — DY-A
--
-- AMAÇ:
--   Notlar API'si danışan başına TEK satır varsayar (select → update/insert). UNIQUE
--   olmadan eşzamanlı ilk kayıt iki satır üretebilir; sonraki `.maybeSingle()` okuması
--   hata verir ve notlar "yüklenemedi" durumuna düşer. UNIQUE ile ekleme yarışı 23505
--   verir; route mevcut satırı CAS'lı günceller (lib/danisan/notesPatch.applyNotesPatch).
--
-- PRECONDITION:
--   - public.client_notes VAR olmalı (yoksa RAISE EXCEPTION).
--   - (tenant_id, client_id) duplicate OLMAMALI. Prod gerçeği (2026-09-27): duplicate = 0.
--     Duplicate varsa RAISE EXCEPTION — satırlar SİLİNMEZ/BİRLEŞTİRİLMEZ; elle incelenir.
--
-- PRODUCTION'A UYGULANMADI. (Yalnız dosya hazırlandı.)
-- VERİ-YIKICI MI: HAYIR. Yalnız constraint ekler.
-- APPLY SIRASI: Kodla aynı deploy (önce migration önerilir; kod UNIQUE yokken de çalışır).
-- ROLLBACK:
--   ALTER TABLE public.client_notes DROP CONSTRAINT IF EXISTS client_notes_tenant_client_key;
-- İDEMPOTENT: pg_constraint kontrolü.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.client_notes') IS NULL THEN
    RAISE EXCEPTION 'precondition: public.client_notes tablosu yok — migration durduruldu';
  END IF;
END $$;

DO $$
DECLARE
  dup_count integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.client_notes'::regclass
      AND conname = 'client_notes_tenant_client_key'
  ) THEN
    RETURN; -- zaten uygulanmış
  END IF;

  SELECT count(*) INTO dup_count
  FROM (
    SELECT tenant_id, client_id
    FROM public.client_notes
    GROUP BY tenant_id, client_id
    HAVING count(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'precondition: client_notes içinde % duplicate (tenant_id, client_id) grubu var — veri silinmez, elle birleştirilmeli', dup_count;
  END IF;

  ALTER TABLE public.client_notes
    ADD CONSTRAINT client_notes_tenant_client_key UNIQUE (tenant_id, client_id);
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
