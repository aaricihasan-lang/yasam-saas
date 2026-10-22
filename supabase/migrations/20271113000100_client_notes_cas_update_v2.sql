-- =============================================================================
-- 20271113000100_client_notes_cas_update_v2.sql
--
-- DANIŞAN YOLCULUĞU — NOTLAR + GENEL BİLGİ (sağlık notu / adres / öneriler) ZORUNLU ATOMİK CAS
-- (DY-03 · AŞAMA 2)
--
-- SORUN:
--   v1 (client_notes_cas_update) yalnız `notlar` için ve yalnız beklenen özet VERİLDİYSE koşul
--   uyguluyordu (`p_expected_sha256 IS NULL` → koşulsuz). Genel Bilgi formunun yazdığı
--   saglik_notu / adres / oneriler hiç sürüm kontrolüne girmiyordu → iki sekme/cihaz birbirini ezer.
--
-- ÇÖZÜM (yeni fonksiyon; v1'e dokunulmaz):
--   • `notlar` yazılıyorsa p_expected_notes_sha256 ZORUNLU; genel alanlardan biri yazılıyorsa
--     p_expected_general_sha256 ZORUNLU — eksikse istisna (fonksiyon içinden bile atlatılamaz).
--   • Özetler (uygulama lib/danisan/notesPatch.ts ile birebir):
--       notlar  : sha256(utf8(coalesce(notlar,'')))
--       genel   : sha256(utf8(coalesce(saglik_notu,'') || U+001F || coalesce(adres,'') || U+001F || coalesce(oneriler,'')))
--   • Tek UPDATE ifadesi = atomik CAS; 0 satır → çağıran 409 üretir.
--
-- GÜVENLİK: SECURITY INVOKER, search_path = '', yalnız service_role EXECUTE. CDC tetikleyicisi
--   normal UPDATE gibi çalışır. Şema/veri DEĞİŞMEZ.
-- YAYIN SIRASI: ÖNCE bu migration, SONRA uygulama kodu (kod v2 yoksa yazımı 503 ile durdurur;
--   korumasız geri düşüş YOK). v1 eski kod için yerinde kalır; yeni kod v1'i ÇAĞIRMAZ ve v1 yalnız
--   service_role'e açıktır (istemciden erişilemez). Yeni kod yayında doğrulandıktan sonra v1 ayrı
--   bir temizlik migration'ıyla kaldırılabilir.
-- ROLLBACK: DROP FUNCTION public.client_notes_cas_update_v2(uuid, uuid, uuid, text, text, jsonb);
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.client_notes_cas_update_v2(
  p_tenant_id                uuid,
  p_client_id                uuid,
  p_note_id                  uuid,
  p_expected_notes_sha256    text,
  p_expected_general_sha256  text,
  p_fields                   jsonb
)
RETURNS SETOF public.client_notes
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_notes   boolean := p_fields ? 'notlar';
  v_general boolean := (p_fields ? 'saglik_notu') OR (p_fields ? 'adres') OR (p_fields ? 'oneriler');
BEGIN
  IF NOT v_notes AND NOT v_general THEN
    RAISE EXCEPTION 'client_notes_no_fields' USING ERRCODE = '22023';
  END IF;
  IF v_notes AND p_expected_notes_sha256 IS NULL THEN
    RAISE EXCEPTION 'client_notes_version_required' USING ERRCODE = '22023';
  END IF;
  IF v_general AND p_expected_general_sha256 IS NULL THEN
    RAISE EXCEPTION 'client_notes_general_version_required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  UPDATE public.client_notes AS n
     SET notlar      = CASE WHEN p_fields ? 'notlar'      THEN p_fields ->> 'notlar'      ELSE n.notlar      END,
         saglik_notu = CASE WHEN p_fields ? 'saglik_notu' THEN p_fields ->> 'saglik_notu' ELSE n.saglik_notu END,
         adres       = CASE WHEN p_fields ? 'adres'       THEN p_fields ->> 'adres'       ELSE n.adres       END,
         oneriler    = CASE WHEN p_fields ? 'oneriler'    THEN p_fields ->> 'oneriler'    ELSE n.oneriler    END
   WHERE n.id = p_note_id
     AND n.tenant_id = p_tenant_id
     AND n.client_id = p_client_id
     AND (
       NOT v_notes
       OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(n.notlar, ''), 'UTF8')), 'hex')
          = p_expected_notes_sha256
     )
     AND (
       NOT v_general
       OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
            COALESCE(n.saglik_notu, '') || pg_catalog.chr(31) || COALESCE(n.adres, '') || pg_catalog.chr(31) || COALESCE(n.oneriler, ''),
            'UTF8')), 'hex')
          = p_expected_general_sha256
     )
  RETURNING n.*;
END;
$$;

REVOKE ALL ON FUNCTION public.client_notes_cas_update_v2(uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_notes_cas_update_v2(uuid, uuid, uuid, text, text, jsonb) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
