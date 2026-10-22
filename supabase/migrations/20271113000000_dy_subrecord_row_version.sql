-- =============================================================================
-- 20271113000000_dy_subrecord_row_version.sql
--
-- DANIŞAN YOLCULUĞU — ALT KAYIT ATOMİK SÜRÜM KONTROLÜ (DY-03 · AŞAMA 2)
--
-- SORUN: client_sessions / client_stones / client_homeworks / client_analyses güncellemeleri
--   koşulsuzdu → aynı kaydı iki sekme/cihazda açan uzmanların değişiklikleri birbirini sessizce
--   eziyordu (last-write-wins).
--
-- ÇÖZÜM:
--   1) Her tabloya `row_version bigint NOT NULL DEFAULT 1` (sabit varsayılan → PG11+ meta-veri
--      değişikliği; tablo yeniden yazılmaz, mevcut satırlar 1 olur).
--   2) BEFORE UPDATE tetikleyicisi her güncellemede `row_version := OLD.row_version + 1` yapar —
--      güncellemeyi kim yaparsa yapsın (uygulama, yönetim, içe aktarma) sürüm ilerler; istemci
--      sürümü SAHTELEYEMEZ (NEW değeri yok sayılır).
--   3) Uygulama `UPDATE … WHERE row_version = <beklenen>` ile tek ifadede koşullu yazar (atomik CAS);
--      sürüm göndermeyen istek uygulamada 428 ile reddedilir.
--
-- GÜVENLİK: SECURITY INVOKER fonksiyon, search_path = '' ; PUBLIC/anon/authenticated EXECUTE yok.
--   RLS / grant / mevcut CDC (yh_client_outbox_*) tetikleyicileri DEĞİŞMEZ (aynı UPDATE içinde çalışır).
-- VERİ: DROP / TRUNCATE / DELETE yok; mevcut içerik değişmez.
-- YAYIN SIRASI: ÖNCE bu migration, SONRA uygulama kodu. (Kod kolonu bulamazsa yazımı 503 ile
--   durdurur — korumasız yazım yapmaz.) Migration tek başına eski kodu bozmaz.
-- ROLLBACK (kod geri alındıktan SONRA):
--   DROP TRIGGER IF EXISTS trg_dy_row_version ON public.client_sessions;   (diğer 3 tablo için de)
--   ALTER TABLE public.client_sessions DROP COLUMN IF EXISTS row_version;  (diğer 3 tablo için de)
--   DROP FUNCTION IF EXISTS public.dy_bump_row_version();
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dy_bump_row_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dy_bump_row_version() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dy_bump_row_version() FROM anon;
REVOKE ALL ON FUNCTION public.dy_bump_row_version() FROM authenticated;

ALTER TABLE public.client_sessions  ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.client_stones    ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.client_homeworks ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.client_analyses  ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;

DROP TRIGGER IF EXISTS trg_dy_row_version ON public.client_sessions;
CREATE TRIGGER trg_dy_row_version BEFORE UPDATE ON public.client_sessions
  FOR EACH ROW EXECUTE FUNCTION public.dy_bump_row_version();

DROP TRIGGER IF EXISTS trg_dy_row_version ON public.client_stones;
CREATE TRIGGER trg_dy_row_version BEFORE UPDATE ON public.client_stones
  FOR EACH ROW EXECUTE FUNCTION public.dy_bump_row_version();

DROP TRIGGER IF EXISTS trg_dy_row_version ON public.client_homeworks;
CREATE TRIGGER trg_dy_row_version BEFORE UPDATE ON public.client_homeworks
  FOR EACH ROW EXECUTE FUNCTION public.dy_bump_row_version();

DROP TRIGGER IF EXISTS trg_dy_row_version ON public.client_analyses;
CREATE TRIGGER trg_dy_row_version BEFORE UPDATE ON public.client_analyses
  FOR EACH ROW EXECUTE FUNCTION public.dy_bump_row_version();

COMMIT;
