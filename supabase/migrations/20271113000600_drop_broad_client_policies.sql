-- =============================================================================
-- 20271113000600_drop_broad_client_policies.sql
--
-- MI-P08 (AŞAMA 1, owner: YAPALIM) — üç tablodaki koşulsuz (USING true) istemci
-- politikalarını kaldırır: client_homeworks, client_stone_photos, tenants.
--
-- KANIT (Frankfurt prod, salt-okunur 2026-10-20):
--   client_homeworks    : ALL    TO PUBLIC  USING true  WITH CHECK true
--   client_stone_photos : ALL    TO PUBLIC  USING true  WITH CHECK true
--   tenants             : SELECT TO anon    USING true
--   Üç tabloda anon/authenticated SELECT/INSERT/UPDATE/DELETE GRANT'i = false
--   (20260625000000 REVOKE ALL) → bugün istemci erişimi YOK. Risk: ileride yanlışlıkla
--   verilecek tek bir GRANT, bu politikalar yüzünden tüm tenant'ların verisini açar.
--
-- NEDEN "DARALTMA" DEĞİL "KALDIRMA": Uygulama Supabase Auth/JWT kullanmıyor; tüm erişim
--   sunucuda service_role ile (BYPASSRLS) yapılıyor ve tenant izolasyonu sunucu kodunda.
--   İstemci rolü için anlamlı bir tenant koşulu (auth.uid / JWT claim) yazılamaz. RLS AÇIK
--   ve politikasız tablo, istemci rolleri için "hepsini reddet" demektir — en dar politika budur.
--
-- HEDEFLEME: Prod politika ADLARI repoda yok (politikalar migration dışı/eski). Bu yüzden ad
--   yerine ÖZELLİĞE göre seçilir: yalnız bu üç tabloda, rolleri PUBLIC/anon/authenticated
--   içeren VE USING ifadesi düz `true` olan (INSERT için WITH CHECK `true`) politikalar.
--   Koşullu (dar) politikalar ve service_role politikaları DOKUNULMAZ.
--
-- NE YAPMAZ: GRANT/REVOKE, RLS kapatma/açma, tablo/veri değişikliği yok. Sunucu (service_role)
--   davranışı değişmez. Tablo yoksa atlanır (taze ortam).
-- İDEMPOTENT: ikinci çalıştırmada eşleşen politika kalmaz → no-op.
--
-- GERİ DÖNÜŞ (önerilmez): NOTICE çıktısındaki ad/komut/rol ile CREATE POLICY … USING (true).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  r record;
  v_n int := 0;
BEGIN
  FOR r IN
    SELECT p.schemaname, p.tablename, p.policyname, p.cmd, p.roles
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND p.tablename IN ('client_homeworks', 'client_stone_photos', 'tenants')
       AND p.roles && ARRAY['public', 'anon', 'authenticated']::name[]
       AND (
             (p.qual IS NOT NULL AND btrim(p.qual) IN ('true', '(true)'))
          OR (p.qual IS NULL AND p.with_check IS NOT NULL AND btrim(p.with_check) IN ('true', '(true)'))
           )
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    v_n := v_n + 1;
    RAISE NOTICE 'MI-P08: kaldırıldı % . % "%" (% TO %)', r.schemaname, r.tablename, r.policyname, r.cmd, r.roles;
  END LOOP;

  -- Bilgi: RLS bayrağı değiştirilmez; kapalıysa uyarı verilir (prod'da 250/250 açık).
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname IN ('client_homeworks', 'client_stone_photos', 'tenants')
       AND NOT c.relrowsecurity
  LOOP
    RAISE WARNING 'MI-P08: public.% üzerinde RLS KAPALI — ayrıca incelenmeli (bu migration değiştirmez)', r.relname;
  END LOOP;

  RAISE NOTICE 'MI-P08: % geniş istemci politikası kaldırıldı', v_n;
END $$;

COMMIT;
