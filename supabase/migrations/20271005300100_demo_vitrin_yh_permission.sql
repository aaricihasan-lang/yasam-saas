-- ============================================================================
-- DEMO VİTRİN — Yaşam Hafızası izni (YALNIZ uzman@test.com demo hesabı)
--
-- Ürün kararı (2026-10-03): Yaşam Hafızası demo vitrinde GÖSTERİLİR. Demo hesap gerçek YH
-- indeksine/pipeline'ına BAĞLANMAZ; arama yanıtı sunucuda sentetik fixture'dan üretilir
-- (lib/demo/demoYasamHafizasi.ts). Bu migration yalnız merkezî izin bayrağını açar →
-- ana hub kartı, /yasam-hafizasi route'u ve danışan detayındaki YH sekmesi görünür olur.
--
-- KAPSAM: tenant 40f842a0-e3e8-448c-8971-9a938e1faccb + is_demo_account=true +
-- email=uzman@test.com olan TEK satır. Diğer izinler KORUNUR (jsonb birleştirme).
-- yasam_hafizasi_flags / yh_source_activation / index tablolarına DOKUNULMAZ.
-- İDEMPOTENT: izin zaten true ise satır değişmez.
-- ============================================================================
BEGIN;

DO $demo_yh_guard$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.users
   WHERE tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid
     AND is_demo_account IS TRUE
     AND lower(btrim(email)) = 'uzman@test.com';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'demo vitrin YH izni: beklenen 1 demo kullanıcı, bulunan %', v_count;
  END IF;
END
$demo_yh_guard$;

UPDATE public.users
   SET module_permissions = coalesce(module_permissions, '{}'::jsonb) || '{"yasam_hafizasi": true}'::jsonb
 WHERE tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid
   AND is_demo_account IS TRUE
   AND lower(btrim(email)) = 'uzman@test.com'
   AND coalesce(module_permissions ->> 'yasam_hafizasi', 'false') <> 'true';

COMMIT;
