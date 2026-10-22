-- =============================================================================
-- 20271113000500_revoke_client_truncate_references.sql
--
-- SEC-NEW-03a (AŞAMA 1, owner: YAPALIM) — Numeroloji HARİÇ 12 public tablodan istemci
-- rollerinin (anon / authenticated / PUBLIC) gereksiz TRUNCATE, REFERENCES, TRIGGER
-- (ve PostgreSQL 17+ ise MAINTAIN) yetkilerini kaldırır.
--
-- KANIT (Frankfurt prod, salt-okunur 2026-10-20): 13 tabloda anon + authenticated için
--   TRUNCATE ve REFERENCES doğrulandı. TRUNCATE satır güvenliğine (RLS) tabi değildir.
--   İstemcinin bu yetkiyi kullanabildiği bir yol GÖSTERİLMEDİ (PostgREST/GraphQL TRUNCATE
--   sunmaz; istemciye açık 75 fonksiyonda TRUNCATE/EXECUTE metni 0/75) — savunma derinliği.
--
-- KAPSAM (kesin liste; 12 tablo):
--   bio_imaginations, chakra_notes, client_gifts, client_photos, client_tasks, energy_bodies,
--   healing_guide_sections, module_records, stone_combinations, subconscious_causes,
--   symbols_view, user_location_prefs
--
-- KAPSAM DIŞI (bilinçli):
--   * demo_numerology_ip_usage — NUMEROLOJİ. Owner'ın ikinci ve ayrı uygulama onayı gerekir.
--     Bu dosya o tabloya HİÇBİR koşulda dokunmaz (aşağıdaki savunma kontrolüne bakın).
--   * SELECT / INSERT / UPDATE / DELETE (CRUD) yetkileri DEĞİŞMEZ (ayrı karar; RLS açık).
--   * service_role, postgres ve diğer sunucu rolleri DEĞİŞMEZ (yedekleme/geri yükleme ve
--     uygulama sunucusu service_role kullanır: lib/backup/registry.ts).
--   * RLS kapatılmaz, tablo/veri silinmez, veri taşınmaz.
--
-- YENİ ORTAM UYUMU: 11 tablo repoda migration ile oluşturulmuyor (prod'da migration dışı
--   doğmuş). Var olmayan tablo atlanır (to_regclass) → taze ortamda migration hatasız biter.
-- İDEMPOTENT: REVOKE olmayan yetkide no-op'tur.
--
-- GERİ DÖNÜŞ (önerilmez): GRANT TRUNCATE, REFERENCES, TRIGGER ON public.<tablo> TO anon, authenticated;
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_tables constant text[] := ARRAY[
    'bio_imaginations', 'chakra_notes', 'client_gifts', 'client_photos', 'client_tasks',
    'energy_bodies', 'healing_guide_sections', 'module_records', 'stone_combinations',
    'subconscious_causes', 'symbols_view', 'user_location_prefs'
  ];
  v_privs text := 'TRUNCATE, REFERENCES, TRIGGER';
  v_t text;
  v_done int := 0;
  v_skip int := 0;
BEGIN
  -- Savunma: Numeroloji tablosu listeye asla girmemeli.
  IF 'demo_numerology_ip_usage' = ANY (v_tables) THEN
    RAISE EXCEPTION 'SEC-NEW-03a: Numeroloji tablosu kapsam dışıdır (ikinci owner onayı gerekli)';
  END IF;

  IF current_setting('server_version_num')::int >= 170000 THEN
    v_privs := v_privs || ', MAINTAIN';
  END IF;

  FOREACH v_t IN ARRAY v_tables LOOP
    IF to_regclass(format('public.%I', v_t)) IS NULL THEN
      v_skip := v_skip + 1;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE %s ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_privs, v_t);
    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE 'SEC-NEW-03a: % tabloda istemci TRUNCATE/REFERENCES/TRIGGER kaldırıldı, % tablo bu ortamda yok (atlandı)', v_done, v_skip;
END $$;

COMMIT;
