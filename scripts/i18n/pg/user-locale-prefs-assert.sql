-- I18N-F1 — user_locale_prefs doğrulamaları (geçici embedded-postgres; sentetik veri). Hata → FAIL.
DO $$
DECLARE n int; v text; ok boolean;
BEGIN
  -- T1 tablo + RLS
  IF to_regclass('public.user_locale_prefs') IS NULL THEN RAISE EXCEPTION 'T1 tablo yok'; END IF;
  SELECT relrowsecurity INTO ok FROM pg_class WHERE oid = 'public.user_locale_prefs'::regclass;
  IF NOT ok THEN RAISE EXCEPTION 'T1 RLS kapalı'; END IF;

  -- T2 istemci rollerinde hiçbir yetki yok
  IF has_table_privilege('anon', 'public.user_locale_prefs', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege('authenticated', 'public.user_locale_prefs', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'T2 anon/authenticated yetkisi var';
  END IF;
  -- T3 service_role: okuma/ekleme var; silme/truncate yok; kimlik kolonu güncelleme yetkisi yok
  IF NOT has_table_privilege('service_role', 'public.user_locale_prefs', 'SELECT') OR NOT has_table_privilege('service_role', 'public.user_locale_prefs', 'INSERT') THEN
    RAISE EXCEPTION 'T3 service_role SELECT/INSERT eksik';
  END IF;
  IF has_table_privilege('service_role', 'public.user_locale_prefs', 'DELETE') OR has_table_privilege('service_role', 'public.user_locale_prefs', 'TRUNCATE') THEN
    RAISE EXCEPTION 'T3 service_role DELETE/TRUNCATE yetkisi olmamalı';
  END IF;
  IF has_column_privilege('service_role', 'public.user_locale_prefs', 'user_id', 'UPDATE') OR has_column_privilege('service_role', 'public.user_locale_prefs', 'tenant_id', 'UPDATE') THEN
    RAISE EXCEPTION 'T3 kimlik kolonu UPDATE yetkisi olmamalı';
  END IF;
  IF NOT has_column_privilege('service_role', 'public.user_locale_prefs', 'preferred_locale', 'UPDATE') THEN
    RAISE EXCEPTION 'T3 preferred_locale UPDATE yetkisi eksik';
  END IF;
END $$;

-- T4 service_role ile uygulamanın yaptığı upsert (lib/i18n/localePreferenceStore.ts)
SET ROLE service_role;
INSERT INTO public.user_locale_prefs (tenant_id, user_id, preferred_locale)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'en')
ON CONFLICT (tenant_id, user_id) DO UPDATE SET preferred_locale = EXCLUDED.preferred_locale;
INSERT INTO public.user_locale_prefs (tenant_id, user_id, preferred_locale)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'tr')
ON CONFLICT (tenant_id, user_id) DO UPDATE SET preferred_locale = EXCLUDED.preferred_locale;
INSERT INTO public.user_locale_prefs (tenant_id, user_id, preferred_locale)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'en')
ON CONFLICT (tenant_id, user_id) DO UPDATE SET preferred_locale = EXCLUDED.preferred_locale;
RESET ROLE;

DO $$
DECLARE n int; v text;
BEGIN
  SELECT count(*) INTO n FROM public.user_locale_prefs;
  IF n <> 2 THEN RAISE EXCEPTION 'T4 beklenen 2 satır, bulunan %', n; END IF;
  SELECT preferred_locale INTO v FROM public.user_locale_prefs WHERE user_id = '11111111-1111-4111-8111-111111111111';
  IF v <> 'tr' THEN RAISE EXCEPTION 'T4 upsert güncellemedi (%).', v; END IF;
  -- T5 hesaplar arası izolasyon: A'nın değişikliği B'yi etkilemez
  SELECT preferred_locale INTO v FROM public.user_locale_prefs WHERE user_id = '22222222-2222-4222-8222-222222222222';
  IF v <> 'en' THEN RAISE EXCEPTION 'T5 B tercihi bozuldu (%).', v; END IF;
END $$;

-- T6 geçersiz dil kodları veritabanında reddedilir
DO $$
DECLARE bad text;
BEGIN
  FOREACH bad IN ARRAY ARRAY['fr', 'nl', 'es', 'EN', 'en-GB', '', 'xx'] LOOP
    BEGIN
      UPDATE public.user_locale_prefs SET preferred_locale = bad WHERE user_id = '11111111-1111-4111-8111-111111111111';
      RAISE EXCEPTION 'T6 geçersiz dil kabul edildi: %', bad;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;
END $$;

-- T7 kimlik kolonları değiştirilemez (süper kullanıcı dahil, tetikleyici)
DO $$
BEGIN
  BEGIN
    UPDATE public.user_locale_prefs SET user_id = '22222222-2222-4222-8222-222222222222' WHERE user_id = '11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'T7 kimlik değişikliği engellenmedi';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- T8 aynı uzman için ikinci satır açılamaz
DO $$
BEGIN
  BEGIN
    INSERT INTO public.user_locale_prefs (tenant_id, user_id, preferred_locale)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'en');
    RAISE EXCEPTION 'T8 tekillik ihlali engellenmedi';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

-- T9 service_role silemez; istemci rolü okuyamaz
SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    DELETE FROM public.user_locale_prefs;
    RAISE EXCEPTION 'T9 service_role DELETE engellenmedi';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.user_locale_prefs;
    RAISE EXCEPTION 'T9 authenticated okuyabildi';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- T10 kullanıcı silinince tercih CASCADE ile gider (hesap kalıcı silme akışı)
DELETE FROM public.users WHERE id = '22222222-2222-4222-8222-222222222222';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.user_locale_prefs WHERE user_id = '22222222-2222-4222-8222-222222222222';
  IF n <> 0 THEN RAISE EXCEPTION 'T10 CASCADE çalışmadı'; END IF;
END $$;
-- temizlik: --twice ikinci turunda fixture yeniden eklenir
INSERT INTO public.users (id, tenant_id, email) VALUES ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'uzman-b@ornek.invalid') ON CONFLICT (id) DO NOTHING;
DELETE FROM public.user_locale_prefs;
