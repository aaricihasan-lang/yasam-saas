-- =============================================================================
-- 20271120001300_yh_document_sources_origin_unique.sql
--
-- SATIŞ ÖNCESİ AŞAMA 1 — YH-02 (owner kararı: YAPALIM): aynı işin (origin_job_ref) iki kez
-- Yaşam Hafızası kaynağına yükseltilmesine karşı GERÇEK (atomik) güvence.
--
-- ⚠️ PRODUCTION'A UYGULANMADI. Apply ayrı owner onayıyla (Dashboard SQL Editor).
--
-- SORUN: `documents/promote` uygulama katmanında önce "aktif kaynak var mı" diye bakıyor; iki eşzamanlı
--   istek ikisi de "yok" görüp iki kaynak + iki passage seti üretebilir (ön kontrol yarışı).
-- ÇÖZÜM: (tenant_id, origin_job_ref) için yalnız AKTİF ve origin_job_ref dolu satırlarda KISMİ UNIQUE
--   indeks. İkinci eşzamanlı INSERT 23505 alır; route bu durumda mevcut kaynağı `duplicate:true` döner.
--   Arşivlenmiş (status='archived') kaynaklar indekse girmez → yeniden yükseltme mümkün kalır.
--
-- ÖN KONTROL (veri değiştirilmez): mevcut aktif mükerrer varsa migration AÇIK HATAYLA durur; mükerrerler
--   owner tarafından incelenip (biri arşivlenerek) çözülmeden indeks kurulmaz. Otomatik silme/arşivleme YOK.
-- KİLİT: CREATE INDEX (CONCURRENTLY değil; transaction içinde) yh_document_sources üzerinde yazmaları
--   indeks süresince bekletir. Tablo küçüktür (promote ucu UI'da kullanılmıyor) → milisaniyeler.
-- TENANT/RLS: RLS ve yetkiler değişmez; yalnız indeks eklenir.
-- VERİ KAYBI: YOK. İDEMPOTENT: CREATE UNIQUE INDEX IF NOT EXISTS.
-- ROLLBACK: DROP INDEX IF EXISTS public.yhds_tenant_origin_active_uq;  (route ön kontrolü yine çalışır)
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_dups integer;
BEGIN
  IF to_regclass('public.yh_document_sources') IS NULL THEN
    RAISE EXCEPTION 'YH-02 ön koşul: public.yh_document_sources yok (20260925000000 uygulanmamış)';
  END IF;
  SELECT count(*) INTO v_dups FROM (
    SELECT tenant_id, origin_job_ref
      FROM public.yh_document_sources
     WHERE status = 'active' AND origin_job_ref IS NOT NULL
     GROUP BY 1, 2
    HAVING count(*) > 1
  ) d;
  IF v_dups > 0 THEN
    RAISE EXCEPTION 'YH-02: % adet aktif mükerrer (tenant_id, origin_job_ref) var; indeks kurulmadı, veri değiştirilmedi. Önce mükerrerleri inceleyin.', v_dups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS yhds_tenant_origin_active_uq
  ON public.yh_document_sources (tenant_id, origin_job_ref)
  WHERE status = 'active' AND origin_job_ref IS NOT NULL;

COMMIT;
