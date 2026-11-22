-- =============================================================================
-- C · Migration numarası çakışma kontrolü (13. aşama) · TEK SONUÇ · YALNIZ OKUMA
--   TEK İFADE, TEK SATIR. İşlem koruması KULLANILMAZ; SALT-OKUNURLUK SORGUNUN YAPISINDAN gelir (yalnız bir SELECT,
--   yalnız yerleşik IMMUTABLE/STABLE fonksiyonlar). Yalnız `version` kolonu okunur; migration SQL metnini tutan
--   `statements` ve `name` kolonları OKUNMAZ. V2 önekleri: 20280110000000 / 20280110000100 (12. aşama).
-- =============================================================================
SELECT jsonb_build_object(
  'toplam', count(*),
  'en_buyuk_surum', max(version),
  'v2_onekleri_KULLANIMDA', count(*) FILTER (WHERE version IN ('20280110000000', '20280110000100')),
  'surumler_20280103_ve_sonrasi', coalesce(jsonb_agg(version ORDER BY version) FILTER (WHERE version >= '20280103000000'), '[]'::jsonb)
) AS migration_gecmisi
FROM supabase_migrations.schema_migrations;
