-- =============================================================================
-- 20270129000200_user_sessions_expiry_touch.sql
--
-- FAZ1 FINAL HARDENING — PAKET AUTH (3/3): OTURUM SÜRESİ + GERÇEK last_seen_at (touch) +
--                                          KONUM LİMİTİ VARSAYILANI
--
-- ⚠️ PRODUCTION'A UYGULANMADI. Dosya yalnız HAZIRLANDI; apply ayrı owner onayıyla.
--
-- SORUN (prod 2026-09-27): 243 aktif oturumun 243'ünde last_seen_at = created_at — kod
--   `void db.update(...)` ile tembel PostgREST builder'ını hiç çalıştırmıyordu (PERF-05).
--   Oturumların son-kullanım/süre bilgisi yok; expires_at kolonu yok.
--
-- ÇÖZÜM:
--   (1) user_sessions.expires_at timestamptz (ADD COLUMN IF NOT EXISTS). Yeni oturumlarda kod
--       yazar (admin: +24 saat, uzman: +30 gün); kolon varsayılanı now()+30 gün (güvenli taban).
--   (2) BACKFILL (UPDATE — veri SİLMEZ): expires_at'i NULL olan AKTİF oturumlarda
--       last_seen_at = now(), expires_at = now() + 14 gün. (Aksi halde enforcement açıldığında
--       tüm mevcut oturumlar idle sayılırdı.) Pasif oturumlar değişmez.
--   (3) users.allowed_locations: DEFAULT 2; yalnız NULL ve 1 → 2 (owner kararı: telefon +
--       bilgisayar normal kullanım). 0'a (anlamı belirsiz — kod 0'ı 1'e yuvarlıyordu) ve
--       3/999 gibi bilinçli değerlere DOKUNULMAZ.
--   (4) RPC touch_active_session(...) — TEK round-trip token doğrulama + throttled touch +
--       (yalnız p_enforce=true iken) mutlak/idle süre zorlaması. service_role-only.
--       p_enforce=false (R1, varsayılan) → hiçbir oturum SONLANDIRILMAZ; yalnız touch.
--
-- PRECONDITION: public.user_sessions, public.users (role, allowed_locations).
-- VERİ-YIKICI MI: HAYIR (DELETE yok). UPDATE'ler: (2) aktif oturumların last_seen_at/expires_at
--   alanları; (3) allowed_locations NULL/1 → 2. Geri alınabilir (aşağıda).
-- İDEMPOTENT: ADD COLUMN IF NOT EXISTS; backfill `expires_at IS NULL` koşullu (2. çalıştırmada
--   no-op); allowed_locations UPDATE 2. çalıştırmada no-op; CREATE OR REPLACE FUNCTION.
-- APPLY SIRASI: kod deploy'undan önce veya sonra uygulanabilir (kod RPC/kolon yoksa eski
--   select+await-update yoluna düşer). Enforcement (SESSION_EXPIRY_ENFORCE=1) YALNIZ bu
--   migration apply edildikten ve R1 gözlem süresinden SONRA açılmalı.
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.touch_active_session(text, integer, integer, boolean, integer, integer);
--   ALTER TABLE public.user_sessions DROP COLUMN IF EXISTS expires_at;   (veri kaybı yok: yeni kolon)
--   ALTER TABLE public.users ALTER COLUMN allowed_locations SET DEFAULT 1;
--   (allowed_locations 2 → 1 geri dönüşü için apply öncesi `SELECT id, allowed_locations` alın.)
-- =============================================================================

BEGIN;

-- (1) expires_at kolonu (önce varsayılansız eklenir → mevcut satırlar NULL kalır, backfill ayırt eder)
ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.user_sessions.expires_at IS
  'Mutlak oturum sonu (admin +24s, uzman +30g; kod yazar). Zorlama yalnız SESSION_EXPIRY_ENFORCE açıkken (touch_active_session).';

-- (2) Aktif oturum backfill (UPDATE; veri silmez). 2. çalıştırmada expires_at dolu → no-op.
UPDATE public.user_sessions
   SET last_seen_at = now(),
       expires_at   = coalesce(expires_at, now() + interval '14 days')
 WHERE is_active = true
   AND expires_at IS NULL;

ALTER TABLE public.user_sessions
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 days');

-- Token araması zaten UNIQUE(session_token) ile indeksli. Süre taraması için kısmi indeks.
CREATE INDEX IF NOT EXISTS idx_user_sessions_active_expires
  ON public.user_sessions (expires_at)
  WHERE is_active = true;

