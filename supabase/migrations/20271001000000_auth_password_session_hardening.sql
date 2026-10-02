-- =============================================================================
-- 20271001000000_auth_password_session_hardening.sql
--
-- SATIŞ ÖNCESİ KAPANIŞ — M1: PAROLA + OTURUM SERTLEŞTİRME (P1-2 / P1-3)
--
-- AMAÇ:
--   (1) hash_password: bcrypt maliyeti gen_salt('bf') varsayılanı (6) → 10. Login'deki sahte
--       bcrypt (auth_login_guarded, cost 10) ile aynı maliyet → süre farkından hesap varlığı
--       sızmaz. Kayıt / admin oluşturma / admin reset / parola değişimi hepsi bu RPC'yi kullanır.
--   (2) auth_login_guarded: başarılı girişte hash maliyeti < 10 ise aynı transaction'da
--       PROGRESSIVE REHASH (girilen parola zaten doğrulanmış; düz metin loglanmaz/saklanmaz).
--       Rehash CAS'lıdır (password_hash = eski hash) ve hatası girişi ETKİLEMEZ.
--   (3) verify_admin_login: HASH-ONLY (users.password düz metin dalı KALDIRILDI).
--   (4) users.password (eski düz metin kolonu): önce hash'i boş + düz metni dolu satırlar
--       (prod: 0) cost 10 ile hash'lenir, SONRA tüm değerler NULL'lanır ve
--       CHECK (password IS NULL) ile yeniden doldurulması engellenir. Login zaten hash-only;
--       kodda bu kolona yazan yol yok (provision_expert dahil).
--   (5) Oturum politikası temizliği: politika dışı AKTİF oturumlar kapatılır (DELETE YOK):
--         - expires_at geçmiş (tüm roller)
--         - admin: mutlak 24 saat (created_at) veya boşta 2 saat (last_seen_at)
--         - uzman: boşta 7 gün (last_seen_at)
--       is_active=false, ended_at=now(), end_reason='expired_policy_cleanup'. Kod tarafında
--       SESSION_EXPIRY_ENFORCE artık varsayılan AÇIK (lib/auth/sessionSecurity.ts); bu temizlik
--       birikmiş eski oturumları tek seferde politika ile hizalar.
--
-- VERİ-YIKICI MI: (4) KASITLI olarak geri alınamaz (düz metin parolalar silinir). Diğerleri
--   UPDATE/CREATE OR REPLACE; hiçbir satır silinmez.
-- İDEMPOTENT: CREATE OR REPLACE; UPDATE'ler koşullu (2. çalıştırmada 0 satır); CHECK DO-guard'lı.
-- SIRA: Kod deploy'undan önce veya sonra uygulanabilir (eski kod yeni fonksiyonlarla uyumlu).
--   Etki: politika dışı admin oturumları kapanır → admin bir kez yeniden giriş yapar.
-- ROLLBACK / MITIGATION:
--   hash_password: `SELECT extensions.crypt(p_plain, extensions.gen_salt('bf'))` gövdesi.
--   auth_login_guarded: 20270129000000 tanımı (rehash bloğu olmadan).
--   verify_admin_login: düz metin dalı GERİ EKLENMEZ (güvenlik); gerekirse 20270129000100 öncesi.
--   CHECK: ALTER TABLE public.users DROP CONSTRAINT users_password_legacy_null_chk;
--   Oturum temizliği: geri alınmaz (kullanıcı yeniden giriş yapar).
-- OWNER AKSİYONU: düz metin değeri taşıyan 3 kullanıcı (süper-admin dahil) deploy sonrası parola
--   değiştirmeli (eski değerler Tokyo dump'ı / masaüstü yedeklerinde durur).
-- =============================================================================

BEGIN;

-- (1) hash_password — cost 10 ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.hash_password(p_plain text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT extensions.crypt(p_plain, extensions.gen_salt('bf'::text, 10));
$function$;

REVOKE ALL ON FUNCTION public.hash_password(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hash_password(text) TO service_role;

-- (2) auth_login_guarded — progressive rehash -----------------------------------
CREATE OR REPLACE FUNCTION public.auth_login_guarded(p_email text, p_password text, p_ip_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_now        timestamptz := now();
  v_email      text := lower(btrim(coalesce(p_email, '')));
  v_ip         text := nullif(btrim(coalesce(p_ip_hash, '')), '');
  v_email_key  text;
  v_ip_key     text;
  v_eip_key    text;
  v_locked     timestamptz;
  v_user       record;
  v_any_user   uuid;
  v_lock_e     timestamptz;
  v_lock_eip   timestamptz;
  v_lock_ip    timestamptz;
  v_cost       integer;
BEGIN
  IF v_email = '' OR coalesce(p_password, '') = '' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  v_email_key := 'e:' || encode(extensions.digest(v_email, 'sha256'), 'hex');
  v_ip_key    := CASE WHEN v_ip IS NULL THEN NULL ELSE 'i:' || v_ip END;
  v_eip_key   := CASE WHEN v_ip IS NULL THEN NULL ELSE 'ei:' || substr(v_email_key, 3) || ':' || v_ip END;

  -- Aynı e-postaya eşzamanlı denemeleri serialize et (xact bitince serbest).
  PERFORM pg_advisory_xact_lock(hashtextextended('auth_login:' || v_email_key, 0));

  -- Kilit kontrolü (herhangi bir scope kilitliyse parola DENENMEZ).
  SELECT max(t.locked_until) INTO v_locked
    FROM public.auth_login_throttle t
   WHERE t.key IN (v_email_key, coalesce(v_ip_key, ''), coalesce(v_eip_key, ''))
     AND t.locked_until IS NOT NULL
     AND t.locked_until > v_now;

  IF v_locked IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'locked',
      'retry_after', greatest(1, ceil(extract(epoch FROM (v_locked - v_now)))::integer)
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

    -- PROGRESSIVE REHASH: bcrypt maliyeti 10'un altındaysa doğrulanmış parolayla yükselt.
    -- CAS (eski hash eşleşmesi) → eşzamanlı parola değişimini ezmez. Hata girişi etkilemez.
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

  v_lock_e := public.auth_login_throttle_bump(v_email_key, 'email', v_now);
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

-- (3) verify_admin_login — HASH-ONLY --------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_admin_login(p_email text, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_hash text;
  v_role text;
  v_active boolean;
BEGIN
  SELECT password_hash, role, active
  INTO v_hash, v_role, v_active
  FROM public.users
  WHERE lower(trim(email)) = lower(trim(p_email))
  LIMIT 1;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_role IS DISTINCT FROM 'admin' THEN RETURN false; END IF;
  IF v_active IS NOT TRUE THEN RETURN false; END IF;
  -- HASH-ONLY: hash yoksa doğrulama başarısız (düz metin dalı YOK).
  IF v_hash IS NULL OR v_hash = '' THEN RETURN false; END IF;

  RETURN extensions.crypt(trim(p_password), v_hash) = v_hash;
END;
$function$;

REVOKE ALL ON FUNCTION public.verify_admin_login(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_admin_login(text, text) TO service_role;

-- (4) users.password — önce güvenli backfill, sonra NULL + CHECK ------------------
-- Hash'i boş + düz metni dolu satır (prod: 0) kilitlenmesin: login'in btrim'siz karşılaştırmasıyla
-- uyumlu olmak için mevcut 20270129000100 backfill'i ile AYNI normalizasyon (btrim) kullanılır.
UPDATE public.users
   SET password_hash = extensions.crypt(btrim(password), extensions.gen_salt('bf', 10))
 WHERE (password_hash IS NULL OR password_hash = '')
   AND password IS NOT NULL
   AND btrim(password) <> '';

UPDATE public.users
   SET password = NULL
 WHERE password IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.users'::regclass
       AND conname = 'users_password_legacy_null_chk'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_password_legacy_null_chk CHECK (password IS NULL);
  END IF;
END $$;

COMMENT ON COLUMN public.users.password IS
  'KULLANIM DIŞI (eski düz metin). Her zaman NULL — CHECK users_password_legacy_null_chk. Parola yalnız password_hash (bcrypt).';

-- (5) Politika dışı aktif oturumların kapatılması (DELETE YOK) -------------------
UPDATE public.user_sessions s
   SET is_active  = false,
       ended_at   = now(),
       end_reason = 'expired_policy_cleanup'
  FROM public.users u
 WHERE u.id = s.user_id
   AND s.is_active = true
   AND (
         (s.expires_at IS NOT NULL AND s.expires_at <= now())
      OR (lower(btrim(coalesce(u.role::text, ''))) = 'admin'
          AND (s.created_at <= now() - interval '24 hours'
               OR s.last_seen_at <= now() - interval '2 hours'))
      OR (lower(btrim(coalesce(u.role::text, ''))) <> 'admin'
          AND s.last_seen_at <= now() - interval '7 days')
       );

COMMIT;

NOTIFY pgrst, 'reload schema';
