-- =============================================================================
-- 20271002000000_client_notes_cas_update_rpc.sql
--
-- DANIŞAN YOLCULUĞU — NOTLAR: URL'SİZ ATOMİK CAS (DY-01 · satış öncesi kapanış)
--
-- SORUN (canlı, 2026-10-02):
--   PATCH /api/clients/[id]/notes, `notlar` için iyimser eşzamanlılığı (CAS) PostgREST
--   filtresiyle yapıyordu: `.eq("notlar", <okunan tam metin>)`. Tam metin URL'e girdiğinden
--   notlar ~8.5K Türkçe karaktere (≈31 KB URL) ulaşınca ağ geçidi isteği reddediyor →
--   o danışanın notları bir daha eklenemiyor / düzenlenemiyor / silinemiyor (500).
--
-- ÇÖZÜM:
--   Koşullu güncellemeyi SQL tarafında yapan dar bir fonksiyon. Not içeriği istek
--   GÖVDESİNDE (JSON) taşınır; karşılaştırma `sha256(notlar)` hex özeti ile yapılır
--   (uygulamadaki `notesVersion()` ile birebir aynı: sha256(utf8(coalesce(notlar,'')))).
--   Satır yalnız id + tenant_id + client_id eşleşir VE (beklenen özet verildiyse) özet
--   tutarsa güncellenir — tek UPDATE ifadesi = atomik CAS. 0 satır → çağıran 409 üretir.
--
--   Yalnız `p_fields` içinde BULUNAN anahtarlar yazılır (notlar / saglik_notu / adres /
--   oneriler); bulunmayan alanlar aynen korunur (DY-A alan-bazlı yazım sözleşmesi).
--
-- GÜVENLİK: SECURITY INVOKER (RLS/grant'lar çağıranın yetkisiyle; yalnız service_role
--   çağırır), search_path = '' (tüm nesneler şema-nitelikli), PUBLIC/anon/authenticated
--   EXECUTE yok. CDC trigger'ı (yh_client_outbox_notes_trg) normal UPDATE gibi tetiklenir.
--
-- VERİ: Şema veya veri DEĞİŞMEZ (yalnız yeni fonksiyon). DROP / TRUNCATE / DELETE /
--   ALTER TABLE YOK. Mevcut satırlar dönüştürülmez.
--
-- GERİYE UYUM: Uygulama kodu fonksiyon bulunamazsa (PGRST202 / 42883) güvenli geri
--   düşüşe geçer (bkz. lib/danisan/notesPatch.ts) → migration ile deploy sırası esnektir.
--
-- ROLLBACK: DROP FUNCTION public.client_notes_cas_update(uuid, uuid, uuid, text, jsonb);
--   (veri etkisi yok; kod otomatik geri düşüşe döner).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.client_notes_cas_update(
  p_tenant_id       uuid,
  p_client_id       uuid,
  p_note_id         uuid,
  p_expected_sha256 text,
  p_fields          jsonb
)
RETURNS SETOF public.client_notes
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.client_notes AS n
     SET notlar      = CASE WHEN p_fields ? 'notlar'      THEN p_fields ->> 'notlar'      ELSE n.notlar      END,
         saglik_notu = CASE WHEN p_fields ? 'saglik_notu' THEN p_fields ->> 'saglik_notu' ELSE n.saglik_notu END,
         adres       = CASE WHEN p_fields ? 'adres'       THEN p_fields ->> 'adres'       ELSE n.adres       END,
         oneriler    = CASE WHEN p_fields ? 'oneriler'    THEN p_fields ->> 'oneriler'    ELSE n.oneriler    END
   WHERE n.id = p_note_id
     AND n.tenant_id = p_tenant_id
     AND n.client_id = p_client_id
     AND (
       p_expected_sha256 IS NULL
       OR pg_catalog.encode(
            pg_catalog.sha256(pg_catalog.convert_to(COALESCE(n.notlar, ''), 'UTF8')),
            'hex'
          ) = p_expected_sha256
     )
  RETURNING n.*;
$$;

REVOKE ALL ON FUNCTION public.client_notes_cas_update(uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_notes_cas_update(uuid, uuid, uuid, text, jsonb) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   SELECT prosecdef, proconfig FROM pg_proc
--    WHERE oid = 'public.client_notes_cas_update(uuid,uuid,uuid,text,jsonb)'::regprocedure;   -- f, {search_path=""}
--   SELECT has_function_privilege('anon','public.client_notes_cas_update(uuid,uuid,uuid,text,jsonb)','EXECUTE');          -- false
--   SELECT has_function_privilege('authenticated','public.client_notes_cas_update(uuid,uuid,uuid,text,jsonb)','EXECUTE'); -- false
--   SELECT has_function_privilege('service_role','public.client_notes_cas_update(uuid,uuid,uuid,text,jsonb)','EXECUTE');  -- true
-- =============================================================================
