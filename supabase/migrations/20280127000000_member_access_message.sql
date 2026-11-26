-- =============================================================================
-- ÜYE PASİFLEŞTİRME · F7 — KİŞİYE ÖZEL ÜYELİK UYARISI ("Pasif" uzmanın ana sayfa kırmızı bandı)
-- =============================================================================
-- Owner kararları (26.11.2026): mesaj YALNIZ uzmanın ana sayfasındaki kırmızı üyelik uyarısında görünür; üst sınır
-- 500 karakter; tam metin yalnız yetkili yöneticilerin gördüğü audit kaydında saklanır (genel uygulama logu YOK);
-- mesajlaşma sistemine gönderilmez; "Aktif Yap" mesajı TEMİZLER (sonraki pasifleştirmede eski mesaj geri gelmez).
--
-- 1) users.access_restriction_message text NULL — yalnız "Pasif" uzman satırında dolu olabilir; 1–500 karakter.
-- 2) admin_set_member_access_restriction: 4 parametreli imza KALDIRILIR, yerine p_message DEFAULT NULL alan 5 parametreli
--    imza gelir (aynı ad; iki aşırı yükleme YOK → belirsizlik yok). Eski 4 parametreli çağrılar (adlı ve konumsal) varsayılanla
--    AYNEN çalışır. Pasif Yap: kısıt + mesaj TEK UPDATE (tek işlem). Aktif Yap: kısıt + mesaj birlikte temizlenir.
-- 3) admin_set_member_access_message — pasif uzmanın mesajını sonradan düzenler / kaldırır (bayat ekran koruması: beklenen
--    mevcut metin). Yetki / hedef kuralları 2) ile birebir.
-- 4) Audit CHECK SÜPERSET (+ user_access_message_set, user_access_message_cleared).
-- Mesaj düz metindir: kontrol karakterleri (satır sonu hariç) reddedilir; \r\n → \n; baş/son boşluk kırpılır; boş → NULL.
-- DOKUNULMAYAN: giriş güvenliği, kısıt kapısı, arşiv (4a) kuralları, mevcut satırlar (DML YOK; backfill YOK).
-- ÖN KOŞUL: 20280126000000 (access_restricted_at + kısıt RPC'si + 35 eylemli audit CHECK).
-- DEPLOY SIRASI: bu migration → kod. Migration'dan önce yeni kod: mesaj seçeneği gizli (kolon yok), mesajsız Pasif Yap çalışır.
-- UYGULAMA: AYRI OWNER ONAYI. Bu aşamada production'a UYGULANMAZ.
-- GERİ ALMA: 20280126000000 §4 gövdesi (4 parametreli imza) yeniden oluşturulur, 5 parametreli imza ve mesaj RPC'si
--   kaldırılır, kolon bırakılabilir (NULL; okuyan kod yoksa etkisiz).
-- =============================================================================

BEGIN;

-- ── 0) Ön koşullar ───────────────────────────────────────────────────────────
DO $pre$
DECLARE
  v_def      text;
  v_live     text[];
  v_new      text[] := ARRAY['user_access_message_set', 'user_access_message_cleared'];
  v_expected text[] := ARRAY[
    'user_created','user_activated','user_deactivated','user_approved','user_rejected',
    'password_changed_by_admin','all_sessions_terminated','single_session_terminated',
    'desktop_limit_changed','mobile_limit_changed','tablet_limit_changed','total_session_limit_changed',
    'module_enabled','module_disabled','payment_status_changed','role_changed','workspace_viewed',
    'user_deleted','user_archived','main_admin_critical_action',
    'library_transfer_completed','library_transfer_failed','library_transfer_retried',
    'user_profile_updated','license_settings_changed','security_exempt_changed',
    'admin_web_login_pending','admin_web_login_approved','admin_web_login_denied',
    'admin_mobile_login_rejected','own_session_terminated','pricing_phase_changed',
    'user_unarchived','user_access_restricted','user_access_unrestricted'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'access_restricted_at')
     OR (to_regprocedure('public.admin_set_member_access_restriction(uuid,uuid,boolean,boolean)') IS NULL
         AND to_regprocedure('public.admin_set_member_access_restriction(uuid,uuid,boolean,boolean,text)') IS NULL) THEN
    RAISE EXCEPTION 'uye-pasif F7 on kosul: 20280126000000 (erisim kisiti) yok; uygulanmadi';
  END IF;
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
   WHERE c.conname = 'admin_audit_action_chk' AND c.conrelid = 'public.admin_audit_log'::regclass;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'uye-pasif F7 on kosul: admin_audit_action_chk bulunamadi';
  END IF;
  SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_live
    FROM regexp_matches(v_def, '''([a-z_]+)''', 'g') AS m;
  IF NOT (v_live <@ (v_expected || v_new) AND v_expected <@ v_live) THEN
    RAISE EXCEPTION 'uye-pasif F7 on kosul: admin_audit_action_chk beklenenden farkli (%); uygulanmadi', v_def;
  END IF;
