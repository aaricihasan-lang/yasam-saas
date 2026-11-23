-- =============================================================================
-- A · Şifa Rehberi V1 — SİLME ÖNCESİ ENVANTER (13. aşama) · TEK SONUÇ · YALNIZ OKUMA
--   TEK İFADE, TEK SATIR (jsonb). İşlem (transaction) koruması KULLANILMAZ ve varmış gibi gösterilmez:
--   SALT-OKUNURLUK SORGUNUN YAPISINDAN gelir — dosyada yalnız bir SELECT var; DML/DDL, dinamik SQL, geçici tablo,
--   kullanıcı tanımlı fonksiyon YOK; çağrılan her fonksiyon PostgreSQL yerleşik IMMUTABLE/STABLE fonksiyonudur
--   (test projesinde pg_proc.provolatile ile doğrulandı). Hata olursa ifade bütünüyle iptal olur (kısmi sonuç yok).
--   Okunanlar: sayılar, tenant kimlikleri, rol sayıları, dosya sayısı/bayt. Ad / e-posta / içerik / dosya adı /
--   sır OKUNMAZ.
-- =============================================================================
WITH
g AS (SELECT id, tenant_id, images, origin_type FROM public.healing_guides),
s AS (SELECT s.id, g.tenant_id, s.images FROM public.healing_guide_sections s JOIN public.healing_guides g ON g.id = s.guide_id),
img AS (   -- V1 görsel referansları → stone-photos içi yol (yalnız sayım için; çıktıya yazılmaz)
  SELECT DISTINCT CASE
      WHEN e ? 'file_path' THEN e->>'file_path'
      WHEN e->>'url' LIKE '%/storage/v1/object/public/stone-photos/%' THEN regexp_replace(e->>'url', '^.*/storage/v1/object/public/stone-photos/', '')
    END AS p
  FROM (SELECT images FROM g UNION ALL SELECT images FROM s) x,
       LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(x.images) = 'array' THEN x.images ELSE '[]'::jsonb END) e),
obj AS (SELECT name, (metadata->>'size')::bigint AS size FROM storage.objects WHERE bucket_id = 'stone-photos' AND name LIKE 'healing-guides/%'),
u AS (SELECT tenant_id, count(*) FILTER (WHERE role = 'admin' OR is_super_admin) AS admin_hesap,
             count(*) FILTER (WHERE role = 'expert') AS uzman_hesap, bool_or(is_demo_account) AS demo
      FROM public.users GROUP BY tenant_id)
