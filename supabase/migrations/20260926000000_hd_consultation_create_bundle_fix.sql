-- =============================================================================
-- 20260926000000_hd_consultation_create_bundle_fix.sql
--
-- HUMAN DESIGN — DANIŞMANLIK KATMANI · F1.1 · ATOMİK CREATE BUNDLE DÜZELTMESİ
--
-- BLOCKER: 20260925000000'deki rpc_hd_consultation_create, p_evidence[].section_id
--   ile aynı çağrıda üretilen section UUID'lerini referanslayamıyordu → evidence'ın
--   create içinde bundle'lanması pratikte kullanılamıyordu.
--
-- DÜZELTME (additif; merged migration DEĞİŞTİRİLMEZ): create RPC'yi NESTED child
--   sözleşmesiyle yeniden tanımlar. İstemci DB section UUID'si GÖNDERMEZ; her
--   section payload'ında çağrı-içi benzersiz `client_ref` bulunur. RPC section'ı
--   INSERT ... RETURNING id ile oluşturur ve dönen GERÇEK uuid'yi yalnız DB içinde
--   nested questions/conditions/evidence'a bağlar. Sonuçta client_ref→section_id
--   eşlemesi + sayımlar döner. Böylece content + sections + questions + conditions
--   + evidence + audit TEK transaction + TEK create çağrısıyla atomik oluşturulur.
--
-- OVERLOAD YOK: eski 8-parametreli imza DROP edilir; tek canonical yeni 7-parametreli
--   imza kalır. EXECUTE yalnız service_role; public/anon/authenticated REVOKE.
--   SECURITY DEFINER + SET search_path=public korunur. Dinamik SQL YOK.
--
-- KORUNAN GÜVENLİK KAPILARI: actor_admin_id ayrı güvenilir parametre (payload'da
--   DEĞİL); canonical entity DB'den; canonical version DB'den authoritative;
--   canonical hash txn içinde DB'de hesaplanır (hd_consultation_canonical_hash +
--   FOR SHARE); status başlangıçta draft; audit tam metin içermez (yalnız sayım).
--   update/publish/archive/entitlement RPC'leri ve 9 tablo DOKUNULMAZ.
--
-- KAPSAM DIŞI: production apply, DML/seed, mevcut veri değişimi, engine, legacy
--   human_design_reports, API/UI/Word. destructive DROP TABLE YOK.
-- =============================================================================

BEGIN;

-- Eski hatalı create sözleşmesini kaldır (overload bırakmamak için).
DROP FUNCTION public.rpc_hd_consultation_create(uuid, uuid, uuid, boolean, jsonb, jsonb, jsonb, jsonb);