END
$pre$;

-- ── 1) Mesaj alanı + değişmez ────────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS access_restriction_message text NULL;
COMMENT ON COLUMN public.users.access_restriction_message IS
  'Üye pasifleştirme F7: "Pasif" uzmana ana sayfa kırmızı bandında gösterilen kişiye özel uyarı (düz metin, 1–500). '
  'NULL = standart uyarı. Yalnız admin_set_member_access_restriction / admin_set_member_access_message yazar; '
  'yalnız kısıtlı (access_restricted_at dolu) uzman satırında dolu olabilir. "Aktif Yap" temizler.';

DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'users_access_restriction_message_chk' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_access_restriction_message_chk
      CHECK (access_restriction_message IS NULL OR (
        access_restricted_at IS NOT NULL
        AND lower(btrim(coalesce(role, ''))) = 'expert'
        AND char_length(access_restriction_message) BETWEEN 1 AND 500
        AND btrim(access_restriction_message) <> ''));
  END IF;
END
$chk$;

-- ── 2) Audit CHECK — SÜPERSET (mevcut 35 + 2) ────────────────────────────────
ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_action_chk;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_action_chk CHECK (action IN (
  'user_created',
  'user_activated',
  'user_deactivated',
  'user_approved',
  'user_rejected',
  'password_changed_by_admin',
  'all_sessions_terminated',
  'single_session_terminated',
  'desktop_limit_changed',
  'mobile_limit_changed',
  'tablet_limit_changed',
  'total_session_limit_changed',
  'module_enabled',
  'module_disabled',
  'payment_status_changed',
  'role_changed',
  'workspace_viewed',
  'user_deleted',
  'user_archived',
  'main_admin_critical_action',
  'library_transfer_completed',
  'library_transfer_failed',
  'library_transfer_retried',
  'user_profile_updated',
  'license_settings_changed',
  'security_exempt_changed',
  'admin_web_login_pending',
  'admin_web_login_approved',
  'admin_web_login_denied',
  'admin_mobile_login_rejected',
  'own_session_terminated',
  'pricing_phase_changed',
  'user_unarchived',
  'user_access_restricted',
  'user_access_unrestricted',
  'user_access_message_set',
  'user_access_message_cleared'
));