SELECT jsonb_build_object(
  'tablolar', jsonb_build_object(
    'healing_guides', (SELECT count(*) FROM public.healing_guides),
    'healing_guide_sections', (SELECT count(*) FROM public.healing_guide_sections),
    'healing_guide_create_idempotency', (SELECT count(*) FROM public.healing_guide_create_idempotency)),
  'tenant_dagilimi', (SELECT coalesce(jsonb_agg(t ORDER BY t.rehber DESC), '[]'::jsonb) FROM (
      SELECT gg.tenant_id, count(DISTINCT gg.id) AS rehber,
             (SELECT count(*) FROM s WHERE s.tenant_id = gg.tenant_id) AS bolum,
             count(DISTINCT gg.id) FILTER (WHERE gg.origin_type = 'admin_transfer') AS admin_aktarimi,
             coalesce(max(u.admin_hesap), 0) AS admin_hesap, coalesce(max(u.uzman_hesap), 0) AS uzman_hesap,
             coalesce(bool_or(u.demo), false) AS demo_hesap_var
      FROM g gg LEFT JOIN u ON u.tenant_id = gg.tenant_id GROUP BY gg.tenant_id) t),
  'storage_healing_guides', jsonb_build_object(
    'nesne', (SELECT count(*) FROM obj), 'bayt', (SELECT coalesce(sum(size), 0) FROM obj),
    'tenant_klasoru', (SELECT coalesce(jsonb_agg(jsonb_build_object('klasor', k, 'nesne', n, 'bayt', b)), '[]'::jsonb)
                       FROM (SELECT split_part(name, '/', 2) AS k, count(*) AS n, sum(size) AS b FROM obj GROUP BY 1) z),
    'referans_toplam', (SELECT count(*) FROM img WHERE p IS NOT NULL),
    'referans_ve_dosya_var', (SELECT count(*) FROM img JOIN obj ON obj.name = img.p),
    'referans_dosya_YOK', (SELECT count(*) FROM img WHERE p IS NOT NULL AND NOT EXISTS (SELECT 1 FROM obj WHERE obj.name = img.p)),
    'referans_healing_guides_DISI', (SELECT count(*) FROM img WHERE p IS NOT NULL AND p NOT LIKE 'healing-guides/%'),
    -- 'sahipsiz_dosya': healing-guides/ altında olup YALNIZ V1 (healing_guides / healing_guide_sections.images)
    -- referanslarında GEÇMEYEN nesne sayısı. Başka bir modülün / kaydın bu nesneyi kullanmadığını KANITLAMAZ;
    -- OTOMATİK SİLME İZNİ DEĞİLDİR (silme yalnız Owner'ın envantere dayalı ayrı onayıyla).
    'sahipsiz_dosya', (SELECT count(*) FROM obj WHERE NOT EXISTS (SELECT 1 FROM img WHERE img.p = obj.name))),
  'storage_stone_photos_diger_onek_KAPSAM_DISI', (SELECT count(*) FROM storage.objects WHERE bucket_id = 'stone-photos' AND name NOT LIKE 'healing-guides/%'),
  'yh_indeks', (SELECT coalesce(jsonb_object_agg(source_table, n), '{}'::jsonb) FROM (
      SELECT source_table, count(*) AS n FROM public.yasam_hafizasi_index WHERE source_table IN ('healing_guides', 'healing_guide_sections') GROUP BY 1) z),
  'yh_outbox', (SELECT coalesce(jsonb_agg(jsonb_build_object('kaynak', source_key, 'durum', status, 'n', n)), '[]'::jsonb) FROM (
      SELECT source_key, status, count(*) AS n FROM public.yasam_hafizasi_outbox WHERE source_key IN ('sifa_rehberi:guides', 'sifa_rehberi:guide-sections') GROUP BY 1, 2) z),
  'yh_aktivasyon', (SELECT coalesce(jsonb_object_agg(source_key, is_active), '{}'::jsonb) FROM public.yh_source_activation WHERE source_key IN ('sifa_rehberi:guides', 'sifa_rehberi:guide-sections')),
  'bagimsiz_danisan_anlik_goruntu_sifa', (SELECT count(*) FROM public.yasam_hafizasi_report_snapshots WHERE source_module = 'sifa_rehberi'),
  'fk_bagli_tablolar', (SELECT coalesce(jsonb_agg(jsonb_build_object('tablo', c.conrelid::regclass::text, 'kisit', c.conname, 'tanim', pg_get_constraintdef(c.oid))), '[]'::jsonb)
      FROM pg_constraint c WHERE c.contype = 'f' AND c.confrelid IN ('public.healing_guides'::regclass, 'public.healing_guide_sections'::regclass)),
  'tetikleyiciler', (SELECT coalesce(jsonb_agg(jsonb_build_object('tablo', t.tgrelid::regclass::text, 'ad', t.tgname, 'durum', t.tgenabled, 'fonksiyon', t.tgfoid::regproc::text)), '[]'::jsonb)
      FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN ('public.healing_guides'::regclass, 'public.healing_guide_sections'::regclass)),
  'diger_modul_sayilari_SILME_ONCESI', jsonb_build_object(
    'users', (SELECT count(*) FROM public.users), 'tenants', (SELECT count(*) FROM public.tenants),
    'clients', (SELECT count(*) FROM public.clients), 'client_stone_photos', (SELECT count(*) FROM public.client_stone_photos),
    'yasam_hafizasi_index_toplam', (SELECT count(*) FROM public.yasam_hafizasi_index)),
  'v2_kurulu', jsonb_build_object('sifa_topics', to_regclass('public.sifa_topics')::text, 'sifa_topic_blocks', to_regclass('public.sifa_topic_blocks')::text)
) AS v1_envanter;