-- (3) Konum limiti varsayılanı (yalnız NULL ve 1 → 2; 0 / 3 / 999 DOKUNULMAZ).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'allowed_locations')
  THEN
    ALTER TABLE public.users ALTER COLUMN allowed_locations SET DEFAULT 2;
    UPDATE public.users
       SET allowed_locations = 2
     WHERE allowed_locations IS NULL OR allowed_locations = 1;
  ELSE
    RAISE NOTICE 'users.allowed_locations yok — atlandı';
  END IF;
END $$;

-- (4) touch_active_session
--   Dönüş: aktif + (enforce ise süresi geçmemiş) oturumun user_id'si; aksi halde NULL.
--   p_touch_after_seconds : last_seen_at bu kadar eskiyse güncellenir (koşullu UPDATE → eşzamanlı
--                           istek dalgasında TEK yazma).
--   p_idle_seconds        : (enforce) uzman idle sınırı; p_admin_idle_seconds admin için.
--   p_admin_absolute_seconds : (enforce) admin mutlak sınırı (created_at'ten; eski oturumlar
--                           expires_at=+14g backfill aldığı için admin'e ayrıca uygulanır).
--   end_reason: 'expired_absolute' | 'expired_idle'.
CREATE OR REPLACE FUNCTION public.touch_active_session(
  p_token                  text,
  p_touch_after_seconds    integer,
  p_idle_seconds           integer,
  p_enforce                boolean,
  p_admin_idle_seconds     integer DEFAULT NULL,
  p_admin_absolute_seconds integer DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now      timestamptz := now();
  v_id       uuid;
  v_user     uuid;
  v_last     timestamptz;
  v_expires  timestamptz;
  v_created  timestamptz;
  v_role     text;
  v_is_admin boolean;
  v_idle     integer;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN NULL;
  END IF;

  SELECT s.id, s.user_id, s.last_seen_at, s.expires_at, s.created_at, lower(btrim(coalesce(u.role::text, '')))
    INTO v_id, v_user, v_last, v_expires, v_created, v_role
    FROM public.user_sessions s
    LEFT JOIN public.users u ON u.id = s.user_id
   WHERE s.session_token = p_token
     AND s.is_active = true
   LIMIT 1;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF coalesce(p_enforce, false) THEN
    v_is_admin := (v_role = 'admin');

    IF (v_expires IS NOT NULL AND v_expires <= v_now)
       OR (v_is_admin AND p_admin_absolute_seconds IS NOT NULL AND p_admin_absolute_seconds > 0
           AND v_created <= v_now - make_interval(secs => p_admin_absolute_seconds))
    THEN
      UPDATE public.user_sessions
         SET is_active = false, ended_at = v_now, end_reason = 'expired_absolute'
       WHERE id = v_id AND is_active = true;
      RETURN NULL;
    END IF;

    v_idle := CASE WHEN v_is_admin AND p_admin_idle_seconds IS NOT NULL
                   THEN p_admin_idle_seconds ELSE p_idle_seconds END;
    IF v_idle IS NOT NULL AND v_idle > 0 AND v_last IS NOT NULL
       AND v_last <= v_now - make_interval(secs => v_idle)
    THEN
      UPDATE public.user_sessions
         SET is_active = false, ended_at = v_now, end_reason = 'expired_idle'
       WHERE id = v_id AND is_active = true;
      RETURN NULL;
    END IF;
  END IF;

  IF v_last IS NULL
     OR v_last < v_now - make_interval(secs => greatest(coalesce(p_touch_after_seconds, 0), 0))
  THEN
    UPDATE public.user_sessions
       SET last_seen_at = v_now
     WHERE id = v_id
       AND is_active = true
       AND (last_seen_at IS NULL
            OR last_seen_at < v_now - make_interval(secs => greatest(coalesce(p_touch_after_seconds, 0), 0)));
  END IF;

  RETURN v_user;
END $$;

REVOKE ALL ON FUNCTION public.touch_active_session(text, integer, integer, boolean, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_active_session(text, integer, integer, boolean, integer, integer)
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma):
--   SELECT count(*) FROM public.user_sessions WHERE is_active AND expires_at IS NULL;         -- 0
--   SELECT count(*) FROM public.users WHERE allowed_locations IS NULL OR allowed_locations = 1; -- 0
--   SELECT has_function_privilege('anon',
--     'public.touch_active_session(text,integer,integer,boolean,integer,integer)', 'EXECUTE');  -- false
-- =============================================================================