-- ── 3) Mesaj normalleştirme (saf, yardımcı) ──────────────────────────────────
-- NULL / yalnız boşluk → NULL. \r\n ve \r → \n. Satır sonu dışındaki kontrol karakterleri → hata (UY003). > 500 → hata.
CREATE OR REPLACE FUNCTION public.member_access_message_normalize(p_message text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog
AS $$
DECLARE
  v text;
BEGIN
  IF p_message IS NULL THEN
    RETURN NULL;
  END IF;
  v := replace(replace(replace(p_message, E'\r\n', E'\n'), E'\r', E'\n'), E'\t', ' ');
  v := btrim(v, E' \n');
  IF v = '' THEN
    RETURN NULL;
  END IF;
  IF v ~ '[\x01-\x08\x0B-\x1F\x7F]' THEN
    RAISE EXCEPTION 'uyelik uyarisi: gecersiz karakter' USING ERRCODE = 'UY003';
  END IF;
  IF char_length(v) > 500 THEN
    RAISE EXCEPTION 'uyelik uyarisi: 500 karakter siniri' USING ERRCODE = 'UY003';
  END IF;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.member_access_message_normalize(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_access_message_normalize(text) TO service_role;

-- ── 4) PASİF YAP / AKTİF YAP — 5 parametreli imza (p_message DEFAULT NULL) ───
DROP FUNCTION IF EXISTS public.admin_set_member_access_restriction(uuid, uuid, boolean, boolean);
CREATE OR REPLACE FUNCTION public.admin_set_member_access_restriction(
  p_user_id             uuid,
  p_actor_admin_id      uuid,
  p_restricted          boolean,
  p_expected_restricted boolean,
  p_message             text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor      public.users%ROWTYPE;
  v_target     public.users%ROWTYPE;
  v_actor_main boolean;
  v_was        boolean;
  v_msg        text;
BEGIN
  IF p_user_id IS NULL OR p_actor_admin_id IS NULL OR p_restricted IS NULL OR p_expected_restricted IS NULL THEN
    RAISE EXCEPTION 'admin_set_member_access_restriction: parametre null' USING ERRCODE = 'UY003';
  END IF;
  v_msg := public.member_access_message_normalize(p_message);
  -- Mesaj yalnız Pasif Yap ile birlikte verilir (Aktif Yap mesajı her zaman temizler).
  IF v_msg IS NOT NULL AND NOT p_restricted THEN
    RAISE EXCEPTION 'admin_set_member_access_restriction: mesaj yalniz pasiflestirmede' USING ERRCODE = 'UY003';
  END IF;
  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_admin_id;
  IF NOT FOUND OR lower(btrim(coalesce(v_actor.role, ''))) <> 'admin' OR v_actor.active IS NOT TRUE
     OR v_actor.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'admin_set_member_access_restriction: yetkisiz aktor' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = p_actor_admin_id THEN
    RAISE EXCEPTION 'admin_set_member_access_restriction: kendi hesabi' USING ERRCODE = 'UY003';
  END IF;
  v_actor_main := coalesce(v_actor.is_super_admin, false);

  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_set_member_access_restriction: kullanici bulunamadi' USING ERRCODE = 'UY003';
  END IF;

  v_was := v_target.access_restricted_at IS NOT NULL;
  IF v_was IS DISTINCT FROM p_expected_restricted THEN
    RAISE EXCEPTION 'admin_set_member_access_restriction: guncel durum degismis (beklenen=%, gercek=%)',
      p_expected_restricted, v_was USING ERRCODE = 'UY001';
  END IF;
  IF v_target.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'admin_set_member_access_restriction: hesap arsivde' USING ERRCODE = 'UY005';
  END IF;
  IF lower(btrim(coalesce(v_target.role, ''))) <> 'expert' THEN
    RAISE EXCEPTION 'admin_set_member_access_restriction: yalniz uzman' USING ERRCODE = 'UY002';
  END IF;

  -- Değişiklik yok → idempotent; audit YAZILMAZ; mesaj DEĞİŞMEZ (düzenleme ayrı RPC ile).
  IF v_was = p_restricted THEN
    RETURN jsonb_build_object('ok', true, 'restricted', v_was, 'changed', false);
  END IF;

  IF p_restricted THEN
    IF v_target.active IS NOT TRUE THEN
      RAISE EXCEPTION 'admin_set_member_access_restriction: giris kapali hesap kisitlanamaz' USING ERRCODE = 'UY002';
    END IF;
    IF lower(btrim(coalesce(v_target.approval_status, ''))) NOT IN ('approved', '') THEN
      RAISE EXCEPTION 'admin_set_member_access_restriction: onaysiz uzman' USING ERRCODE = 'UY002';
    END IF;
    -- Kısıt + kişiye özel mesaj TEK UPDATE (tek işlem).
    UPDATE public.users SET access_restricted_at = now(), access_restriction_message = v_msg WHERE id = p_user_id;
  ELSE
    -- Aktif Yap: kısıt ve kişiye özel mesaj BİRLİKTE temizlenir; başka hiçbir alan değişmez (ek yetki yok).
    UPDATE public.users SET access_restricted_at = NULL, access_restriction_message = NULL WHERE id = p_user_id;
  END IF;

  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value, context)
  VALUES
    (p_actor_admin_id, v_actor_main, p_user_id,
     CASE WHEN p_restricted THEN 'user_access_restricted' ELSE 'user_access_unrestricted' END,
     jsonb_build_object('access_restricted', v_was, 'active', v_target.active,
                        'message', v_target.access_restriction_message),
     jsonb_build_object('access_restricted', p_restricted, 'active', v_target.active,
                        'message', CASE WHEN p_restricted THEN v_msg END),
     jsonb_build_object('restricted_since', v_target.access_restricted_at, 'sessions_revoked', 0));

  RETURN jsonb_build_object('ok', true, 'restricted', p_restricted, 'changed', true,
                            'message_set', p_restricted AND v_msg IS NOT NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_member_access_restriction(uuid, uuid, boolean, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_member_access_restriction(uuid, uuid, boolean, boolean, text) TO service_role;

-- ── 5) Mesajı sonradan düzenle / kaldır ──────────────────────────────────────
-- p_expected_message: yöneticinin ekranda gördüğü mevcut metin (yoksa NULL) — farklıysa UY001 (hiçbir satır değişmez).
CREATE OR REPLACE FUNCTION public.admin_set_member_access_message(
  p_user_id          uuid,
  p_actor_admin_id   uuid,
  p_message          text,
  p_expected_message text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor      public.users%ROWTYPE;
  v_target     public.users%ROWTYPE;
  v_actor_main boolean;
  v_msg        text;
  v_expected   text;
BEGIN
  IF p_user_id IS NULL OR p_actor_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin_set_member_access_message: parametre null' USING ERRCODE = 'UY003';
  END IF;
  v_msg := public.member_access_message_normalize(p_message);
  v_expected := nullif(p_expected_message, '');
  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_admin_id;
  IF NOT FOUND OR lower(btrim(coalesce(v_actor.role, ''))) <> 'admin' OR v_actor.active IS NOT TRUE
     OR v_actor.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'admin_set_member_access_message: yetkisiz aktor' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = p_actor_admin_id THEN
    RAISE EXCEPTION 'admin_set_member_access_message: kendi hesabi' USING ERRCODE = 'UY003';
  END IF;
  v_actor_main := coalesce(v_actor.is_super_admin, false);

  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_set_member_access_message: kullanici bulunamadi' USING ERRCODE = 'UY003';
  END IF;
  IF v_target.access_restriction_message IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'admin_set_member_access_message: guncel mesaj degismis' USING ERRCODE = 'UY001';
  END IF;
  IF v_target.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'admin_set_member_access_message: hesap arsivde' USING ERRCODE = 'UY005';
  END IF;
  IF lower(btrim(coalesce(v_target.role, ''))) <> 'expert' THEN
    RAISE EXCEPTION 'admin_set_member_access_message: yalniz uzman' USING ERRCODE = 'UY002';
  END IF;
  IF v_target.access_restricted_at IS NULL THEN
    RAISE EXCEPTION 'admin_set_member_access_message: yalniz pasif uzman' USING ERRCODE = 'UY002';
  END IF;

  IF v_target.access_restriction_message IS NOT DISTINCT FROM v_msg THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'message_set', v_msg IS NOT NULL);
  END IF;

  UPDATE public.users SET access_restriction_message = v_msg WHERE id = p_user_id;

  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value, context)
  VALUES
    (p_actor_admin_id, v_actor_main, p_user_id,
     CASE WHEN v_msg IS NULL THEN 'user_access_message_cleared' ELSE 'user_access_message_set' END,
     jsonb_build_object('message', v_target.access_restriction_message),
     jsonb_build_object('message', v_msg),
     jsonb_build_object('restricted_since', v_target.access_restricted_at));

  RETURN jsonb_build_object('ok', true, 'changed', true, 'message_set', v_msg IS NOT NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_member_access_message(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_member_access_message(uuid, uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