-- Atomik NESTED create. p_sections[] her elemanı:
--   { client_ref, section_kind, body_text, usage_scope, topic_scope?, sort_order?,
--     status?, questions:[{question_text,topic_scope?,sort_order?}],
--     conditions:[{condition_kind,condition_value,sort_order?}],
--     evidence:[{passage_id,relation_type,is_primary?,is_single_source?,editorial_note?,sort_order?}] }
-- p_content_questions / p_content_conditions: section'sız (content düzeyi) çocuklar.
CREATE OR REPLACE FUNCTION public.rpc_hd_consultation_create(
  p_actor_admin_id       uuid,
  p_entity_id            uuid,
  p_canonical_content_id uuid,
  p_is_ai_generated      boolean,
  p_sections             jsonb,
  p_content_questions    jsonb,
  p_content_conditions   jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_kind      text;
  v_key       text;
  v_content   uuid;
  v_ccver     integer;
  v_cchash    text;
  v_sec       jsonb;
  v_child     jsonb;
  v_sec_id    uuid;
  v_ref       text;
  v_refs      text[] := ARRAY[]::text[];
  v_map       jsonb  := '[]'::jsonb;
  v_n_sec int := 0; v_n_q int := 0; v_n_c int := 0; v_n_e int := 0;
BEGIN
  IF p_actor_admin_id IS NULL THEN RAISE EXCEPTION 'actor_admin_id zorunlu (guard sonucu).'; END IF;

  -- entity_kind/canonical_key canonical entity'den (payload'dan DEĞİL)
  SELECT entity_kind, canonical_key INTO v_kind, v_key
    FROM public.hd_canonical_entities WHERE id = p_entity_id;
  IF v_kind IS NULL THEN RAISE EXCEPTION 'canonical entity bulunamadı: %', p_entity_id; END IF;

  -- canonical iz: version DB'den authoritative, hash txn içinde DB'de hesaplanır
  IF p_canonical_content_id IS NOT NULL THEN
    SELECT version INTO v_ccver FROM public.hd_canonical_content
      WHERE id = p_canonical_content_id AND entity_id = p_entity_id FOR SHARE;
    IF v_ccver IS NULL THEN RAISE EXCEPTION 'canonical içerik/entity eşleşmiyor.'; END IF;
    v_cchash := public.hd_consultation_canonical_hash(p_canonical_content_id);
  END IF;

  INSERT INTO public.hd_consultation_contents (
    entity_id, entity_kind, canonical_key, canonical_content_id,
    canonical_content_version, canonical_content_hash, status, version, is_ai_generated
  ) VALUES (
    p_entity_id, v_kind, v_key, p_canonical_content_id,
    v_ccver, v_cchash, 'draft', 1, COALESCE(p_is_ai_generated, false)
  ) RETURNING id INTO v_content;

  -- SECTIONS (nested children) --------------------------------------------------
  FOR v_sec IN SELECT * FROM jsonb_array_elements(COALESCE(p_sections, '[]'::jsonb)) LOOP
    v_ref := btrim(COALESCE(v_sec->>'client_ref', ''));
    IF v_ref = '' THEN RAISE EXCEPTION 'section client_ref zorunlu (trim boş olamaz).'; END IF;
    IF v_ref = ANY(v_refs) THEN RAISE EXCEPTION 'çağrı içinde duplicate client_ref: %', v_ref; END IF;
    v_refs := v_refs || v_ref;

    -- section INSERT ... RETURNING id → gerçek DB uuid (istemci göndermez/spoof edemez)
    INSERT INTO public.hd_consultation_sections
      (content_id, section_kind, body_text, topic_scope, usage_scope, status, sort_order)
    VALUES (
      v_content, v_sec->>'section_kind', v_sec->>'body_text',
      NULLIF(v_sec->>'topic_scope', ''), v_sec->>'usage_scope',
      COALESCE(v_sec->>'status', 'draft'), COALESCE((v_sec->>'sort_order')::int, 0)
    ) RETURNING id INTO v_sec_id;   -- CHECK/unique ihlali → tüm txn ROLLBACK
    v_n_sec := v_n_sec + 1;
    v_map := v_map || jsonb_build_object('client_ref', v_ref, 'section_id', v_sec_id);

    -- nested questions (section düzeyi)
    FOR v_child IN SELECT * FROM jsonb_array_elements(COALESCE(v_sec->'questions', '[]'::jsonb)) LOOP
      INSERT INTO public.hd_consultation_questions (content_id, section_id, question_text, topic_scope, sort_order)
      VALUES (v_content, v_sec_id, v_child->>'question_text', NULLIF(v_child->>'topic_scope', ''),
              COALESCE((v_child->>'sort_order')::int, 0));
      v_n_q := v_n_q + 1;
    END LOOP;

    -- nested conditions (canonical registry ile doğrulanır)
    FOR v_child IN SELECT * FROM jsonb_array_elements(COALESCE(v_sec->'conditions', '[]'::jsonb)) LOOP
      IF (v_child->>'condition_kind') NOT IN ('type_is','authority_is','has_channel','has_gate') THEN
        RAISE EXCEPTION 'geçersiz condition_kind: %', v_child->>'condition_kind';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.hd_canonical_entities e
        WHERE e.canonical_key = v_child->>'condition_value'
          AND e.entity_kind = CASE (v_child->>'condition_kind')
            WHEN 'type_is' THEN 'tip' WHEN 'authority_is' THEN 'otorite'
            WHEN 'has_channel' THEN 'kanal' WHEN 'has_gate' THEN 'kapi' END
      ) THEN RAISE EXCEPTION 'condition_value canonical registry ile doğrulanamadı: %', v_child->>'condition_value'; END IF;
      INSERT INTO public.hd_consultation_conditions (content_id, section_id, condition_kind, condition_value, sort_order)
      VALUES (v_content, v_sec_id, v_child->>'condition_kind', v_child->>'condition_value',
              COALESCE((v_child->>'sort_order')::int, 0));
      v_n_c := v_n_c + 1;
    END LOOP;

    -- nested evidence (section düzeyi — GERÇEK v_sec_id'ye bağlanır; passage FK RESTRICT)
    FOR v_child IN SELECT * FROM jsonb_array_elements(COALESCE(v_sec->'evidence', '[]'::jsonb)) LOOP
      INSERT INTO public.hd_consultation_evidence
        (content_id, section_id, passage_id, relation_type, is_primary, is_single_source, editorial_note, sort_order)
      VALUES (
        v_content, v_sec_id, (v_child->>'passage_id')::uuid, v_child->>'relation_type',
        COALESCE((v_child->>'is_primary')::boolean, false), COALESCE((v_child->>'is_single_source')::boolean, false),
        NULLIF(v_child->>'editorial_note', ''), COALESCE((v_child->>'sort_order')::int, 0)
      );
      v_n_e := v_n_e + 1;
    END LOOP;
  END LOOP;

  -- CONTENT-DÜZEYİ questions (section_id NULL) ----------------------------------
  FOR v_child IN SELECT * FROM jsonb_array_elements(COALESCE(p_content_questions, '[]'::jsonb)) LOOP
    INSERT INTO public.hd_consultation_questions (content_id, section_id, question_text, topic_scope, sort_order)
    VALUES (v_content, NULL, v_child->>'question_text', NULLIF(v_child->>'topic_scope', ''),
            COALESCE((v_child->>'sort_order')::int, 0));
    v_n_q := v_n_q + 1;
  END LOOP;

  -- CONTENT-DÜZEYİ conditions (section_id NULL) --------------------------------
  FOR v_child IN SELECT * FROM jsonb_array_elements(COALESCE(p_content_conditions, '[]'::jsonb)) LOOP
    IF (v_child->>'condition_kind') NOT IN ('type_is','authority_is','has_channel','has_gate') THEN
      RAISE EXCEPTION 'geçersiz condition_kind: %', v_child->>'condition_kind';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.hd_canonical_entities e
      WHERE e.canonical_key = v_child->>'condition_value'
        AND e.entity_kind = CASE (v_child->>'condition_kind')
          WHEN 'type_is' THEN 'tip' WHEN 'authority_is' THEN 'otorite'
          WHEN 'has_channel' THEN 'kanal' WHEN 'has_gate' THEN 'kapi' END
    ) THEN RAISE EXCEPTION 'condition_value canonical registry ile doğrulanamadı: %', v_child->>'condition_value'; END IF;
    INSERT INTO public.hd_consultation_conditions (content_id, section_id, condition_kind, condition_value, sort_order)
    VALUES (v_content, NULL, v_child->>'condition_kind', v_child->>'condition_value',
            COALESCE((v_child->>'sort_order')::int, 0));
    v_n_c := v_n_c + 1;
  END LOOP;

  -- AUDIT (aynı txn; başarısızsa tüm işlem rollback; tam metin YOK, yalnız sayım)
  INSERT INTO public.hd_content_audit_events
    (actor_admin_id, action, resource_kind, resource_id, canonical_entity_id, canonical_key, changed_fields, context)
  VALUES (
    p_actor_admin_id, 'created', 'consultation_content', v_content, p_entity_id, v_key,
    ARRAY['content','sections','questions','conditions','evidence'],
    jsonb_build_object('section_count', v_n_sec, 'question_count', v_n_q, 'condition_count', v_n_c, 'evidence_count', v_n_e)
  );

  -- Deterministik sonuç: kimlikler + mapping + sayımlar (tam body/source metni YOK)
  RETURN jsonb_build_object(
    'content_id', v_content,
    'version', 1,
    'section_map', v_map,
    'section_count', v_n_sec,
    'question_count', v_n_q,
    'condition_count', v_n_c,
    'evidence_count', v_n_e
  );
END
$fn$;

-- EXECUTE ACL (yeni imza): public/anon/authenticated REVOKE → yalnız service_role.
REVOKE ALL ON FUNCTION public.rpc_hd_consultation_create(uuid,uuid,uuid,boolean,jsonb,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hd_consultation_create(uuid,uuid,uuid,boolean,jsonb,jsonb,jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hd_consultation_create(uuid,uuid,uuid,boolean,jsonb,jsonb,jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hd_consultation_create(uuid,uuid,uuid,boolean,jsonb,jsonb,jsonb) TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma; beklenen):
--   SELECT count(*) FROM pg_proc WHERE proname='rpc_hd_consultation_create';  -- 1 (overload yok)
--   has_function_privilege('anon','public.rpc_hd_consultation_create(uuid,uuid,uuid,boolean,jsonb,jsonb,jsonb)','EXECUTE'); -- false
--   has_function_privilege('service_role', <yeni imza>, 'EXECUTE'); -- true
-- ROLLBACK: destructive DOWN YOK; manuel geri alma = yeni create DROP + eski 8-param
--   create'i 20260925'ten yeniden oluştur. Mevcut tablo/veri ETKİLENMEZ.
-- =============================================================================
