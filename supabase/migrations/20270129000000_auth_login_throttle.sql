-- =============================================================================
-- 20270129000000_auth_login_throttle.sql
--
-- FAZ1 FINAL HARDENING — PAKET AUTH (1/3): SUNUCU TARAFI GİRİŞ KISITLAMA (throttle)
--
-- ⚠️ PRODUCTION'A UYGULANMADI. Dosya yalnız HAZIRLANDI; apply ayrı owner onayıyla
--    (Dashboard SQL Editor). `supabase db push` KULLANMAYIN (prod migration takibi kısmi).
--
-- AMAÇ:
--   Tek login yolu `/api/auth/session` → `auth_login_guarded(p_email, p_password, p_ip_hash)`.
--   Kaba kuvvet / credential-stuffing'e karşı KALICI (instance'lar arası ortak) sayaç:
--     scope 'email_ip' (e-posta + IP):  5 hata → 1 dk · 10 hata → 15 dk · 20 hata → 60 dk kilit
--                                       (pencere 60 dk; başarıda SIFIRLANIR)
--     scope 'email'    (yalnız e-posta): 15 dk içinde 30 hata → 15 dk kilit (başarıda SIFIRLANIR)
--     scope 'ip'       (yalnız IP)     : 15 dk içinde 50 hata → 15 dk kilit (başarıda sıfırlanmaz;
--                                       NAT arkasındaki diğer kullanıcıların başarısı saldırganı temizlemesin)
--   Kilitliyken DOĞRU parola da reddedilir ({status:'locked', retry_after}); parola hiç denenmez.
--   Var olmayan e-posta için de sayaç işler + sahte bcrypt çalışır → hesap varlığı sızmaz
--   (aynı 'invalid' yanıtı, benzer süre).
--   Doğrulama HASH-ONLY: password_hash (bcrypt) eşleşmesi; düz metin (users.password) dalı YOK.
--   Parola TRIM paritesi: mevcut login_user gibi p_password OLDUĞU GİBİ crypt'e verilir; çağıran
--   (lib/auth/credentialLogin.ts) JS `.trim()` uygular — bugünkü istemci+sunucu davranışıyla birebir.
--   Başarıda login_user ile AYNI gating alanları döner (id, email, name, role, status, tenant_id,
--   active, approval_status) — active/approval FİLTRELENMEZ (karar uygulama katmanında).
--
-- GİZLİLİK: sayaç anahtarları ham e-posta/IP TUTMAZ: e-posta sha256 (lower+btrim), IP ise uygulamanın
--   pepper'lı sha256'sı (p_ip_hash). Tablo RLS açık + anon/authenticated REVOKE; RPC yalnız service_role.
--
-- security_events: yalnız VAR OLAN kullanıcı için ve kilit YENİ oluştuğunda 'login_locked' (severity
--   medium) yazılır (tablo user_id NOT NULL — 20260622100000). Yazım hatası girişi ETKİLEMEZ.
--
-- PRECONDITION: public.users (email, password_hash, id, name, role, status, tenant_id, active,
--   approval_status), public.security_events, extensions.pgcrypto (crypt/gen_salt/digest).
-- VERİ-YIKICI MI: HAYIR. Yalnız yeni tablo + yeni fonksiyon. Mevcut veri/fonksiyon değişmez.
-- İDEMPOTENT: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION, grant'lar tekrar çalıştırılabilir.
-- APPLY SIRASI: kod deploy'undan ÖNCE veya aynı anda uygulanabilir (kod RPC yoksa login_user'a düşer).
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.auth_login_guarded(text, text, text);
--   DROP TABLE IF EXISTS public.auth_login_throttle;
--   (kod eski login_user yoluna otomatik düşer — bkz. lib/auth/credentialLogin.ts fallback)
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.auth_login_throttle (
  key          text        PRIMARY KEY,
  scope        text        NOT NULL CHECK (scope IN ('email', 'ip', 'email_ip')),
  fail_count   integer     NOT NULL DEFAULT 0 CHECK (fail_count >= 0),
  window_start timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.auth_login_throttle IS
  'Giriş kısıtlama sayaçları (FAZ1 final hardening). Anahtarlar hash''li (ham e-posta/IP yok). Yalnız auth_login_guarded yazar.';

CREATE INDEX IF NOT EXISTS auth_login_throttle_updated_at_idx
  ON public.auth_login_throttle (updated_at);

ALTER TABLE public.auth_login_throttle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_login_throttle FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.auth_login_throttle TO service_role;

-- ── Yardımcı: tek scope için hata sayacını artır (pencere + eşik) ────────────
-- Döner: yeni locked_until (kilit yoksa NULL).
CREATE OR REPLACE FUNCTION public.auth_login_throttle_bump(
  p_key text,
  p_scope text,
  p_now timestamptz
) RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_window interval;
  v_count  integer;
  v_start  timestamptz;
  v_lock   timestamptz;
BEGIN
  v_window := CASE p_scope WHEN 'email_ip' THEN interval '60 minutes' ELSE interval '15 minutes' END;

  INSERT INTO public.auth_login_throttle AS t (key, scope, fail_count, window_start, locked_until, updated_at)
  VALUES (p_key, p_scope, 0, p_now, NULL, p_now)
  ON CONFLICT (key) DO NOTHING;

  SELECT t.fail_count, t.window_start
    INTO v_count, v_start
    FROM public.auth_login_throttle t
   WHERE t.key = p_key
   FOR UPDATE;

  IF v_start < p_now - v_window THEN
    v_count := 0;
    v_start := p_now;
  END IF;
  v_count := v_count + 1;

  v_lock := NULL;
  IF p_scope = 'email_ip' THEN
    IF v_count >= 20 THEN
      v_lock := p_now + interval '60 minutes';
    ELSIF v_count >= 10 THEN
      v_lock := p_now + interval '15 minutes';
    ELSIF v_count >= 5 THEN
      v_lock := p_now + interval '1 minute';
    END IF;
  ELSIF p_scope = 'email' THEN
    IF v_count >= 30 THEN v_lock := p_now + interval '15 minutes'; END IF;
  ELSE -- ip
    IF v_count >= 50 THEN v_lock := p_now + interval '15 minutes'; END IF;
  END IF;

  UPDATE public.auth_login_throttle
     SET fail_count   = v_count,
         window_start = v_start,
         locked_until = v_lock,
         updated_at   = p_now
   WHERE key = p_key;

  RETURN v_lock;
END $$;

REVOKE ALL ON FUNCTION public.auth_login_throttle_bump(text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_login_throttle_bump(text, text, timestamptz) TO service_role;

-- ── Ana RPC ─────────────────────────────────────────────────────────────────
-- Dönüş (jsonb):
--   {"status":"ok","user":{id,email,name,role,status,tenant_id,active,approval_status}}
--   {"status":"invalid"}
--   {"status":"locked","retry_after":<saniye>}
CREATE OR REPLACE FUNCTION public.auth_login_guarded(
  p_email    text,
  p_password text,
  p_ip_hash  text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
         u.approval_status::text AS approval_status
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
END $$;

REVOKE ALL ON FUNCTION public.auth_login_guarded(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_login_guarded(text, text, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma):
--   SELECT has_function_privilege('anon', 'public.auth_login_guarded(text,text,text)', 'EXECUTE'); -- false
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.auth_login_throttle'::regclass;       -- true
-- BAKIM (opsiyonel, veri-yıkıcı DEĞİL — yalnız süresi geçmiş sayaç):
--   DELETE FROM public.auth_login_throttle WHERE updated_at < now() - interval '2 days'
--     AND (locked_until IS NULL OR locked_until < now());
-- =============================================================================
