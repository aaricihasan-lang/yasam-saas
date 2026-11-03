-- Gökyüzü Atlası — TEKNİK BAZLI İZİNLER (owner kararı 2026-11-03).
--
--   1) users.astrology_technique_grants jsonb NULL (+ biçim CHECK):
--        {"mode":"all"}                                → yayımlanmış bütün teknikler (ileride yayımlananlar dahil)
--        {"mode":"list","techniques":["western.natal"]} → yalnız listelenenler (1..64, tekrar yok)
--        NULL                                         → hiçbir teknik (fail-closed)
--      Anahtar KATALOĞU uygulama katmanındadır (lib/astrology/access/techniqueGrants.ts); DB yalnız biçimi doğrular.
--   2) admin_set_astrology_technique_grants(user, actor, grants, enable_module):
--        Teknik izinleri ve (isteğe bağlı) Astroloji modül anahtarı TEK işlemde, hedef satır FOR UPDATE kilidi altında yazılır
--        → kısmi kayıt / tutarsız yetki oluşmaz. Yalnız aktif admin aktör, yalnız uzman hedef. Denetim kaydı AYNI işlemde:
--        mevcut 'module_enabled' / 'module_disabled' eylemleri (admin_audit_action_chk DEĞİŞMEZ) —
--        modül açılışı: {"modules":["astrology"]}; teknik farkı: {"scope":"astrology_techniques","techniques":[…],"count":n}
--        ("*" = tümü modu).
--   2b) admin_approve_expert_with_astrology / admin_create_user_with_modules_astrology: Astroloji seçili onay ve Yeni Uzman
--      kaydı mevcut fonksiyonlarla + teknik izinleriyle TEK işlemde (mevcut fonksiyonlar değişmez).
--   3) GERİYE DÖNÜK KORUMA (backfill): Astroloji modülü bugün açık olan her uzmana {"mode":"all"} yazılır (yalnız NULL olanlara).
--      Modülü kapalı uzmanlara yazılmaz. Başka kolon / tablo / kayıt değişmez.
--
-- users üzerinde tetikleyici yok (prod salt-okunur kontrol 2026-11-03); anon/authenticated users'a yetkili değil.
-- İDEMPOTENT: IF NOT EXISTS / CREATE OR REPLACE / kısıt pg_constraint kontrollü / backfill yalnız NULL satırlar.

-- ── 1) Kolon + biçim doğrulayıcı ─────────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS astrology_technique_grants jsonb;

CREATE OR REPLACE FUNCTION public.astrology_technique_grants_is_valid(p jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT CASE
    WHEN p IS NULL OR jsonb_typeof(p) <> 'object' THEN false
    WHEN p = '{"mode":"all"}'::jsonb THEN true
    WHEN p->>'mode' IS DISTINCT FROM 'list' THEN false
    WHEN (SELECT count(*) FROM jsonb_object_keys(p)) <> 2 THEN false
    WHEN jsonb_typeof(p->'techniques') IS DISTINCT FROM 'array' THEN false
    WHEN jsonb_array_length(p->'techniques') NOT BETWEEN 1 AND 64 THEN false
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(p->'techniques') e WHERE jsonb_typeof(e) <> 'string') THEN false
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(p->'techniques') e WHERE e !~ '^[a-z]{2,10}\.[a-z_]{2,40}$') THEN false
    ELSE (SELECT count(DISTINCT e) FROM jsonb_array_elements_text(p->'techniques') e) = jsonb_array_length(p->'techniques')
  END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_astrology_technique_grants_chk') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_astrology_technique_grants_chk
      CHECK (astrology_technique_grants IS NULL OR public.astrology_technique_grants_is_valid(astrology_technique_grants));
  END IF;
END $$;

