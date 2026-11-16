-- GİRİŞ GÜVENLİĞİ F2 — yayın sonrası SALT-OKUNUR doğrulama (production'da migration'lardan SONRA çalıştırılır).
-- Hiçbir şey YAZMAZ (yalnız katalog okur). Bir F2 migration'ı yanlışlıkla YENİDEN çalıştırılırsa (ör. 000300 / 000600
-- tekrar uygulanırsa) Owner korumalı fonksiyon gövdeleri eski, korumasız sürüme döner; bu betik bunu yakalar.
-- Kullanım: BEGIN READ ONLY; \i scripts/giris-guvenligi/f2-postflight-check.sql ; ROLLBACK;
--   F2_POSTFLIGHT_FINAL=on (set_config) → 000200 (service_role oturum ekleme kilidi) de zorunlu sayılır (en son adım).

DO $$
DECLARE
  bad text[] := ARRAY[]::text[];
  src text;
  f record;
BEGIN
  -- Owner kritik işlemleri işleme özel kanıt ister (000700 / 000900 sarmalayıcıları).
  FOR f IN SELECT * FROM (VALUES
      ('auth_device_owner_decide', 'auth_step_up_lock'),
      ('auth_mfa_set_required', 'auth_step_up_lock'),
      ('auth_recovery_case_execute', 'auth_step_up_lock'),
      ('auth_retention_execute', 'auth_step_up_lock'),
      ('auth_retention_policy_set', 'auth_step_up_lock'),
      ('auth_owner_step_up_take', 'auth_step_up_lock'),
      ('auth_owner_step_up_begin', 'password_reset'),
      ('auth_owner_step_up_begin', 'email_verified_at <= v_s.created_at'),
      ('auth_recovery_codes_generate', 'strong_mfa_required'),
      ('auth_device_revoke', 'fresh_mfa_required'),
      ('auth_qr_fetch', '''purpose'''),
      ('auth_retention_execute', 'LOCK TABLE public.auth_retention_holds'),
      ('auth_recovery_events_append_only', 'date_trunc(''day'', OLD.created_at)'),
      ('auth_device_decisions_append_only', 'date_trunc(''day'', OLD.created_at)')
    ) AS t(fn, needle) LOOP
    SELECT string_agg(p.prosrc, E'\n') INTO src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = f.fn;
    IF src IS NULL OR position(f.needle IN src) = 0 THEN
      bad := bad || (f.fn || ' (beklenen: ' || f.needle || ')');
    END IF;
  END LOOP;
  -- Tetikleyiciler.
  FOR f IN SELECT * FROM (VALUES
      ('auth_email_otps', 'trg_auth_email_otp_step_up_guard'),
      ('users', 'trg_auth_mfa_required_end_sessions'),
      ('users', 'trg_auth_credentials_changed_deny_challenges'),
      ('user_sessions', 'trg_user_sessions_user_id_immutable')
    ) AS t(tbl, trg) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = ('public.' || f.tbl)::regclass AND g.tgname = f.trg AND g.tgenabled <> 'D') THEN
      bad := bad || ('tetikleyici ' || f.trg);
    END IF;
  END LOOP;
  -- İç yardımcılar API rollerine kapalı.
  FOR f IN SELECT * FROM (VALUES ('public.auth_step_up_lock(text,text,uuid)'), ('public.auth_step_up_consume(uuid)'),
      ('public.auth_mfa_mark_verified(uuid,text)'), ('public.auth_retention_count(text,timestamp with time zone)')) AS t(sig) LOOP
    IF to_regprocedure(f.sig) IS NOT NULL AND (has_function_privilege('service_role', f.sig, 'EXECUTE')
        OR has_function_privilege('anon', f.sig, 'EXECUTE')) THEN
      bad := bad || ('iç fonksiyon açık: ' || f.sig);
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.auth_retention_table_uuid(text)', 'EXECUTE') THEN
    bad := bad || 'auth_retention_table_uuid anon''a açık'::text;
  END IF;
  -- 000200 (en son adım): service_role doğrudan oturum ekleyemez.
  IF current_setting('f2.postflight_final', true) = 'on' AND has_table_privilege('service_role', 'public.user_sessions', 'INSERT') THEN
    bad := bad || '000200 uygulanmamış: service_role user_sessions INSERT yetkisi var'::text;
  END IF;
  IF cardinality(bad) > 0 THEN
    RAISE EXCEPTION 'F2 POSTFLIGHT FAIL (% madde): %', cardinality(bad), array_to_string(bad, ' | ');
  END IF;
  RAISE NOTICE 'F2 POSTFLIGHT PASS';
END $$;
