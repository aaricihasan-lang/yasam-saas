-- =============================================================================
-- 20260918000000_p3_session_limits.sql
--
-- FAZ 1 / P3 (Commit 1) — OTURUM LİMİTİ SEMANTİĞİ + FAIL-CLOSED CHECK
--
-- Yeni bağlayıcı semantik (kolonlar zaten var; yalnız default/constraint/backfill):
--   -1 = SINIRSIZ (unlimited)  ·  0 = bu cihaz türünden GİRİŞ YASAK  ·  N = en fazla N
--   Kolonlar: allowed_active_sessions (toplam), allowed_desktop_sessions,
--             allowed_mobile_sessions, allowed_tablet_sessions, allowed_unknown_sessions.
--
-- P3 KARARI: yeni default = -1 (sınırsız). Mevcut kullanıcılar -1'e backfill edilir →
--   admin açıkça limit verene kadar KİMSE yeni kısıtlanmaz. NOT: eski kod per-platform
--   0'ı "sınır yok" sayıyordu; backfill onu -1 yaparak davranışı korur; 0 artık "yasak".
--
-- GÜVENLİ / GERİYE UYUMLU:
--   - Yalnız users tablosunda default/constraint + değer backfill; INSERT/DELETE yok.
--   - RLS/grant değişmez; password/session/token alanlarına dokunulmaz.
--   - IDEMPOTENT: constraint DO-guard + backfill no-op (değerler zaten -1).
--
-- ⚠️ Otomatik apply DEĞİL; apply ayrı onayla Dashboard SQL Editor (DATABASE_URL=localhost yok).
--
-- DEPLOY SIRASI (ZORUNLU): önce migration apply, SONRA kod deploy. Sebep: eski
--   default tablet/unknown = 0 değerleri yeni semantğe göre "yasak"tır; backfill
--   onları -1 (sınırsız) yapmadan yeni kod deploy edilirse tablet/unknown girişleri
--   yanlışlıkla bloke olur. normalizeLimit yalnız null/NaN/<-1 → -1 fallback yapar;
--   0 kasıtlı "yasak"tır. Bu commit henüz production'a APPLY EDİLMEMİŞTİR.
-- =============================================================================

BEGIN;

ALTER TABLE public.users ALTER COLUMN allowed_active_sessions   SET DEFAULT -1;
ALTER TABLE public.users ALTER COLUMN allowed_desktop_sessions  SET DEFAULT -1;
ALTER TABLE public.users ALTER COLUMN allowed_mobile_sessions   SET DEFAULT -1;
ALTER TABLE public.users ALTER COLUMN allowed_tablet_sessions   SET DEFAULT -1;
ALTER TABLE public.users ALTER COLUMN allowed_unknown_sessions  SET DEFAULT -1;

UPDATE public.users
   SET allowed_active_sessions  = -1,
       allowed_desktop_sessions = -1,
       allowed_mobile_sessions  = -1,
       allowed_tablet_sessions  = -1,
       allowed_unknown_sessions = -1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_session_limits_range') THEN
    ALTER TABLE public.users
      ADD CONSTRAINT chk_users_session_limits_range CHECK (
        allowed_active_sessions   >= -1 AND allowed_active_sessions   <= 10000 AND
        allowed_desktop_sessions  >= -1 AND allowed_desktop_sessions  <= 10000 AND
        allowed_mobile_sessions   >= -1 AND allowed_mobile_sessions   <= 10000 AND
        allowed_tablet_sessions   >= -1 AND allowed_tablet_sessions   <= 10000 AND
        allowed_unknown_sessions  >= -1 AND allowed_unknown_sessions  <= 10000
      );
  END IF;
END $$;

-- ── ATOMİK RACE-SAFE OTURUM OLUŞTURMA (reject-new) ──────────────────────────
-- Eşzamanlı login'lerde "önce COUNT sonra INSERT" yarışını engellemek için: aynı
-- kullanıcı için advisory xact-lock alır, aktif oturumları sayar ve limit içindeyse
-- INSERT eder; aşımda INSERT ETMEZ (mevcut oturumlara DOKUNMAZ) — yalnız sebep döner.
-- Limit semantiği: -1 sınırsız · 0 yasak · N max. SECURITY DEFINER + sabit search_path;
-- yalnız service_role execute (anon/authenticated/public kapalı).
CREATE OR REPLACE FUNCTION public.create_session_within_limits(
  p_user_id        uuid,
  p_session_token  text,
  p_ip             text,
  p_country        text,
  p_city           text,
  p_user_agent     text,
  p_platform       text,
  p_platform_limit integer,
  p_total_limit    integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total    integer;
  v_platform integer;
  v_now      timestamptz := now();
BEGIN
  -- Aynı kullanıcının eşzamanlı login'lerini serialize et (xact bitince serbest).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT count(*) INTO v_total
    FROM public.user_sessions
   WHERE user_id = p_user_id AND is_active = true;

  SELECT count(*) INTO v_platform
    FROM public.user_sessions
   WHERE user_id = p_user_id AND is_active = true
     AND coalesce(platform, 'desktop') = p_platform;

  -- Platform limiti (-1 sınırsız / 0 yasak / N max)
  IF p_platform_limit = 0 THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'device_forbidden');
  ELSIF p_platform_limit > 0 AND v_platform >= p_platform_limit THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'device_limit');
  END IF;

  -- Toplam limit (-1 sınırsız / 0 yasak / N max)
  IF p_total_limit = 0 THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'total_forbidden');
  ELSIF p_total_limit > 0 AND v_total >= p_total_limit THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'total_limit');
  END IF;

  INSERT INTO public.user_sessions
    (user_id, ip_address, country, city, user_agent, platform, session_token,
     is_active, created_at, last_seen_at)
  VALUES
    (p_user_id, p_ip, p_country, p_city, p_user_agent, p_platform, p_session_token,
     true, v_now, v_now);

  RETURN jsonb_build_object('inserted', true,
                            'active_total', v_total + 1,
                            'active_platform', v_platform + 1);
END $$;

REVOKE ALL ON FUNCTION public.create_session_within_limits(uuid,text,text,text,text,text,text,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_session_within_limits(uuid,text,text,text,text,text,text,integer,integer) FROM anon;
REVOKE ALL ON FUNCTION public.create_session_within_limits(uuid,text,text,text,text,text,text,integer,integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_session_within_limits(uuid,text,text,text,text,text,text,integer,integer) TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma): tüm limit kolonları -1;
--   SELECT count(*) FROM public.users WHERE allowed_active_sessions < -1; -- 0
-- ROLLBACK:
--   ALTER TABLE public.users DROP CONSTRAINT IF EXISTS chk_users_session_limits_range;
--   ALTER TABLE public.users ALTER COLUMN allowed_active_sessions  SET DEFAULT 2;
--   ALTER TABLE public.users ALTER COLUMN allowed_desktop_sessions SET DEFAULT 1;
--   ALTER TABLE public.users ALTER COLUMN allowed_mobile_sessions  SET DEFAULT 1;
--   ALTER TABLE public.users ALTER COLUMN allowed_tablet_sessions  SET DEFAULT 0;
--   ALTER TABLE public.users ALTER COLUMN allowed_unknown_sessions SET DEFAULT 0;
-- =============================================================================
