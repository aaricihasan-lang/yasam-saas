-- =============================================================================
-- ÜYE PASİFLEŞTİRME F2 — ESKİ "GİRİŞİ KAPALI" HESABI YENİ "PASİF"E GEÇİRME · TASLAK (migration DEĞİL)
-- =============================================================================
-- YALNIZ OWNER'IN HESAP HESAP ONAYLADIĞI kimlikler için. Toplu / otomatik geçiş YOKTUR.
-- Etki: seçilen hesapta giriş AÇILIR ama tüm modüller kilitli kalır (active=true + access_restricted_at).
--   Tek UPDATE ile iki alan birlikte yazılır → hesabın kısıtsız aktif olduğu bir an YOKTUR.
--   Paket, deneme, modül, ödeme ve onay alanlarına dokunulmaz. Hiçbir satır silinmez. Oturum açılmaz.
-- Ön koşul: 20280126000000 uygulanmış VE F3 kodu (üyelik kapısında kısıt) production'da. Aksi halde kısıt
--   uygulanmaz ve hesap TAM erişimle açılır → betik F3 işaret kontrolü ister (aşağıda v_f3_live).
-- Varsayılan son satır ROLLBACK'tir; sonuç doğrulandıktan sonra Owner ayrıca COMMIT kararı verir.
--
-- DOLDURULACAKLAR:
--   v_actor   : işlemi yapan ANA YÖNETİCİ kimliği
--   v_ids     : Owner'ın onayladığı uzman kimlikleri (legacy-passive-readonly.sql 2. sorgusundan)
--   v_f3_live : F3 kodu canlıda doğrulandıysa true
-- =============================================================================

BEGIN;

DO $conv$
DECLARE
  v_actor   uuid   := NULL;                       -- DOLDUR
  v_ids     uuid[] := ARRAY[]::uuid[];            -- DOLDUR
  v_f3_live boolean := false;                     -- DOLDUR (F3 canlıda doğrulandıysa true)
  v_bad     int;
  v_n       int;
BEGIN
  IF NOT v_f3_live THEN
    RAISE EXCEPTION 'gecis: F3 kodu canlida dogrulanmadan calistirilamaz (kisit uygulanmaz, hesap tam erisimle acilir)';
  END IF;
  IF v_actor IS NULL OR coalesce(array_length(v_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'gecis: aktor ve en az bir kimlik gerekli';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_actor AND lower(btrim(coalesce(role, ''))) = 'admin'
                   AND active IS TRUE AND archived_at IS NULL AND coalesce(is_super_admin, false)) THEN
    RAISE EXCEPTION 'gecis: aktor aktif ana yonetici degil' USING ERRCODE = '42501';
  END IF;

  -- Hedef satırlar kilitlenir; listedeki HER kimlik uygun olmalı (biri bile uygun değilse hiçbir şey değişmez).
  PERFORM 1 FROM public.users WHERE id = ANY (v_ids) FOR UPDATE;
  SELECT count(*) INTO v_bad
    FROM unnest(v_ids) AS x(id)
    LEFT JOIN public.users u ON u.id = x.id
   WHERE u.id IS NULL
      OR lower(btrim(coalesce(u.role, ''))) <> 'expert'
      OR lower(btrim(coalesce(u.approval_status, ''))) NOT IN ('approved', '')
      OR u.active IS TRUE
      OR u.archived_at IS NOT NULL
      OR coalesce(u.is_demo_account, false);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'gecis: % kimlik uygun degil (bulunamadi / uzman degil / onaysiz / zaten acik / arsivde / demo); hicbir satir degismedi', v_bad;
  END IF;

  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value, context)
  SELECT v_actor, true, u.id, 'user_access_restricted',
         jsonb_build_object('access_restricted', false, 'active', false),
         jsonb_build_object('access_restricted', true, 'active', true),
         jsonb_build_object('legacy_conversion', true, 'login_opened', true)
    FROM public.users u WHERE u.id = ANY (v_ids);

  UPDATE public.users
     SET active = true, access_restricted_at = now()
   WHERE id = ANY (v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'gecis: % hesap giris_kapali -> pasif', v_n;
END
$conv$;

-- Doğrulama: seçilen hesapların durumu "pasif" olmalı.
-- SELECT id, public.member_account_state(active, archived_at, access_restricted_at) FROM public.users WHERE id = ANY (ARRAY[...]::uuid[]);

ROLLBACK;  -- Owner doğruladıktan sonra AYRI KARARLA COMMIT
