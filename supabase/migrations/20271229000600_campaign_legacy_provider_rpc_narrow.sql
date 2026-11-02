-- =============================================================================
-- 20271229000600_campaign_legacy_provider_rpc_narrow.sql
--
-- KAMPANYA MERKEZİ — D-4 (bağımsız güvenlik denetimi, 03.11.2026): eski sağlayıcı kalanı yazan RPC'nin yetkisinin daraltılması.
-- YALNIZ yerel geçici DB'de çalıştırıldı — production'a uygulanması AYRI Owner onayı ister.
-- BAĞIMLILIK: 20271229000100 (fonksiyon) ; B-4 bağlamı için 000300 + 000500.
--
-- BULGU: public.campaign_observe_provider (000100) SECURITY DEFINER'dır ve service_role ile çağrıldığında sağlayıcı kalanını
-- (remaining / observed_at) DOĞRUDAN yazar → 000500'ün fark doğrulama kurallarını (24 sa, iki okuma, ayda yükselmez) atlayabilir.
-- Uygulama kodu bu RPC'yi HİÇ çağırmaz (quotaService.observeProvider kullanılmıyor). anon / authenticated / PUBLIC zaten kapalı.
-- ÇÖZÜM: yalnız service_role EXECUTE yetkisi geri alınır. Fonksiyon SİLİNMEZ, gövdesi DEĞİŞMEZ, veri DEĞİŞMEZ.
-- Geri alma (gerekirse, Owner onayıyla): GRANT EXECUTE ON FUNCTION public.campaign_observe_provider(text, integer, integer,
--   timestamptz, boolean, timestamptz) TO service_role;
--
-- campaign_record_provider_call (000100) kod tarafından kullanılır (her sağlayıcı isteğinin sonucu); yetkisi DARALTILMAZ.
-- Kalan yazma yolu yalnız 'pending' çağrı satırı için ve service_role ile mümkündür; uygulama p_remaining'i HER ZAMAN NULL
-- verir (ham başlık kalanı yazılmaz — testli). Bu yol için ek koruma sunucu sırrı (service_role anahtarı) gizliliğidir.
-- =============================================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION public.campaign_observe_provider(text, integer, integer, timestamptz, boolean, timestamptz) FROM service_role;
REVOKE ALL ON FUNCTION public.campaign_observe_provider(text, integer, integer, timestamptz, boolean, timestamptz) FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
