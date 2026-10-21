-- =============================================================================
-- 20271108000000_inventory_sales_list_visibility.sql
--
-- ÜRÜN & STOK — SATIŞ GEÇMİŞİNDE "LİSTEDEN SİL" (görünürlük / arşiv)   ⚠️ TASLAK
--
-- ⚠️ OWNER ONAYI OLMADAN PRODUCTION'A UYGULANMAZ.
--
-- BAĞLAM:
--   Satış Geçmişi'ndeki "Seçilenleri Sil" butonu gerçekte satış İPTALİ yapıyordu
--   (inventory_sale_cancel_atomic → stok iadesi). Owner kararı (21.10.2026): iki işlem
--   ayrılır:
--     • Satışı İptal Et  → mevcut atomik iptal RPC'si (DEĞİŞMEDİ) — stok iadesi.
--     • Listeden Sil     → satış YALNIZ görünür listeden kaldırılır; stok, satış durumu,
--                          tutarlar ve satır snapshot'ları DEĞİŞMEZ; geri alınabilir.
--   Cihazlar arası tutarlı olması için gizleme sunucuda tutulur → iki kolon.
--
-- DEĞİŞİKLİK (yalnız EK; mevcut satırlara dokunmaz):
--   • inventory_sales.hidden_at  timestamptz NULL  — listeden kaldırılma anı (NULL = görünür)
--   • inventory_sales.hidden_by  uuid        NULL  — kaldıran kullanıcı (denetim izi)
--   • Tutarlılık: ikisi birlikte NULL ya da birlikte dolu.
--   NULL varsayılanlı kolon eklemek PostgreSQL'de yalnız katalog değişikliğidir (tablo
--   yeniden yazılmaz, mevcut kayıtlar görünür kalır).
--
-- GÜVENLİK: tablo zaten RLS ON + anon/authenticated DENY + REVOKE ALL (yalnız service_role,
--   20270123000000_inventory_sales.sql). Yeni kolonlar aynı tablo yetkilerini devralır;
--   ek GRANT / politika YOK. Yazma yalnız sunucu route'undan (tenant oturumdan) yapılır.
--
-- FİNANS: görünürlük finansal anlamı DEĞİŞTİRMEZ. Net ciro/kâr = status = 'completed'
--   (gizli olsun olmasın); iptal edilenler (status = 'cancelled') hariç.
--
-- GERİ ALMA (gerekirse, owner onayıyla):
--   ALTER TABLE public.inventory_sales DROP CONSTRAINT IF EXISTS inventory_sales_hidden_pair_chk;
--   ALTER TABLE public.inventory_sales DROP COLUMN IF EXISTS hidden_by, DROP COLUMN IF EXISTS hidden_at;
--   (Uygulama kodu kolon yokken eski davranışa düşer: liste gizleme filtresiz; "Listeden Sil" 503.)
--
-- IDEMPOTENT: IF NOT EXISTS + koşullu kısıt.
-- =============================================================================

ALTER TABLE public.inventory_sales
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS hidden_by uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'inventory_sales_hidden_pair_chk'
       AND conrelid = 'public.inventory_sales'::regclass
  ) THEN
    ALTER TABLE public.inventory_sales
      ADD CONSTRAINT inventory_sales_hidden_pair_chk
      CHECK ((hidden_at IS NULL) = (hidden_by IS NULL));
  END IF;
END $$;

COMMENT ON COLUMN public.inventory_sales.hidden_at IS
  'Satış Geçmişi görünür listesinden kaldırılma anı (NULL = görünür). Finansal toplamları ve stok iadesini ETKİLEMEZ.';
COMMENT ON COLUMN public.inventory_sales.hidden_by IS
  'Satışı listeden kaldıran kullanıcı (denetim izi).';

-- Değişiklikten sonra PostgREST şema önbelleğini tazele.
NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası):
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_name = 'inventory_sales' AND column_name IN ('hidden_at','hidden_by');  -- 2 satır, YES
--   SELECT count(*) FROM public.inventory_sales WHERE hidden_at IS NOT NULL;               -- 0
--   SELECT has_table_privilege('anon','public.inventory_sales','SELECT');                 -- false
-- =============================================================================
