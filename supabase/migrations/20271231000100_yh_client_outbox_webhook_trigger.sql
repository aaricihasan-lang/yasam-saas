-- =============================================================================
-- 20271231000100_yh_client_outbox_webhook_trigger.sql
-- M6 (DY canlı denetim 2026-11-04/05) — Danışan Yaşam Hafızası outbox'ı için olay tetikleyicisi
-- =============================================================================
--
-- SORUN (canlıda salt-okunur doğrulandı, 2026-11-05):
--   Event-driven tasarımda (24dacfab) outbox satırı → DB webhook → /api/internal/yh/outbox-webhook
--   → inngest.send → worker HEMEN uyanır. WT3.1 (20271010000000) bu webhook'u Vault okuyan
--   public.yh_outbox_webhook_notify() fonksiyonuna taşıdı ama tetikleyiciyi YALNIZ
--   public.yasam_hafizasi_outbox (profesyonel) üzerine kurdu. public.yasam_hafizasi_client_outbox
--   üzerinde webhook tetikleyicisi YOK (supabase_functions.hooks'ta da yok) → danışan kayıtları
--   yalnız 15 dakikalık safety cron ile indekslenir (canlı: işlenme dakikaları %100 :00/:15/:30/:45).
--
-- ÇÖZÜM (en dar): VAR OLAN public.yh_outbox_webhook_notify() fonksiyonu client outbox'a da bağlanır.
--   - Yeni fonksiyon / ikinci webhook mekanizması / secret YOK (secret + URL Vault'tan, çalışma anında).
--   - Fonksiyon tablo adını TG_TABLE_NAME ile gönderir; route + decideWebhookAction client tablosunu
--     zaten tanır (YH_CLIENT_OUTBOX_TABLE → YH_CLIENT_OUTBOX_ENQUEUED_EVENT). Uygulama kodu değişmez.
--   - Profesyonel tetikleyici (yh_professional_outbox) ile BİREBİR aynı kalıp: AFTER INSERT OR UPDATE.
--     Worker geçişleri (claim/complete) event_version artırmaz → route "noop" (loop koruması mevcut).
--   - Best-effort: fonksiyon hataları yutar (WARNING); outbox/kaynak yazımı ASLA bloklanmaz.
--     Event kaçarsa 15 dk safety cron kurtarır (değişmedi).
--
-- İDEMPOTENT: DROP TRIGGER IF EXISTS + CREATE → kaç kez uygulanırsa uygulansın TEK tetikleyici.
-- VERİ: hiçbir satır okunmaz/yazılmaz/silinmez. Yetki/RLS/GRANT değişmez.
-- ÖN KOŞUL YOKSA ATLANIR: client outbox tablosu veya bildirim fonksiyonu yoksa NOTICE ile çıkar.
--
-- GERİ ALMA: DROP TRIGGER IF EXISTS yh_client_outbox_webhook ON public.yasam_hafizasi_client_outbox;
--   (davranış eski hâline döner: yalnız safety cron.)
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.yasam_hafizasi_client_outbox') IS NULL
     OR to_regprocedure('public.yh_outbox_webhook_notify()') IS NULL THEN
    RAISE NOTICE 'M6: client outbox veya yh_outbox_webhook_notify() yok — tetikleyici adimi atlandi';
    RETURN;
  END IF;

  DROP TRIGGER IF EXISTS yh_client_outbox_webhook ON public.yasam_hafizasi_client_outbox;
  CREATE TRIGGER yh_client_outbox_webhook
    AFTER INSERT OR UPDATE ON public.yasam_hafizasi_client_outbox
    FOR EACH ROW EXECUTE FUNCTION public.yh_outbox_webhook_notify();
END
$$;

COMMIT;
