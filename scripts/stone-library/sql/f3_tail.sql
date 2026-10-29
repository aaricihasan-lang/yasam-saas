-- ─── F3 ayrıcalıkları ────────────────────────────────────────────────────────────────────────────
-- Yeni F3 fonksiyonlarının varsayılan (PUBLIC) yetkisi kaldırılır; yalnız sözleşmedeki 5 RPC service_role'e verilir
-- (toplam 48 = F1 27 + F2 17 + F3 5 − alternatif ad ekleme).
-- İç yardımcılar (health_ok, readiness, tetikleyiciler) hiçbir role açık değil. F1/F2 yetkilerine dokunulmaz.
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname IN ('stone_library_health_ok','stone_library_source_integrity_guard','stone_library_source_name_guard',
               'stone_library_image_binding_guard','stone_library_field_path','stone_library_field_path_guard','stone_library_readiness',
               'stone_library_source_kind_guard','stone_library_external_link_guard','stone_library_integrity','stone_library_facet_raw_key','stone_library_owner_readiness','stone_library_health_decision',
               'stone_library_owner_bulk_review','stone_library_owner_integrity','stone_library_expert_facets') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', fn.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.stone_library_owner_readiness(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_health_decision(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_bulk_review(uuid, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_owner_integrity(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.stone_library_expert_facets(uuid) TO service_role;
-- Owner kararı (F3): alternatif ad bu aşamada EKLENMEZ → ad ekleme RPC'si kapatılır (hiçbir uç / aktarım kullanmıyor).
-- F1'in geri dönüşü / yeniden uygulanması yetkiyi geri verir; ileride owner kararıyla ayrı faz.
REVOKE EXECUTE ON FUNCTION public.stone_library_name_add(uuid, uuid, text, text, text, uuid, uuid) FROM service_role;

-- Var olan yayın belgeleri yeni biçimle (ayrı tıbbi bilgilendirme alanı) yeniden üretilir. Yeni yayın açmaz:
-- yalnız durumu 'published' olan taşlar ve aynı görünürlük kuralları (varsayılan sağlık modu değişmedi).
SELECT public.stone_library_refresh_all();
