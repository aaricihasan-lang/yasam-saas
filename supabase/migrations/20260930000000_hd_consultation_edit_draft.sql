-- =============================================================================
-- 20260930000000_hd_consultation_edit_draft.sql
--
-- HUMAN DESIGN — DANIŞMANLIK KATMANI · F2.1 · DRAFT GÖVDE DÜZENLEME (ATOMİK)
--
-- BLOCKER (F2 canlı UAT): F1 sözleşmesinde danışmanlık gövdesi (sections +
--   questions + conditions + evidence) yalnız create-bundle içinde tek seferlik
--   yazılabiliyordu; oluşturulduktan sonra bölüm metni/soru/koşul/kanıt
--   DEĞİŞTİRİLEMİYORDU (bölüm-düzeyi mutation RPC yok). Gerçek profesyonel
--   authoring için taslak düzenleme zorunlu.
--
-- DÜZELTME (additif; mevcut migration/tablo/kolon/index DEĞİŞMEZ): TEK yeni
--   atomik RPC rpc_hd_consultation_edit_draft. YALNIZ status='draft' içerikte
--   çalışır. Content satırı FOR UPDATE kilitlenir, expected_version doğrulanır,
--   gövde (sections + nested questions/conditions/evidence + content-düzeyi
--   questions/conditions) TEK transaction içinde delete+reinsert ile yeniden
--   kurulur, content.version +1 artırılır, audit aynı txn'de yazılır. Herhangi
--   bir child/audit hatası → tüm işlem ROLLBACK.
--
-- F1.1 CREATE PARİTESİ: aynı NESTED sözleşme (section client_ref + nested
--   children; istemci DB section_id GÖNDERMEZ), aynı whitelist/registry/rights
--   CHECK'leri (CHECK constraint'ler + canonical registry doğrulaması + passage
--   FK RESTRICT + primary/kind unique index'ler). İKİNCİ bir doğrulama motoru
--   YAZILMAZ; create ile aynı DB kapıları kullanılır.
--
-- KORUNAN GÜVENLİK KAPILARI:
--   * actor_admin_id ayrı GÜVENİLİR parametre (payload'da DEĞİL).
--   * canonical pin (canonical_content_id/version/hash) DOKUNULMAZ — edit pin'i
--     değiştiremez; pin yalnız mevcut explicit repin (rpc_hd_consultation_update)
--     akışıyla değişir.
--   * published/archived → fail-loud RAISE (sessiz in-place edit YOK).
--   * content satırı SİLİNMEZ; content_id sabit; yalnız version +1.
--   * expert_notes güvenlik ağı: taslağa bağlı uzman notu varsa fail-loud RAISE
--     (RESTRICT FK zaten ikinci savunma; ama temiz stabil kod için önce kontrol).
--   * SECURITY DEFINER + SET search_path=public; dinamik SQL YOK; EXECUTE yalnız
--     service_role (public/anon/authenticated REVOKE). Browser service_role YOK.
--
-- KAPSAM DIŞI (KESİN): tablo/kolon/index/constraint DDL YOK; seed/DML/backfill
--   YOK; hd_cc_one_active_per_entity_uidx DEĞİŞTİRİLMEZ; published→new-draft
--   revision YOK; hd_consultation_canonical_hash ACL'sine DOKUNULMAZ; eski
--   migration'lar DEĞİŞTİRİLMEZ; engine/compute + legacy human_design_reports
--   ETKİLENMEZ; destructive DROP TABLE / DOWN YOK.
-- =============================================================================

BEGIN;

-- rpc_hd_consultation_edit_draft — DRAFT gövde yeniden kurma (atomik).
-- p_sections[] her elemanı (F1.1 create ile birebir):
--   { client_ref, section_kind, body_text, usage_scope, topic_scope?, sort_order?,
--     status?, questions:[{question_text,topic_scope?,sort_order?}],
--     conditions:[{condition_kind,condition_value,sort_order?}],
--     evidence:[{passage_id,relation_type,is_primary?,is_single_source?,editorial_note?,sort_order?}] }
-- p_content_questions / p_content_conditions: section'sız (content düzeyi) çocuklar.
CREATE OR REPLACE FUNCTION public.rpc_hd_consultation_edit_draft(
  p_actor_admin_id     uuid,
  p_content_id         uuid,
  p_expected_version   integer,
  p_sections           jsonb,
  p_content_questions  jsonb,
  p_content_conditions jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_cur      integer;
  v_status   text;
  v_entity   uuid;
  v_key      text;
  v_new      integer;
  v_sec      jsonb;
  v_child    jsonb;
  v_sec_id   uuid;
  v_ref      text;
  v_refs     text[] := ARRAY[]::text[];
  v_map      jsonb  := '[]'::jsonb;
  v_n_sec int := 0; v_n_q int := 0; v_n_c int := 0; v_n_e int := 0;
BEGIN
  IF p_actor_admin_id IS NULL THEN RAISE EXCEPTION 'actor_admin_id zorunlu (guard sonucu).'; END IF;

  -- Content satırını txn boyunca kilitle; kimlik + durum + versiyon oku.
  SELECT version, status, entity_id, canonical_key
    INTO v_cur, v_status, v_entity, v_key
    FROM public.hd_consultation_contents WHERE id = p_content_id FOR UPDATE;
  IF v_cur IS NULL THEN RAISE EXCEPTION 'içerik bulunamadı: %', p_content_id; END IF;

  -- Yalnız DRAFT düzenlenebilir (fail-loud; sessiz in-place edit YOK).
  IF v_status = 'archived' THEN RAISE EXCEPTION 'archived içerik düzenlenemez.'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'HD_CONSULTATION_NOT_DRAFT: yalnız taslak içerik düzenlenebilir (mevcut: %).', v_status; END IF;

  -- Stale / kör overwrite reddi (optimistic concurrency; content.version token).
  IF p_expected_version IS NULL OR p_expected_version <> v_cur THEN
    RAISE EXCEPTION 'stale version: beklenen %, mevcut %', p_expected_version, v_cur;
  END IF;

  -- Güvenlik ağı: taslağa bağlı uzman notu (tenant overlay) varsa gövdeyi
  -- yeniden kurmak notu RESTRICT ile bozardı → temiz stabil kodla fail-loud.
  -- (Pratikte taslağa uzman notu bağlanmaz; F4 write yolu henüz yok.)
  IF EXISTS (SELECT 1 FROM public.hd_consultation_expert_notes WHERE content_id = p_content_id) THEN
    RAISE EXCEPTION 'HD_CONSULTATION_HAS_EXPERT_NOTES: bu içeriğe bağlı uzman notu var; gövde yeniden kurulamaz.';
  END IF;

  -- Mevcut gövdeyi kaldır (content_id kapsamında; content satırı SİLİNMEZ).
  -- Yaprak → section sırası: evidence/questions/conditions önce, sonra sections.
  DELETE FROM public.hd_consultation_evidence   WHERE content_id = p_content_id;
  DELETE FROM public.hd_consultation_questions  WHERE content_id = p_content_id;
  DELETE FROM public.hd_consultation_conditions WHERE content_id = p_content_id;
  DELETE FROM public.hd_consultation_sections   WHERE content_id = p_content_id;

  -- SECTIONS (nested children) — F1.1 create ile birebir kurallar --------------
  FOR v_sec IN SELECT * FROM jsonb_array_elements(COALESCE(p_sections, '[]'::jsonb)) LOOP
    v_ref := btrim(COALESCE(v_sec->>'client_ref', ''));
    IF v_ref = '' THEN RAISE EXCEPTION 'section client_ref zorunlu (trim boş olamaz).'; END IF;
    IF v_ref = ANY(v_refs) THEN RAISE EXCEPTION 'çağrı içinde duplicate client_ref: %', v_ref; END IF;
    v_refs := v_refs || v_ref;

    INSERT INTO public.hd_consultation_sections
      (content_id, section_kind, body_text, topic_scope, usage_scope, status, sort_order)
    VALUES (
      p_content_id, v_sec->>'section_kind', v_sec->>'body_text',
      NULLIF(v_sec->>'topic_scope', ''), v_sec->>'usage_scope',
      COALESCE(v_sec->>'status', 'draft'), COALESCE((v_sec->>'sort_order')::int, 0)
    ) RETURNING id INTO v_sec_id;   -- CHECK/unique ihlali → tüm txn ROLLBACK
    v_n_sec := v_n_sec + 1;
    v_map := v_map || jsonb_build_object('client_ref', v_ref, 'section_id', v_sec_id);

    -- nested questions (section düzeyi)
    FOR v_child IN SELECT * FROM jsonb_array_elements(COALESCE(v_sec->'questions', '[]'::jsonb)) LOOP
      INSERT INTO public.hd_consultation_questions (content_id, section_id, question_text, topic_scope, sort_order)
      VALUES (p_content_id, v_sec_id, v_child->>'question_text', NULLIF(v_child->>'topic_scope', ''),
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
      VALUES (p_content_id, v_sec_id, v_child->>'condition_kind', v_child->>'condition_value',
              COALESCE((v_child->>'sort_order')::int, 0));
      v_n_c := v_n_c + 1;
    END LOOP;

    -- nested evidence (section düzeyi — GERÇEK v_sec_id'ye bağlanır; passage FK RESTRICT)
    FOR v_child IN SELECT * FROM jsonb_array_elements(COALESCE(v_sec->'evidence', '[]'::jsonb)) LOOP
      INSERT INTO public.hd_consultation_evidence
        (content_id, section_id, passage_id, relation_type, is_primary, is_single_source, editorial_note, sort_order)
      VALUES (
        p_content_id, v_sec_id, (v_child->>'passage_id')::uuid, v_child->>'relation_type',
        COALESCE((v_child->>'is_primary')::boolean, false), COALESCE((v_child->>'is_single_source')::boolean, false),
        NULLIF(v_child->>'editorial_note', ''), COALESCE((v_child->>'sort_order')::int, 0)
      );
      v_n_e := v_n_e + 1;
    END LOOP;
  END LOOP;

  -- CONTENT-DÜZEYİ questions (section_id NULL) ----------------------------------
  FOR v_child IN SELECT * FROM jsonb_array_elements(COALESCE(p_content_questions, '[]'::jsonb)) LOOP
    INSERT INTO public.hd_consultation_questions (content_id, section_id, question_text, topic_scope, sort_order)
    VALUES (p_content_id, NULL, v_child->>'question_text', NULLIF(v_child->>'topic_scope', ''),
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
    VALUES (p_content_id, NULL, v_child->>'condition_kind', v_child->>'condition_value',
            COALESCE((v_child->>'sort_order')::int, 0));
    v_n_c := v_n_c + 1;
  END LOOP;

  -- Content version +1 (canonical pin DOKUNULMAZ; is_ai_generated DEĞİŞMEZ).
  v_new := v_cur + 1;
  UPDATE public.hd_consultation_contents
     SET version = v_new
   WHERE id = p_content_id;

  -- AUDIT (aynı txn; başarısızsa tüm işlem rollback; tam metin YOK, yalnız sayım)
  INSERT INTO public.hd_content_audit_events
    (actor_admin_id, action, resource_kind, resource_id, canonical_entity_id, canonical_key, changed_fields, context)
  VALUES (
    p_actor_admin_id, 'updated', 'consultation_content', p_content_id, v_entity, v_key,
    ARRAY['sections','questions','conditions','evidence'],
    jsonb_build_object(
      'from_version', v_cur, 'to_version', v_new, 'draft_body_replace', true,
      'section_count', v_n_sec, 'question_count', v_n_q, 'condition_count', v_n_c, 'evidence_count', v_n_e
    )
  );

  -- Deterministik sonuç: kimlikler + mapping + sayımlar (tam body/source metni YOK)
  RETURN jsonb_build_object(
    'content_id', p_content_id,
    'version', v_new,
    'section_map', v_map,
    'section_count', v_n_sec,
    'question_count', v_n_q,
    'condition_count', v_n_c,
    'evidence_count', v_n_e
  );
END
$fn$;

-- EXECUTE ACL: public/anon/authenticated REVOKE → yalnız service_role.
REVOKE ALL ON FUNCTION public.rpc_hd_consultation_edit_draft(uuid,uuid,integer,jsonb,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hd_consultation_edit_draft(uuid,uuid,integer,jsonb,jsonb,jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hd_consultation_edit_draft(uuid,uuid,integer,jsonb,jsonb,jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hd_consultation_edit_draft(uuid,uuid,integer,jsonb,jsonb,jsonb) TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma; beklenen):
--   SELECT count(*) FROM pg_proc WHERE proname='rpc_hd_consultation_edit_draft';  -- 1
--   has_function_privilege('anon','public.rpc_hd_consultation_edit_draft(uuid,uuid,integer,jsonb,jsonb,jsonb)','EXECUTE');          -- false
--   has_function_privilege('authenticated','public.rpc_hd_consultation_edit_draft(uuid,uuid,integer,jsonb,jsonb,jsonb)','EXECUTE'); -- false
--   has_function_privilege('service_role','public.rpc_hd_consultation_edit_draft(uuid,uuid,integer,jsonb,jsonb,jsonb)','EXECUTE');   -- true
-- Tablo/kolon/index/constraint DDL: YOK. hd_cc_one_active_per_entity_uidx: DOKUNULMADI.
-- hd_consultation_canonical_hash(uuid) ACL: DOKUNULMADI. Eski 6 RPC: DEĞİŞMEDİ.
-- ROLLBACK: destructive DOWN YOK; manuel geri alma = DROP FUNCTION
--   public.rpc_hd_consultation_edit_draft(uuid,uuid,integer,jsonb,jsonb,jsonb). Veri ETKİLENMEZ.
-- =============================================================================
