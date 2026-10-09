-- ============================================================================
-- WT3.1 (2026-10-08) — YH outbox webhook secret → Supabase Vault
-- ============================================================================
-- SORUN: Dashboard ile oluşturulan Database Webhook trigger'ı
--   yh_professional_outbox (public.yasam_hafizasi_outbox AFTER INSERT/UPDATE →
--   supabase_functions.http_request(url, 'POST', '{"...","x-yh-webhook-secret":"<SECRET>"}', ...))
-- secret'ı TRIGGER ARGÜMANINDA açık metin taşıyordu (pg_get_triggerdef /
-- information_schema.triggers.action_statement / şema dökümü ile okunabilir).
--
-- ÇÖZÜM:
--   1) Secret Supabase Vault'ta (`yh_outbox_webhook_secret`). Değer bu migration içinde
--      DB tarafında rastgele üretilir (extensions.gen_random_bytes) — dosyada, logda, çıktıda
--      HİÇBİR secret yoktur. Mevcut kayıt varsa yenilenir (= ROTATION).
--   2) Trigger fonksiyonu public.yh_outbox_webhook_notify(): secret + URL'yi çalışma anında
--      Vault'tan okur, net.http_post ile AYNI payload'u ({old_record, record, type, table, schema})
--      gönderir. Trigger tanımında secret YOK. Uyandırma best-effort: Vault eksik/hata →
--      kaynak yazımı ASLA bloklanmaz; 15 dk safety cron kuyruğu toparlar.
--   3) Uygulama secret'ı HİÇ tutmaz: public.yh_outbox_webhook_secret_matches(aday) yalnız
--      service_role'e açık, boolean döner (sha256 karşılaştırma). Vercel env değeri artık
--      okunmaz → eski secret geçersiz.
--   4) Ortama özgü hedef URL de Vault'tadır (`yh_outbox_webhook_url`, secret DEĞİL): bu dosya
--      URL eklemez → yerel/staging ortamlar production'a istek atmaz. Production'da ayrı apply
--      adımı ile eklenir:  SELECT vault.create_secret('<url>', 'yh_outbox_webhook_url', '...');
--   5) Savunma derinliği: pg_net kuyruk/yanıt tablolarında anon/authenticated SELECT kaldırılır
--      (kuyruk satırı teslimden önce istek başlıklarını taşır).
--
-- Vault veya pg_net bulunmayan ortamlarda (yerel test PG) trigger/secret adımları ATLANIR.
-- ============================================================================

BEGIN;

