-- =============================================================================
-- 20271104000000_auth_login_lockout_dos_hardening.sql
--
-- SATIŞ ÖNCESİ AŞAMA 1 — AUTH-01 (owner kararı: YAPALIM): hedefli hesap kilitleme DoS'u.
--
-- ⚠️ PRODUCTION'A UYGULANMADI. Apply ayrı owner onayıyla (Dashboard SQL Editor).
--    `supabase db push` KULLANMAYIN (prod migration takibi kısmi).
--
-- SORUN (20270129000000 + 20271001000000 tanımı):
--   'email' kapsamı (15 dk'da 30 hata → 15 dk kilit) IP'den bağımsızdır ve kilitliyken DOĞRU
--   parola da reddedilir. Hedef e-postayı bilen biri (owner e-postası, landing'de yayınlanan demo
--   hesabı) 3-4 farklı IP'den deneyerek hesabı süresiz kilitli tutabilir.
--
-- ÇÖZÜM (en küçük değişiklik; diğer korumalar AYNEN):
--   (1) GÜVENİLEN IP: Bir e-posta için daha önce BAŞARILI giriş yapılmış IP (son 30 gün),
--       yalnız 'email' kapsamındaki kilide TAKILMAZ. 'email_ip' (5/10/20) ve 'ip' (50) kilitleri
--       bu IP için de aynen geçerlidir → güvenilen IP'den kaba kuvvet yine sınırlı.
--       Saldırganın 'email' kilidiyle owner'ı dışarıda bırakması için owner'ın kendi IP'sinden
--       denemesi gerekir (o durumda da 'email_ip' kilidi saldırganı durdurur).
--   (2) DEMO HESABI (users.is_demo_account = true): parolası landing'de herkese açık olduğundan
--       'email' kapsamı korunacak bir sır içermez; bu hesapta 'email' kilidi ne kontrol edilir ne
--       sayılır. 'email_ip' ve 'ip' kapsamları demo için de geçerlidir (tek kaynaktan döngü durur).
--   Var olmayan e-posta / hatalı parola yanıtı ve süre eşitleme DEĞİŞMEDİ (hesap varlığı sızmaz).
--
-- YENİ NESNE: public.auth_login_trusted (anahtar = 't:' || sha256(email) || ':' || ip_hash).
--   Ham e-posta / IP TUTULMAZ (ip_hash uygulamanın pepper'lı sha256'sı). RLS açık, anon/authenticated
--   REVOKE, yalnız service_role (SECURITY DEFINER RPC) yazar/okur. Tenant verisi içermez.
--   Saklama: 30 günden eski satırlar her başarılı girişte o e-posta için temizlenir (sınırlı büyüme).
--
-- DEĞİŞEN NESNE: public.auth_login_guarded(text, text, text) — imza ve dönüş biçimi AYNI
--   ({status:'ok',user:{…}} | {status:'invalid'} | {status:'locked',retry_after}); progressive
--   rehash (20271001000000) KORUNDU. Kod (lib/auth/credentialLogin.ts) DEĞİŞMEZ.
--
-- VERİ-YIKICI MI: HAYIR. Yeni tablo + CREATE OR REPLACE FUNCTION. Mevcut satır silinmez/değişmez.
-- İDEMPOTENT: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE.
-- APPLY SIRASI: bağımsız (kod deploy'undan önce/sonra fark etmez).
-- ROLLBACK (ileri→geri):
--   1) 20271001000000_auth_password_session_hardening.sql içindeki "(2) auth_login_guarded"
--      bloğunu (CREATE OR REPLACE … + REVOKE/GRANT) aynen yeniden çalıştırın.
--   2) DROP TABLE IF EXISTS public.auth_login_trusted;
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.auth_login_trusted (
  key             text        PRIMARY KEY,
  email_key       text        NOT NULL,
  last_success_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.auth_login_trusted IS
  'AUTH-01: e-posta+IP için son başarılı giriş (hash''li anahtar). Yalnız auth_login_guarded yazar/okur; email kilidinden muafiyet için.';

CREATE INDEX IF NOT EXISTS auth_login_trusted_email_key_idx
  ON public.auth_login_trusted (email_key, last_success_at);

ALTER TABLE public.auth_login_trusted ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_login_trusted FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.auth_login_trusted TO service_role;

CREATE OR REPLACE FUNCTION public.auth_login_guarded(p_email text, p_password text, p_ip_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_now         timestamptz := now();
  v_email       text := lower(btrim(coalesce(p_email, '')));
  v_ip          text := nullif(btrim(coalesce(p_ip_hash, '')), '');
  v_email_key   text;
  v_ip_key      text;
  v_eip_key     text;
  v_trust_key   text;
  v_locked_hard timestamptz;
  v_locked_mail timestamptz;
  v_trusted     boolean := false;
  v_is_demo     boolean := false;
  v_user        record;
  v_any_user    uuid;
  v_lock_e      timestamptz;
  v_lock_eip    timestamptz;
  v_lock_ip     timestamptz;
  v_cost        integer;
BEGIN
  IF v_email = '' OR coalesce(p_password, '') = '' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  v_email_key := 'e:' || encode(extensions.digest(v_email, 'sha256'), 'hex');
  v_ip_key    := CASE WHEN v_ip IS NULL THEN NULL ELSE 'i:' || v_ip END;
  v_eip_key   := CASE WHEN v_ip IS NULL THEN NULL ELSE 'ei:' || substr(v_email_key, 3) || ':' || v_ip END;
  v_trust_key := CASE WHEN v_ip IS NULL THEN NULL ELSE 't:' || substr(v_email_key, 3) || ':' || v_ip END;

  -- Aynı e-postaya eşzamanlı denemeleri serialize et (xact bitince serbest).
  PERFORM pg_advisory_xact_lock(hashtextextended('auth_login:' || v_email_key, 0));

  -- Herkese açık demo hesabı mı? (yalnız 'email' kapsamını etkiler)
  SELECT coalesce(bool_or(u.is_demo_account), false) INTO v_is_demo
    FROM public.users u
   WHERE lower(btrim(u.email)) = v_email;

  -- Güvenilen IP mi? (bu e-posta için son 30 günde bu IP'den başarılı giriş)
  IF v_trust_key IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.auth_login_trusted t
       WHERE t.key = v_trust_key
         AND t.last_success_at > v_now - interval '30 days'
    ) INTO v_trusted;
  END IF;

  -- Kilit kontrolü: 'ip' ve 'email_ip' her zaman bağlayıcı; 'email' yalnız güvenilmeyen IP ve
  -- demo olmayan hesap için bağlayıcı. Kilitliyken parola DENENMEZ.
  SELECT max(t.locked_until) INTO v_locked_hard
    FROM public.auth_login_throttle t
   WHERE t.key IN (coalesce(v_ip_key, ''), coalesce(v_eip_key, ''))
     AND t.locked_until IS NOT NULL
     AND t.locked_until > v_now;

  IF NOT v_trusted AND NOT v_is_demo THEN
    SELECT max(t.locked_until) INTO v_locked_mail
      FROM public.auth_login_throttle t
     WHERE t.key = v_email_key
       AND t.locked_until IS NOT NULL
       AND t.locked_until > v_now;
  END IF;

  IF v_locked_hard IS NOT NULL OR v_locked_mail IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'locked',
      'retry_after', greatest(1, ceil(extract(epoch FROM (greatest(v_locked_hard, v_locked_mail) - v_now)))::integer)
    );
  END IF;

  -- HASH-ONLY doğrulama (login_user ile aynı e-posta eşlemesi; düz metin dalı YOK).
  SELECT u.id::uuid AS id, u.email::text AS email, u.name::text AS name, u.role::text AS role,
         u.status::text AS status, u.tenant_id::uuid AS tenant_id, u.active::boolean AS active,
         u.approval_status::text AS approval_status, u.password_hash::text AS password_hash
    INTO v_user
    FROM public.users u
   WHERE lower(btrim(u.email)) = v_email
     AND u.password_hash IS NOT NULL
     AND u.password_hash <> ''
     AND extensions.crypt(p_password, u.password_hash) = u.password_hash
   LIMIT 1;

  IF FOUND THEN
    -- Başarı: e-posta ve e-posta+IP sayaçları sıfırlanır (IP sayacı KORUNUR).
    DELETE FROM public.auth_login_throttle
     WHERE key IN (v_email_key, coalesce(v_eip_key, ''));

    -- AUTH-01: bu IP'yi bu e-posta için güvenilen olarak işaretle (+ eski kayıtları temizle).
    -- Demo hesabı için tutulmaz (zaten 'email' kilidine tabi değil; ziyaretçi IP'si birikmesin).
    IF v_trust_key IS NOT NULL AND NOT v_is_demo THEN
      BEGIN
        INSERT INTO public.auth_login_trusted (key, email_key, last_success_at)
        VALUES (v_trust_key, v_email_key, v_now)
        ON CONFLICT (key) DO UPDATE SET last_success_at = EXCLUDED.last_success_at;
        DELETE FROM public.auth_login_trusted
         WHERE email_key = v_email_key
           AND last_success_at < v_now - interval '30 days';
      EXCEPTION WHEN OTHERS THEN
        NULL; -- güven kaydı best-effort; giriş başarılı kalır
      END;
    END IF;

    -- PROGRESSIVE REHASH (20271001000000 ile aynı): bcrypt maliyeti 10'un altındaysa yükselt.
    v_cost := nullif(substring(v_user.password_hash FROM '^\$2[aby]\$([0-9]{2})\$'), '')::integer;
    IF v_cost IS NOT NULL AND v_cost < 10 THEN
      BEGIN
        UPDATE public.users
           SET password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10))
         WHERE id = v_user.id
           AND password_hash = v_user.password_hash;
      EXCEPTION WHEN OTHERS THEN
        NULL; -- rehash best-effort; giriş başarılı kalır
      END;
    END IF;

    RETURN jsonb_build_object(
      'status', 'ok',
      'user', jsonb_build_object(
        'id', v_user.id,
        'email', v_user.email,
        'name', v_user.name,
        'role', v_user.role,
        'status', v_user.status,
        'tenant_id', v_user.tenant_id,
        'active', v_user.active,
        'approval_status', v_user.approval_status
      )
    );
  END IF;

  -- Hata yolu. Kullanıcı hiç yoksa sahte bcrypt ile süre eşitlenir (hesap varlığı sızmaz).
  SELECT u.id INTO v_any_user
    FROM public.users u
   WHERE lower(btrim(u.email)) = v_email
   LIMIT 1;
  IF v_any_user IS NULL THEN
    PERFORM extensions.crypt(p_password, extensions.gen_salt('bf', 10));
  END IF;

  -- Demo hesabında 'email' kapsamı sayılmaz (herkese açık parola; kilit yalnız DoS aracı olurdu).
  IF NOT v_is_demo THEN
    v_lock_e := public.auth_login_throttle_bump(v_email_key, 'email', v_now);
  END IF;
  IF v_eip_key IS NOT NULL THEN
    v_lock_eip := public.auth_login_throttle_bump(v_eip_key, 'email_ip', v_now);
    v_lock_ip  := public.auth_login_throttle_bump(v_ip_key, 'ip', v_now);
  END IF;

  -- Kilit YENİ oluştuysa (ve kullanıcı varsa) güvenlik olayı — best-effort.
  IF v_any_user IS NOT NULL AND (v_lock_e IS NOT NULL OR v_lock_eip IS NOT NULL) THEN
    BEGIN
      INSERT INTO public.security_events (user_id, event_type, severity, message, metadata)
      VALUES (
        v_any_user, 'login_locked', 'medium',
        'Çok sayıda hatalı giriş denemesi — geçici kilit',
        jsonb_build_object(
          'scope', CASE WHEN v_lock_e IS NOT NULL THEN 'email' ELSE 'email_ip' END,
          'locked_until', greatest(v_lock_e, v_lock_eip)
        )
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- log hatası girişi etkilemez
    END;
  END IF;

  RETURN jsonb_build_object('status', 'invalid');
END $function$;

REVOKE ALL ON FUNCTION public.auth_login_guarded(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_login_guarded(text, text, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
