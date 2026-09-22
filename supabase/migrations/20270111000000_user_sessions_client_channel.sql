-- =============================================================================
-- 20270111000000_user_sessions_client_channel.sql   [ADDITIVE — COLUMN ONLY]
--
-- UZMAN BAZLI KULLANIM İSTATİSTİKLERİ — FAZ 1 / İP-3 (kanal ayrımı).
--
-- AMAÇ: Android WebView uygulamasını mobil tarayıcıdan İLERİYE DÖNÜK ayırt edebilmek
--   için user_sessions'a additive `client_channel` kolonu. UA-parse ile bulunan
--   `platform` (desktop/mobile/tablet/unknown) KORUNUR; `client_channel` onu EZMEZ,
--   yalnız zenginleştirir (android_app tespiti). Geçmiş satırlar NULL kalır (backfill YOK).
--
-- KANAL DEĞERLERİ (tipli, sınırlı — lib/auth/clientChannel.ts CLIENT_CHANNELS ile birebir):
--   desktop_web · mobile_web · tablet_web · android_app · unknown
--
-- GÜVENLİK: client_channel istemciden gelen bir İPUCU'ndan (x-yasam-client header)
--   türetilir; KİMLİK / TENANT / YETKİ kanıtı DEĞİLDİR ve hiçbir yetki kararında
--   kullanılmaz (yalnız analitik sınıflandırma). Sunucu, işareti yoksa UA-parse
--   platform'a göre güvenli fallback uygular.
--
-- KAPSAM: yalnız kolon + CHECK. Yeni tablo YOK, veri (DML) YOK, mevcut davranış değişmez.
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS + guard'lı CHECK.
-- ⚠️ Bu migration bu turda HİÇBİR veritabanına UYGULANMAZ (ayrı onay).
-- GERİYE UYUM: Kolon eklenmeden kod deploy edilirse insertSession `client_channel`
--   alanını atlar (fail-open oturum: kanal NULL kalır, giriş engellenmez).
-- =============================================================================

BEGIN;

ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS client_channel text;

COMMENT ON COLUMN public.user_sessions.client_channel IS
  'İleriye dönük istemci kanalı (analitik): desktop_web|mobile_web|tablet_web|android_app|unknown. '
  'x-yasam-client ipucundan türetilir; kimlik/yetki kanıtı DEĞİLDİR. platform kolonunu ezmez.';

-- Sabit sözlük dışı değer yazılmasın (uygulama da doğrular; DB son savunma).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_sessions_client_channel_chk'
      AND conrelid = 'public.user_sessions'::regclass
  ) THEN
    ALTER TABLE public.user_sessions
      ADD CONSTRAINT user_sessions_client_channel_chk
      CHECK (client_channel IS NULL OR client_channel IN
        ('desktop_web','mobile_web','tablet_web','android_app','unknown'));
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='user_sessions' AND column_name='client_channel';
-- ROLLBACK:
--   ALTER TABLE public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_client_channel_chk;
--   ALTER TABLE public.user_sessions DROP COLUMN IF EXISTS client_channel;
-- =============================================================================
