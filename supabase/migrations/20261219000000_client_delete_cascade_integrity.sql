-- =============================================================================
-- 20261219000000_client_delete_cascade_integrity.sql
--
-- Danışan silme ATOMİKLİĞİ (FAZ 2 F5)
--
-- BAĞLAM:
--   Danışan silme (app/api/clients/[id]/cascade-delete) tek `DELETE FROM clients`
--   ifadesine dayanır; child satırlar DB içinde ON DELETE CASCADE ile atomik silinir.
--   Canlı FK denetimi (pg_constraint): 11 child tablo zaten CASCADE'li, ANCAK
--   `client_homeworks` ve `client_analyses` tablolarının clients'a FK'si YOKTU →
--   eski route bunları manuel siliyordu (yarım kalırsa kalıcı YETİM satır + yetim
--   storage). Bu migration iki eksik FK'yi ON DELETE CASCADE olarak ekler.
--
-- ÖN KOŞUL — YETİM TEMİZLİĞİ:
--   FK eklemeden önce parent'ı OLMAYAN satırlar temizlenir; aksi halde ALTER
--   constraint ihlaliyle başarısız olur. Canlı read-only kanıt (2026-08-21):
--     client_homeworks yetim = 2, client_analyses yetim = 1.
--   Silme YALNIZ client_id NOT NULL olup clients'ta karşılığı bulunmayan satırlarda
--   yapılır (NULL client_id FK'yi engellemez → dokunulmaz). Geçerli danışana bağlı
--   HİÇBİR satır etkilenmez.
--
-- ⛔ DOKUNULMAZ: RLS/policy, tenant kuralları, diğer child tablolar, storage,
--    private bucket (20261217000000). Yalnız iki FK + hedefli yetim temizliği.
--
-- ⚠️ DEPLOY SIRASI: Bu migration additive'dir ve MEVCUT (eski) cascade-delete
--    route ile de uyumludur (eski route manuel siler; FK'nin bulunması bunu bozmaz).
--    Bu yüzden GÜVENLİ SIRA: ÖNCE bu migration production'a apply → SONRA yeni kod
--    deploy (yeni route manuel child DELETE'i kaldırıp FK cascade'e dayanır).
--
-- DOĞRULAMA (apply sonrası, read-only — beklenen):
--   SELECT conrelid::regclass, confdeltype FROM pg_constraint
--     WHERE contype='f' AND confrelid='public.clients'::regclass
--       AND conrelid IN ('public.client_homeworks'::regclass,'public.client_analyses'::regclass);
--     -- iki satır, confdeltype='c' (CASCADE)
-- =============================================================================

BEGIN;

-- 1) Yetim temizliği (yalnız parent'ı olmayan, client_id NOT NULL satırlar).
DELETE FROM public.client_homeworks h
 WHERE h.client_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = h.client_id);

DELETE FROM public.client_analyses a
 WHERE a.client_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = a.client_id);

-- 2) client_homeworks → clients(id) ON DELETE CASCADE (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE contype = 'f'
       AND conrelid = 'public.client_homeworks'::regclass
       AND confrelid = 'public.clients'::regclass
  ) THEN
    ALTER TABLE public.client_homeworks
      ADD CONSTRAINT client_homeworks_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3) client_analyses → clients(id) ON DELETE CASCADE (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE contype = 'f'
       AND conrelid = 'public.client_analyses'::regclass
       AND confrelid = 'public.clients'::regclass
  ) THEN
    ALTER TABLE public.client_analyses
      ADD CONSTRAINT client_analyses_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