-- ── 2) Atomik kayıt fonksiyonu ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_astrology_technique_grants(
  p_user_id        uuid,
  p_actor_admin_id uuid,
  p_grants         jsonb,
  p_enable_module  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor      public.users%ROWTYPE;
  v_target     public.users%ROWTYPE;
  v_actor_main boolean;
  v_old_perms  jsonb;
  v_new_perms  jsonb;
  v_module_was boolean;
  v_old_list   text[];
  v_new_list   text[];
  v_added      text[];
  v_removed    text[];
BEGIN
  IF p_user_id IS NULL OR p_actor_admin_id IS NULL OR p_enable_module IS NULL THEN
    RAISE EXCEPTION 'admin_set_astrology_technique_grants: eksik parametre' USING ERRCODE = 'UY003';
  END IF;
  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_admin_id;
  IF NOT FOUND OR lower(coalesce(v_actor.role,'')) <> 'admin' OR v_actor.active IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_set_astrology_technique_grants: yetkisiz aktor';
  END IF;
  v_actor_main := coalesce(v_actor.is_super_admin, false);

  IF NOT public.astrology_technique_grants_is_valid(p_grants) THEN
    RAISE EXCEPTION 'admin_set_astrology_technique_grants: gecersiz teknik izinleri' USING ERRCODE = 'UY003';
  END IF;

  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_set_astrology_technique_grants: kullanici bulunamadi' USING ERRCODE = 'UY003';
  END IF;
  IF lower(coalesce(v_target.role,'')) <> 'expert' THEN
    RAISE EXCEPTION 'admin_set_astrology_technique_grants: hedef uzman degil' USING ERRCODE = 'UY002';
  END IF;

  v_old_perms := coalesce(v_target.module_permissions, '{}'::jsonb);
  IF jsonb_typeof(v_old_perms) <> 'object' THEN v_old_perms := '{}'::jsonb; END IF;
  v_module_was := coalesce((v_old_perms -> 'astrology') = 'true'::jsonb, false);
  v_new_perms := CASE WHEN p_enable_module AND NOT v_module_was THEN v_old_perms || '{"astrology": true}'::jsonb ELSE v_old_perms END;

  v_old_list := CASE
    WHEN v_target.astrology_technique_grants IS NULL THEN '{}'::text[]
    WHEN v_target.astrology_technique_grants->>'mode' = 'all' THEN ARRAY['*']
    ELSE ARRAY(SELECT jsonb_array_elements_text(v_target.astrology_technique_grants->'techniques'))
  END;
  v_new_list := CASE
    WHEN p_grants->>'mode' = 'all' THEN ARRAY['*']
    ELSE ARRAY(SELECT jsonb_array_elements_text(p_grants->'techniques'))
  END;
  v_added   := ARRAY(SELECT x FROM unnest(v_new_list) x EXCEPT SELECT y FROM unnest(v_old_list) y ORDER BY 1);
  v_removed := ARRAY(SELECT y FROM unnest(v_old_list) y EXCEPT SELECT x FROM unnest(v_new_list) x ORDER BY 1);

  UPDATE public.users
     SET astrology_technique_grants = p_grants,
         module_permissions = v_new_perms
   WHERE id = p_user_id;

  IF p_enable_module AND NOT v_module_was THEN
    INSERT INTO public.admin_audit_log (actor_admin_id, actor_is_main_admin, target_user_id, action, context)
    VALUES (p_actor_admin_id, v_actor_main, p_user_id, 'module_enabled',
            jsonb_build_object('modules', to_jsonb(ARRAY['astrology']), 'count', 1));
  END IF;
  IF coalesce(array_length(v_added, 1), 0) > 0 THEN
    INSERT INTO public.admin_audit_log (actor_admin_id, actor_is_main_admin, target_user_id, action, context)
    VALUES (p_actor_admin_id, v_actor_main, p_user_id, 'module_enabled',
            jsonb_build_object('scope', 'astrology_techniques', 'techniques', to_jsonb(v_added), 'count', array_length(v_added, 1)));
  END IF;
  IF coalesce(array_length(v_removed, 1), 0) > 0 THEN
    INSERT INTO public.admin_audit_log (actor_admin_id, actor_is_main_admin, target_user_id, action, context)
    VALUES (p_actor_admin_id, v_actor_main, p_user_id, 'module_disabled',
            jsonb_build_object('scope', 'astrology_techniques', 'techniques', to_jsonb(v_removed), 'count', array_length(v_removed, 1)));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'grants', p_grants,
    'module_enabled', coalesce((v_new_perms -> 'astrology') = 'true'::jsonb, false),
    'module_permissions', v_new_perms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.astrology_technique_grants_is_valid(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.astrology_technique_grants_is_valid(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.admin_set_astrology_technique_grants(uuid, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_astrology_technique_grants(uuid, uuid, jsonb, boolean) TO service_role;

-- ── 2b) Onay / Yeni Uzman: Astroloji seçiliyse teknik izinleri AYNI işlemde ───────────────
-- Mevcut admin_approve_expert_with_modules / admin_create_user_with_modules DEĞİŞMEZ (diğer modüllerin onay akışı aynen).
-- Astroloji seçili onay / oluşturma YALNIZ bu sarmalayıcılarla yapılır (route kuralı): teknik seçimi olmadan Astroloji
-- erişimi etkinleşmez; herhangi bir adım hata verirse onay / oluşturma dahil HİÇBİR şey yazılmaz.
CREATE OR REPLACE FUNCTION public.admin_approve_expert_with_astrology(
  p_user_id           uuid,
  p_membership        jsonb,
  p_actor_admin_id    uuid,
  p_modules           jsonb,
  p_remove_keys       text[],
  p_expected_approval text,
  p_astrology_grants  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v jsonb;
BEGIN
  IF p_modules IS NULL OR jsonb_typeof(p_modules) <> 'object' OR (p_modules -> 'astrology') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'admin_approve_expert_with_astrology: astroloji secili degil' USING ERRCODE = 'UY003';
  END IF;
  IF NOT public.astrology_technique_grants_is_valid(p_astrology_grants) THEN
    RAISE EXCEPTION 'admin_approve_expert_with_astrology: gecersiz teknik izinleri' USING ERRCODE = 'UY003';
  END IF;
  v := public.admin_approve_expert_with_modules(p_user_id, p_membership, p_actor_admin_id, p_modules, p_remove_keys, p_expected_approval);
  PERFORM public.admin_set_astrology_technique_grants(p_user_id, p_actor_admin_id, p_astrology_grants, false);
  RETURN coalesce(v, '{}'::jsonb) || jsonb_build_object('astrology_grants', p_astrology_grants);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_user_with_modules_astrology(
  p_payload          jsonb,
  p_membership       jsonb,
  p_modules          jsonb,
  p_remove_keys      text[],
  p_astrology_grants jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v jsonb;
BEGIN
  IF p_modules IS NULL OR jsonb_typeof(p_modules) <> 'object' OR (p_modules -> 'astrology') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'admin_create_user_with_modules_astrology: astroloji secili degil' USING ERRCODE = 'UY003';
  END IF;
  IF NOT public.astrology_technique_grants_is_valid(p_astrology_grants) THEN
    RAISE EXCEPTION 'admin_create_user_with_modules_astrology: gecersiz teknik izinleri' USING ERRCODE = 'UY003';
  END IF;
  v := public.admin_create_user_with_modules(p_payload, p_membership, p_modules, p_remove_keys);
  IF v->>'outcome' = 'provisioned' THEN
    PERFORM public.admin_set_astrology_technique_grants((v->>'user_id')::uuid, (p_payload->>'actor_admin_id')::uuid, p_astrology_grants, false);
  END IF;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_expert_with_astrology(uuid, jsonb, uuid, jsonb, text[], text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_expert_with_astrology(uuid, jsonb, uuid, jsonb, text[], text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.admin_create_user_with_modules_astrology(jsonb, jsonb, jsonb, text[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_user_with_modules_astrology(jsonb, jsonb, jsonb, text[], jsonb) TO service_role;

-- ── 3) Geriye dönük koruma: bugün Astroloji'si açık uzmanlar → tüm teknikler ────────
UPDATE public.users
   SET astrology_technique_grants = '{"mode":"all"}'::jsonb
 WHERE lower(coalesce(role, '')) = 'expert'
   AND module_permissions -> 'astrology' = 'true'::jsonb
   AND astrology_technique_grants IS NULL;

NOTIFY pgrst, 'reload schema';
