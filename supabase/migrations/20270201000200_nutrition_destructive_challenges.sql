-- ============================================================
-- 20270201000200_nutrition_destructive_challenges.sql
--
-- Beslenme — Geri alınamaz toplu işlemler için SUNUCU TARAFLI 4 haneli doğrulama kodu.
--
-- KULLANIM: "Sistem değerine dön" (tek besin + tümü) ve toplu silme ("Günü Temizle").
--   1) Route kapsamı sunucuda hesaplar (etkilenecek kayıtlar → scope_hash + item_count),
--      4 haneli kodu crypto.randomInt ile üretir, YALNIZ sha256(challenge_id:code) saklar,
--      kodu ekranda göstermek üzere döndürür.
--   2) Onay isteğinde route kapsamı YENİDEN hesaplar ve nutrition_challenge_consume ile
--      challenge'ı tek atomik adımda tüketir. Reddedilir: yanlış kod, süresi dolmuş, başka
--      kullanıcı/tenant, farklı işlem türü, kapsam değişmiş, daha önce kullanılmış,
--      çok fazla yanlış deneme (5).
--   Modal atlanıp endpoint doğrudan çağrılsa bile geçerli challenge olmadan işlem ÇALIŞMAZ.
--
-- Tablo: kısa ömürlü (5 dk) güvenlik kaydı; iş verisi DEĞİL (yedek kapsamı dışı).
-- GÜVENLİK: RLS ENABLE + REVOKE anon/authenticated/PUBLIC; yalnız service_role.
-- VERİ-YIKICI MI: HAYIR.
-- ROLLBACK: DROP FUNCTION public.nutrition_challenge_consume(uuid,uuid,uuid,text,text,text);
--           DROP TABLE public.nutrition_destructive_challenges;
-- ============================================================

BEGIN;

CREATE TABLE public.nutrition_destructive_challenges (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  user_id     uuid        NOT NULL,
  action      text        NOT NULL,
  scope_hash  text        NOT NULL,
  item_count  integer     NOT NULL,
  code_hash   text        NOT NULL,
  attempts    integer     NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_destructive_challenges_action_chk CHECK (
    action IN ('food_reset_one', 'food_reset_all', 'plan_day_clear')
  ),
  CONSTRAINT nutrition_destructive_challenges_count_chk CHECK (item_count >= 0),
  CONSTRAINT nutrition_destructive_challenges_attempts_chk CHECK (attempts >= 0),
  CONSTRAINT nutrition_destructive_challenges_hash_chk CHECK (
    length(scope_hash) = 64 AND length(code_hash) = 64
  )
);

CREATE INDEX nutrition_destructive_challenges_owner_idx
  ON public.nutrition_destructive_challenges (tenant_id, user_id, created_at DESC);

ALTER TABLE public.nutrition_destructive_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.nutrition_destructive_challenges FROM anon, authenticated, PUBLIC;
GRANT ALL PRIVILEGES ON TABLE public.nutrition_destructive_challenges TO service_role;

-- Atomik tüketim. Dönüş: 'ok' | 'not_found' | 'used' | 'expired' | 'locked' | 'scope_changed' | 'invalid_code'
CREATE OR REPLACE FUNCTION public.nutrition_challenge_consume(
  p_id         uuid,
  p_tenant_id  uuid,
  p_user_id    uuid,
  p_action     text,
  p_scope_hash text,
  p_code_hash  text
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_row public.nutrition_destructive_challenges%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.nutrition_destructive_challenges
  WHERE id = p_id AND tenant_id = p_tenant_id AND user_id = p_user_id AND action = p_action
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_row.used_at IS NOT NULL THEN
    RETURN 'used';
  END IF;
  IF v_row.expires_at <= now() THEN
    UPDATE public.nutrition_destructive_challenges SET used_at = now() WHERE id = p_id;
    RETURN 'expired';
  END IF;
  IF v_row.attempts >= 5 THEN
    UPDATE public.nutrition_destructive_challenges SET used_at = now() WHERE id = p_id;
    RETURN 'locked';
  END IF;
  IF v_row.scope_hash <> p_scope_hash THEN
    UPDATE public.nutrition_destructive_challenges SET used_at = now() WHERE id = p_id;
    RETURN 'scope_changed';
  END IF;
  IF v_row.code_hash <> p_code_hash THEN
    UPDATE public.nutrition_destructive_challenges
      SET attempts = attempts + 1,
          used_at = CASE WHEN attempts + 1 >= 5 THEN now() ELSE NULL END
      WHERE id = p_id;
    RETURN 'invalid_code';
  END IF;
  UPDATE public.nutrition_destructive_challenges SET used_at = now() WHERE id = p_id;
  RETURN 'ok';
END;
$fn$;

REVOKE ALL ON FUNCTION public.nutrition_challenge_consume(uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nutrition_challenge_consume(uuid, uuid, uuid, text, text, text) TO service_role;

COMMIT;
