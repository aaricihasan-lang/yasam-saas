-- =============================================================================
-- 20271011000000_client_charges_payment_status.sql
--
-- feat(danisan-yolculugu): ücret kaydına ÖDEME DURUMU (WT7)
--
-- AMAÇ:
--   Uzman her ücret kaydı için "Ödendi" / "Ödenmedi" işaretleyebilsin; danışan listesinde
--   ödenmemiş ücreti olan danışan küçük kırmızı "Ücret Alınmadı" rozetiyle görünsün.
--
-- EKLENENLER:
--   - client_charges.payment_status text NULL
--       'paid'   → Ödendi
--       'unpaid' → Ödenmedi
--       NULL     → Belirtilmemiş (WT7 öncesi eski kayıtlar)
--   - CHECK (payment_status IS NULL OR payment_status IN ('paid','unpaid'))
--   - Kısmi index (tenant_id, client_id) WHERE payment_status = 'unpaid'
--       → liste rozeti sorgusu (yalnız ödenmemiş satırlar) N+1'siz ve küçük.
--
-- GERİYE UYUM:
--   - Kolon NULLABLE ve DEFAULT YOK → mevcut satırlar NULL kalır (Belirtilmemiş).
--     Eski kayıtlar için "Ödendi/Ödenmedi" TAHMİNİ YAPILMAZ; backfill YOK.
--   - NULL rozet üretmez (yalnız 'unpaid' sayılır).
--   - Yeni kayıtta seçim zorunluluğu API'de (POST) uygulanır; DB'de zorunlu değil
--     (eski istemci/seed/backup-restore satırları kırılmaz).
--   - RLS/grant DEĞİŞMEZ (tablo zaten varsayılan-deny + service_role API).
--
-- DEPLOY SIRASI:
--   1) Bu migration (additive) → 2) uygulama deploy. Eski uygulama kolonu bilmez,
--      select("*") fazladan alanı yok sayar → ters sırada da kırılmaz.
--
-- ROLLBACK (gerekirse; veri kaybı yalnız ödeme durumu bilgisi):
--   BEGIN;
--   DROP INDEX IF EXISTS public.client_charges_unpaid_idx;
--   ALTER TABLE public.client_charges DROP CONSTRAINT IF EXISTS client_charges_payment_status_check;
--   ALTER TABLE public.client_charges DROP COLUMN IF EXISTS payment_status;
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- =============================================================================

BEGIN;

ALTER TABLE public.client_charges
  ADD COLUMN IF NOT EXISTS payment_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_charges_payment_status_check'
      AND conrelid = 'public.client_charges'::regclass
  ) THEN
    ALTER TABLE public.client_charges
      ADD CONSTRAINT client_charges_payment_status_check
      CHECK (payment_status IS NULL OR payment_status IN ('paid', 'unpaid'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS client_charges_unpaid_idx
  ON public.client_charges (tenant_id, client_id)
  WHERE payment_status = 'unpaid';

COMMENT ON COLUMN public.client_charges.payment_status IS
  'WT7 ödeme durumu: paid=Ödendi, unpaid=Ödenmedi, NULL=Belirtilmemiş (eski kayıt; tahmin yapılmaz).';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- DOĞRULAMA (salt-okuma)
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='client_charges' AND column_name='payment_status';
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname='client_charges_payment_status_check';
--   SELECT indexdef FROM pg_indexes WHERE indexname='client_charges_unpaid_idx';
--   SELECT payment_status, count(*) FROM public.client_charges GROUP BY 1;  -- beklenen: yalnız NULL
--   SELECT relrowsecurity FROM pg_class WHERE oid='public.client_charges'::regclass;  -- true
-- =============================================================================
