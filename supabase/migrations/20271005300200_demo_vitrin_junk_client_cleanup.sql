-- ============================================================================
-- DEMO VİTRİN — DEMO-06 çöp test danışanı temizliği ("lgj kgjvn")
--
-- Demo tenant'ında (40f842a0-e3e8-448c-8971-9a938e1faccb) kalan anlamsız test artığı danışan
-- b87c0899-0ec1-4180-87a6-c3e7737e3dca silinir. Sentetik vitrin verisi bunun yerine gelir.
--
-- KİLİTLER (hepsi sağlanmazsa HİÇBİR ŞEY SİLİNMEZ):
--   1) satır TAM bu id + demo tenant'ında,
--   2) ad+soyad (veya legacy name) normalize edilmiş hâli 'lgj kgjvn',
--   3) tenant'taki TÜM kullanıcılar demo hesabı (gerçek uzman verisi olamaz),
--   4) storage.objects içinde bu danışan id'sini taşıyan dosya YOK (yetim dosya bırakılmaz),
--   5) client_id kolonu olan base tablolarda bağlı satırlar NOTICE ile raporlanır; clients'a
--      bağlı tablolar ON DELETE CASCADE ile birlikte silinir (CASCADE olmayan FK varsa
--      transaction hata verir → hiçbir şey silinmez).
-- İDEMPOTENT: satır zaten yoksa no-op.
-- ============================================================================
BEGIN;

DO $demo_junk_cleanup$
DECLARE
  v_client  constant uuid := 'b87c0899-0ec1-4180-87a6-c3e7737e3dca';
  v_tenant  constant uuid := '40f842a0-e3e8-448c-8971-9a938e1faccb';
  v_row     record;
  v_non_demo integer;
  v_objects integer := 0;
  v_tbl     record;
  v_cnt     bigint;
  v_deleted integer;
BEGIN
  SELECT id, tenant_id, ad, soyad, name INTO v_row FROM public.clients WHERE id = v_client;
  IF NOT FOUND THEN
    RAISE NOTICE 'demo junk cleanup: danışan zaten yok (no-op)';
    RETURN;
  END IF;

  IF v_row.tenant_id IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'demo junk cleanup: danışan demo tenant''ında DEĞİL — durduruldu';
  END IF;

  IF lower(btrim(regexp_replace(coalesce(nullif(btrim(coalesce(v_row.ad, '') || ' ' || coalesce(v_row.soyad, '')), ''), v_row.name, ''), '\s+', ' ', 'g'))) <> 'lgj kgjvn' THEN
    RAISE EXCEPTION 'demo junk cleanup: ad/soyad beklenen test artığı değil — durduruldu';
  END IF;

  SELECT count(*) INTO v_non_demo FROM public.users
   WHERE tenant_id = v_tenant AND coalesce(is_demo_account, false) = false;
  IF v_non_demo > 0 THEN
    RAISE EXCEPTION 'demo junk cleanup: tenant demo-olmayan kullanıcı içeriyor (%) — durduruldu', v_non_demo;
  END IF;

  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM storage.objects WHERE name LIKE $1' INTO v_objects USING '%' || v_client::text || '%';
    IF v_objects > 0 THEN
      RAISE EXCEPTION 'demo junk cleanup: danışana bağlı % storage nesnesi var — durduruldu (önce dosyalar)', v_objects;
    END IF;
  END IF;

  FOR v_tbl IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
     WHERE c.table_schema = 'public' AND c.column_name = 'client_id' AND c.table_name <> 'clients'
     ORDER BY c.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE client_id::text = $1', v_tbl.table_name) INTO v_cnt USING v_client::text;
    IF v_cnt > 0 THEN
      RAISE NOTICE 'demo junk cleanup: % tablosunda % bağlı satır (CASCADE ile silinecek)', v_tbl.table_name, v_cnt;
    END IF;
  END LOOP;

  DELETE FROM public.clients WHERE id = v_client AND tenant_id = v_tenant;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN
    RAISE EXCEPTION 'demo junk cleanup: beklenen 1 satır, silinen %', v_deleted;
  END IF;
  RAISE NOTICE 'demo junk cleanup: danışan silindi';
END
$demo_junk_cleanup$;

COMMIT;
