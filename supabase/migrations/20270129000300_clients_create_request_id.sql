-- =============================================================================
-- 20270129000300_clients_create_request_id.sql
--
-- feat(danisan-yolculugu): danışan oluşturma idempotency (çift kayıt koruması) — DY-A
--
-- AMAÇ:
--   Kayıt formu her form denemesi için bir request_id (uuid) üretir; çift tık / ağ
--   tekrarı aynı id'yi gönderir. POST /api/clients bunu clients.create_request_id'ye
--   yazar; (tenant_id, create_request_id) kısmi UNIQUE index'i ikinci insert'i 23505
--   ile reddeder ve route mevcut kaydı `idempotent_replay: true` ile döndürür.
--   Kolon istemci tarafından doğrudan yazılamaz (route sanitize eder).
--
-- PRECONDITION:
--   - public.clients VAR olmalı (yoksa RAISE EXCEPTION — migration durur).
--   - (tenant_id, create_request_id) üzerinde NULL olmayan duplicate OLMAMALI
--     (yeni kolon → normalde 0; önceden kısmen uygulanmışsa kontrol edilir).
--     Duplicate varsa RAISE EXCEPTION — VERİ SİLİNMEZ/DEĞİŞTİRİLMEZ.
--
-- PRODUCTION'A UYGULANMADI. (Yalnız dosya hazırlandı.)
-- VERİ-YIKICI MI: HAYIR. Yalnız nullable kolon + kısmi unique index (mevcut satırlar NULL).
-- APPLY SIRASI: Kodla aynı deploy (kod kolon yoksa geriye uyumlu: PGRST204 → idempotency'siz insert).
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.clients_tenant_create_request_id_key;
--   ALTER TABLE public.clients DROP COLUMN IF EXISTS create_request_id;
-- İDEMPOTENT: ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'precondition: public.clients tablosu yok — migration durduruldu';
  END IF;
END $$;

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS create_request_id uuid;

DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count
  FROM (
    SELECT tenant_id, create_request_id
    FROM public.clients
    WHERE create_request_id IS NOT NULL
    GROUP BY tenant_id, create_request_id
    HAVING count(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'precondition: clients.create_request_id için % duplicate grup var — veri silinmez, elle incelenmeli', dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_create_request_id_key
  ON public.clients (tenant_id, create_request_id)
  WHERE create_request_id IS NOT NULL;

COMMENT ON COLUMN public.clients.create_request_id IS
  'Danışan oluşturma idempotency anahtarı (DY-A). Yalnız POST /api/clients sunucusu yazar; istemci doğrudan yazamaz.';

COMMIT;

NOTIFY pgrst, 'reload schema';
