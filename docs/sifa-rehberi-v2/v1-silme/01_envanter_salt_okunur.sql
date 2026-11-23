-- =============================================================================
-- Şifa Rehberi V1 — SİLME ÖNCESİ ENVANTER (12. aşama) · YALNIZ OKUMA
--   Owner kararı 22.11.2026: V1 kayıtları V2'ye AKTARILMAYACAK; admin + bütün uzman hesaplarındaki V1
--   Şifa Rehberi kayıtları (test verisi) silinecek. Bu dosya SİLMEZ; yalnız sayar.
--   Çalıştırma: Supabase SQL Editor (production) — Owner. Ad / e-posta / içerik ÇEKMEZ (yalnız kimlik + sayım).
--   Tek işlem, BEGIN READ ONLY → hiçbir yazma mümkün değil; sonunda ROLLBACK.
-- =============================================================================
BEGIN READ ONLY;

-- 1) V1 tabloları — toplamlar
SELECT 'healing_guides' AS tablo, count(*) AS satir FROM public.healing_guides
UNION ALL SELECT 'healing_guide_sections', count(*) FROM public.healing_guide_sections
UNION ALL SELECT 'healing_guide_create_idempotency', count(*) FROM public.healing_guide_create_idempotency;

-- 2) Tenant bazında V1 kayıtları + görsel referansları + o tenant'taki hesap türleri (V1 tenant bazlıdır;
--    kişi sahipliği YOKTUR → "her uzman hesabı" = o uzmanın tenant'ı)
WITH g AS (
  SELECT tenant_id, count(*) AS rehber,
         sum(CASE WHEN jsonb_typeof(images) = 'array' THEN jsonb_array_length(images) ELSE 0 END) AS rehber_gorsel_ref,
         count(*) FILTER (WHERE origin_type = 'admin_transfer') AS admin_aktarimi
  FROM public.healing_guides GROUP BY tenant_id),
s AS (
  SELECT g2.tenant_id, count(*) AS bolum,
         sum(CASE WHEN jsonb_typeof(s.images) = 'array' THEN jsonb_array_length(s.images) ELSE 0 END) AS bolum_gorsel_ref
  FROM public.healing_guide_sections s JOIN public.healing_guides g2 ON g2.id = s.guide_id GROUP BY g2.tenant_id),
u AS (
  SELECT tenant_id,
         count(*) FILTER (WHERE role = 'admin' OR is_super_admin) AS admin_hesap,
         count(*) FILTER (WHERE role = 'expert') AS uzman_hesap,
         bool_or(is_demo_account) AS demo_var
  FROM public.users GROUP BY tenant_id)
SELECT g.tenant_id, g.rehber, coalesce(s.bolum, 0) AS bolum, g.rehber_gorsel_ref, coalesce(s.bolum_gorsel_ref, 0) AS bolum_gorsel_ref,
       g.admin_aktarimi, coalesce(u.admin_hesap, 0) AS admin_hesap, coalesce(u.uzman_hesap, 0) AS uzman_hesap, coalesce(u.demo_var, false) AS demo_var
FROM g LEFT JOIN s USING (tenant_id) LEFT JOIN u USING (tenant_id)
ORDER BY g.rehber DESC;

-- 3) Storage — YALNIZ 'stone-photos' kovasının 'healing-guides/' öneki (kova Danışan Taşları ile PAYLAŞIMLI;
--    diğer önekler kapsam DIŞI)
SELECT split_part(name, '/', 2) AS tenant_klasoru, count(*) AS nesne, sum((metadata->>'size')::bigint) AS bayt
FROM storage.objects
WHERE bucket_id = 'stone-photos' AND name LIKE 'healing-guides/%'
GROUP BY 1 ORDER BY 2 DESC;
SELECT count(*) AS diger_onek_nesne_KAPSAM_DISI
FROM storage.objects WHERE bucket_id = 'stone-photos' AND name NOT LIKE 'healing-guides/%';

-- 4) Yaşam Hafızası — V1 indeks / kuyruk satırları (silmede CDC ile deindex edilecekler)
SELECT source_table, count(*) AS indeks_satiri FROM public.yasam_hafizasi_index
WHERE source_table IN ('healing_guides', 'healing_guide_sections') GROUP BY 1;
SELECT source_key, status, count(*) FROM public.yasam_hafizasi_outbox
WHERE source_key IN ('sifa_rehberi:guides', 'sifa_rehberi:guide-sections') GROUP BY 1, 2;
SELECT source_key, is_active FROM public.yh_source_activation
WHERE source_key IN ('sifa_rehberi:guides', 'sifa_rehberi:guide-sections');
-- Danışan rapor anlık görüntüleri (BAĞIMSIZ YH kaydı → SİLİNMEZ; yalnız sayı, Owner kararı için)
SELECT count(*) AS sifa_kaynakli_anlik_goruntu FROM public.yasam_hafizasi_report_snapshots WHERE source_module = 'sifa_rehberi';

-- 5) V1'e bağlı başka tablo var mı? (FK) — beklenen: yalnız healing_guide_sections + healing_guide_create_idempotency
SELECT c.conrelid::regclass AS bagli_tablo, c.conname, pg_get_constraintdef(c.oid) AS tanim
FROM pg_constraint c WHERE c.contype = 'f' AND c.confrelid IN ('public.healing_guides'::regclass, 'public.healing_guide_sections'::regclass);

-- 6) healing tablolarındaki tetikleyiciler (beklenen: YH CDC tetikleyicileri)
SELECT tgrelid::regclass AS tablo, tgname, tgenabled FROM pg_trigger
WHERE NOT tgisinternal AND tgrelid IN ('public.healing_guides'::regclass, 'public.healing_guide_sections'::regclass);

-- 7) V2 bu projede kurulu mu? (beklenen: hepsi NULL — V2 henüz yayınlanmadı)
SELECT to_regclass('public.sifa_topics') AS sifa_topics, to_regclass('public.sifa_topic_blocks') AS sifa_topic_blocks;

ROLLBACK;
