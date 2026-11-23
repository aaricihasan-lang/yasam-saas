-- =============================================================================
-- B · Şifa Rehberi V2 — PRODUCTION YH ŞEMA / FONKSİYON UYUMU (13. aşama) · TEK SONUÇ · YALNIZ METADATA
--   TEK İFADE, TEK SATIR (jsonb). İşlem (transaction) koruması KULLANILMAZ; SALT-OKUNURLUK SORGUNUN YAPISINDAN
--   gelir (yalnız bir SELECT; yalnız yerleşik IMMUTABLE/STABLE fonksiyonlar; DML/DDL/dinamik SQL YOK).
--   Kullanıcı verisi OKUNMAZ. YH fonksiyonları ÇAĞRILMAZ (yalnız pg_proc kataloğu okunur; gövde yalnız md5).
--   ⚠️ Tetikleyici TANIMI (pg_get_triggerdef / tgargs) OKUNMAZ: panelden kurulan Database Webhook tetikleyicisi
--   argümanında webhook sırrını düz metin taşıyabilir → yalnız ad / durum / fonksiyon adı.
--   ⚠️ pg_proc.proconfig DEĞERLERİ ÇIKTIYA YAZILMAZ: yalnız "beklenen search_path mi" (true/false) + ayar ADLARI.
--   Beklenen md5(prosrc) değerleri repo migration'larından (yöntem test projesinde 3/3 doğrulandı).
-- =============================================================================
WITH beklenen(proname, imza, crlf, lf) AS (VALUES
  ('yh_search_candidates', 'p_tsquery text, p_session_tenant uuid, p_allow_shared boolean, p_weights real[], p_limit integer',
     'a600448f9b10833b175a9484440f64cf', '39fc9cb93b20553dfb55d07ff97ea594'),
  ('yh_search_candidates_v2', 'p_tsquery text, p_session_tenant uuid, p_weights real[], p_limit integer, p_modules text[]',
     'd98d6b67841c0f13d08a82eeb4e2cabe', 'c833875528d61cbf57a48cc0f56443f5'),
  ('yh_cdc_enqueue', '', '9b4c8fdbadedf0c4e71dd1c30b0b466f', 'ca1ce00bd3f4d2cd0b720e473d2dbcdf')),
fn AS (
  SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS imza, md5(p.prosrc) AS govde_md5, p.prosecdef, p.provolatile,
         -- Repo tanımı: üç fonksiyon da "SET search_path = public, pg_catalog". Değer metni ÇIKTIYA YAZILMAZ.
         coalesce(p.proconfig = ARRAY['search_path=public, pg_catalog']::text[], false) AS search_path_beklenen,
         coalesce(cardinality(p.proconfig), 0) AS config_ayar_sayisi,
         (SELECT coalesce(array_agg(split_part(c, '=', 1) ORDER BY 1), '{}'::text[]) FROM unnest(p.proconfig) AS c) AS config_ayar_adlari,
         has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
         has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('yh_search_candidates', 'yh_search_candidates_v2', 'yh_search_candidates_v3', 'yh_cdc_enqueue', 'yh_outbox_put_v2', 'yh_outbox_complete_v2'))
SELECT jsonb_build_object(
  'fonksiyon_karsilastirma', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'ad', b.proname, 'imza_eslesti', f.imza = b.imza, 'govde',
        CASE WHEN f.govde_md5 IS NULL THEN 'YOK' WHEN f.govde_md5 = b.crlf THEN 'ESLESTI_CRLF' WHEN f.govde_md5 = b.lf THEN 'ESLESTI_LF' ELSE 'FARKLI' END,
        'govde_md5', f.govde_md5, 'security_definer', f.prosecdef, 'volatility', f.provolatile,
        'search_path_beklenen', f.search_path_beklenen, 'config_ayar_sayisi', f.config_ayar_sayisi, 'config_ayar_adlari', f.config_ayar_adlari,
        'anon_exec', f.anon_exec, 'auth_exec', f.auth_exec, 'svc_exec', f.svc_exec) ORDER BY b.proname), '[]'::jsonb)
      FROM beklenen b LEFT JOIN fn f ON f.proname = b.proname AND f.imza = b.imza),
  'tum_ilgili_fonksiyonlar', (SELECT coalesce(jsonb_agg(jsonb_build_object('ad', proname, 'imza', imza, 'md5', govde_md5) ORDER BY proname, imza), '[]'::jsonb) FROM fn),
  'index_kolonlari', (SELECT jsonb_agg(jsonb_build_object('kolon', column_name, 'tip', data_type, 'null', is_nullable) ORDER BY ordinal_position)
      FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'yasam_hafizasi_index'),
  'index_owner_user_id_var', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'yasam_hafizasi_index' AND column_name = 'owner_user_id'),
  'index_kisitlari', (SELECT jsonb_agg(jsonb_build_object('ad', conname, 'tanim', pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid = 'public.yasam_hafizasi_index'::regclass),
  'index_indeksleri', (SELECT jsonb_agg(jsonb_build_object('ad', indexname, 'tanim', indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'yasam_hafizasi_index'),
  'outbox_kisitlari', (SELECT jsonb_agg(jsonb_build_object('ad', conname, 'tanim', pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid = 'public.yasam_hafizasi_outbox'::regclass),
  'outbox_tetikleyicileri_YALNIZ_AD', (SELECT coalesce(jsonb_agg(jsonb_build_object('ad', tgname, 'durum', tgenabled, 'fonksiyon', tgfoid::regproc::text) ORDER BY tgname), '[]'::jsonb)
      FROM pg_trigger WHERE tgrelid = 'public.yasam_hafizasi_outbox'::regclass AND NOT tgisinternal),
  'aktivasyon', (SELECT jsonb_object_agg(source_key, is_active) FROM public.yh_source_activation),
  'rls_ve_tablo_yetkileri', (SELECT jsonb_agg(jsonb_build_object('tablo', c.relname, 'rls', c.relrowsecurity,
        'anon_select', has_table_privilege('anon', c.oid, 'SELECT'), 'auth_select', has_table_privilege('authenticated', c.oid, 'SELECT'),
        'svc_select', has_table_privilege('service_role', c.oid, 'SELECT'), 'svc_insert', has_table_privilege('service_role', c.oid, 'INSERT')) ORDER BY c.relname)
      FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('yasam_hafizasi_index', 'yasam_hafizasi_outbox', 'yh_source_activation', 'users')),
  'users_kolonlari', (SELECT jsonb_agg(column_name ORDER BY column_name) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('id', 'tenant_id', 'active', 'role', 'is_super_admin', 'is_demo_account')),
  'v2_nesneleri_var_mi', jsonb_build_object('sifa_topics', to_regclass('public.sifa_topics')::text,
      'v3', to_regprocedure('public.yh_search_candidates_v3(text,uuid,uuid,real[],integer,text[])')::text)
) AS yh_uyum;