-- ── (A) Uygulamanın secret doğrulaması — secret DB'den çıkmaz ────────────────
CREATE OR REPLACE FUNCTION public.yh_outbox_webhook_secret_matches(p_candidate text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret text;
BEGIN
  IF p_candidate IS NULL OR length(p_candidate) = 0 THEN
    RETURN false;
  END IF;

  SELECT ds.decrypted_secret
    INTO v_secret
    FROM vault.decrypted_secrets AS ds
   WHERE ds.name = 'yh_outbox_webhook_secret'
   LIMIT 1;

  -- Yapılandırılmamış → NULL (uygulama 503 fail-closed döner).
  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RETURN NULL;
  END IF;

  -- Sabit uzunluklu özetler karşılaştırılır (ham değer üzerinde erken-çıkış zamanlaması yok).
  RETURN extensions.digest(convert_to(p_candidate, 'UTF8'), 'sha256')
       = extensions.digest(convert_to(v_secret, 'UTF8'), 'sha256');
END;
$$;

REVOKE ALL ON FUNCTION public.yh_outbox_webhook_secret_matches(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yh_outbox_webhook_secret_matches(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_outbox_webhook_secret_matches(text) TO service_role;

COMMENT ON FUNCTION public.yh_outbox_webhook_secret_matches(text) IS
  'WT3.1: YH outbox webhook secret doğrulaması (Vault). Yalnız service_role. Secret döndürmez.';

-- ── (B) Trigger fonksiyonu — secret/URL çalışma anında Vault'tan ─────────────
CREATE OR REPLACE FUNCTION public.yh_outbox_webhook_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret text;
  v_url    text;
BEGIN
  BEGIN
    SELECT ds.decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets AS ds
     WHERE ds.name = 'yh_outbox_webhook_secret'
     LIMIT 1;

    SELECT ds.decrypted_secret INTO v_url
      FROM vault.decrypted_secrets AS ds
     WHERE ds.name = 'yh_outbox_webhook_url'
     LIMIT 1;

    -- Yapılandırma yok → uyandırma atlanır (safety cron toparlar).
    IF v_secret IS NULL OR v_url IS NULL OR length(v_secret) = 0 OR length(v_url) = 0 THEN
      RETURN NEW;
    END IF;

    -- Payload: supabase_functions.http_request ile BİREBİR aynı şekil.
    PERFORM net.http_post(
      url                  := v_url,
      body                 := jsonb_build_object(
                                'old_record', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
                                'record',     to_jsonb(NEW),
                                'type',       TG_OP,
                                'table',      TG_TABLE_NAME,
                                'schema',     TG_TABLE_SCHEMA
                              ),
      params               := '{}'::jsonb,
      headers              := jsonb_build_object(
                                'Content-Type', 'application/json',
                                'x-yh-webhook-secret', v_secret
                              ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    -- Best-effort: outbox/kaynak yazımı ASLA bloklanmaz. Secret/payload loglanmaz.
    RAISE WARNING 'yh_outbox_webhook_notify: uyandirma atlandi (SQLSTATE %)', SQLSTATE;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.yh_outbox_webhook_notify() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yh_outbox_webhook_notify() FROM anon, authenticated;

COMMENT ON FUNCTION public.yh_outbox_webhook_notify() IS
  'WT3.1: yasam_hafizasi_outbox → YH webhook uyandırması. Secret/URL Vault''tan; tanımda secret YOK.';

-- ── (C) Secret üretimi/rotation + trigger değişimi (yalnız Vault + pg_net varsa) ──
DO $$
DECLARE
  v_id uuid;
BEGIN
  IF to_regnamespace('vault') IS NULL OR to_regnamespace('net') IS NULL
     OR to_regclass('public.yasam_hafizasi_outbox') IS NULL THEN
    RAISE NOTICE 'WT3.1: vault/pg_net/outbox yok — secret + trigger adimi atlandi';
    RETURN;
  END IF;

  SELECT s.id INTO v_id FROM vault.secrets AS s WHERE s.name = 'yh_outbox_webhook_secret' LIMIT 1;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'yh_outbox_webhook_secret',
      'YH outbox webhook paylasilan secret (WT3.1). Yalniz DB icinde uretilir; disari yazilmaz.'
    );
  ELSE
    PERFORM vault.update_secret(v_id, encode(extensions.gen_random_bytes(32), 'hex'));
  END IF;

  -- Eski (secret'ı argümanda taşıyan) dashboard webhook trigger'ı kaldırılır; aynı adla
  -- Vault okuyan fonksiyona bağlanır.
  DROP TRIGGER IF EXISTS yh_professional_outbox ON public.yasam_hafizasi_outbox;
  CREATE TRIGGER yh_professional_outbox
    AFTER INSERT OR UPDATE ON public.yasam_hafizasi_outbox
    FOR EACH ROW EXECUTE FUNCTION public.yh_outbox_webhook_notify();

  -- Savunma derinliği: kuyruk/yanıt tabloları anon/authenticated tarafından okunamaz.
  IF to_regclass('net.http_request_queue') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON TABLE net.http_request_queue FROM anon, authenticated';
  END IF;
  IF to_regclass('net._http_response') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON TABLE net._http_response FROM anon, authenticated';
  END IF;
END
$$;

COMMIT;
